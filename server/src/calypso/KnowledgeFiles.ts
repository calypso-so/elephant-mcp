import {
  type BucketDestination,
  bucketFields,
  hasBucketDestination,
} from "./BucketDestination.js";
import type { CalypsoApiClient } from "./CalypsoApiClient.js";
import { compactStrings } from "./coerce.js";
import type {
  KnowledgeFileObject,
  KnowledgeTaskObject,
  KnowledgeUploadResult,
} from "./knowledgeTypes.js";
import { pollUntilSettled } from "./polling.js";
import {
  DEFAULT_MIME_TYPE,
  decodeUploadContent,
  type UploadContent,
} from "./UploadContent.js";
import { putUploadBytes } from "./uploadBytes.js";

export type UploadKnowledgeFileParams = BucketDestination & {
  filename?: string;
  mimeType?: string;
  /** The file's bytes, inline. Exactly one of this and `sourceUrl`. */
  contentBase64?: string;
  /** Public link Calypso fetches itself. */
  sourceUrl?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  waitForIndexing?: boolean;
};

type UploadSession = {
  session_id: string;
  upload_url: string;
};

type UrlImportResponse = {
  knowledge_id?: string;
  task_id?: string;
  title?: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  ingestion_status?: string;
  bucket_assignment?: Record<string, unknown>;
  request_id?: string;
};

const READY_STATUS = "indexed";
const FAILED_STATUSES = new Set(["failed", "deleted"]);
const ONE_SOURCE = "Provide exactly one of `contentBase64` or `sourceUrl`.";

/**
 * Single files in the team's Calypso knowledge: look one up, add one, and
 * wait for one to become answerable.
 */
export class KnowledgeFiles {
  constructor(private readonly api: CalypsoApiClient) {}

  /** `verify` also asks the index itself, which is slower but authoritative. */
  get(
    fileId: string,
    options: { verify?: boolean } = {},
  ): Promise<KnowledgeFileObject> {
    const query = options.verify ? "?verify=gemini" : "";
    return this.api.request(
      `/knowledge/files/${encodeURIComponent(fileId)}${query}`,
      { method: "GET" },
    );
  }

  /** Adds one file from inline bytes or from a public link. */
  async upload(
    params: UploadKnowledgeFileParams,
  ): Promise<KnowledgeUploadResult> {
    if (!hasBucketDestination(params)) {
      throw new Error(
        "Knowledge file uploads require bucketIds, bucketSlugs, or bucket.",
      );
    }
    const hasBytes = Boolean(params.contentBase64?.trim());
    if (params.sourceUrl?.trim()) {
      if (hasBytes) throw new Error(ONE_SOURCE);
      return this.importFromUrl({ ...params, sourceUrl: params.sourceUrl });
    }
    if (!hasBytes) throw new Error(ONE_SOURCE);

    const file = await this.uploadBytes(params, decodeUploadContent(params));
    return params.waitForIndexing === true
      ? this.waitUntilIndexed(file.id, file.task?.id || null)
      : { file, task: file.task || null };
  }

  /**
   * Has Calypso fetch a public file itself (`POST /knowledge/files/import-url`).
   *
   * The bytes never pass through this server, which is why a link is the
   * preferred source for anything already online.
   */
  async importFromUrl(
    params: UploadKnowledgeFileParams & { sourceUrl: string },
  ): Promise<KnowledgeUploadResult> {
    if (!hasBucketDestination(params)) {
      throw new Error(
        "Knowledge URL imports require bucketIds, bucketSlugs, or bucket.",
      );
    }
    const tags = compactStrings(params.tags);
    const imported = await this.api.request<UrlImportResponse>(
      "/knowledge/files/import-url",
      {
        method: "POST",
        headers: idempotencyHeader(params.idempotencyKey),
        body: {
          url: params.sourceUrl.trim(),
          ...(params.title?.trim() ? { title: params.title.trim() } : {}),
          // This endpoint takes tags as one comma-separated string.
          ...(tags ? { tags: tags.join(",") } : {}),
          ...bucketFields(params),
        },
      },
    );

    const result = importedFile(imported);
    return params.waitForIndexing === true && result.file.id
      ? this.waitUntilIndexed(result.file.id, result.task?.id)
      : result;
  }

  /** Polls until the file is indexed; throws if indexing fails or stalls. */
  async waitUntilIndexed(
    fileId: string,
    taskId?: string | null,
  ): Promise<KnowledgeUploadResult> {
    const { last, settled } = await pollUntilSettled(
      () => this.read(fileId, taskId),
      (result) => {
        const status = statusOf(result);
        if (FAILED_STATUSES.has(status)) {
          throw new Error(
            `Knowledge indexing entered terminal status \`${status}\`.`,
          );
        }
        return status === READY_STATUS;
      },
    );
    if (!settled) throw new Error(describeIndexingTimeout(last));
    return last;
  }

  /** Session, bytes, finalize: the three steps of a direct upload. */
  private async uploadBytes(
    params: UploadKnowledgeFileParams,
    content: UploadContent,
  ): Promise<KnowledgeFileObject> {
    const tags = compactStrings(params.tags);
    const session = await this.api.request<UploadSession>(
      "/knowledge/files/upload-session",
      {
        method: "POST",
        headers: idempotencyHeader(params.idempotencyKey),
        body: {
          filename: content.filename,
          content_type: content.mimeType || DEFAULT_MIME_TYPE,
          size_bytes: content.bytes.byteLength,
          ...(params.title?.trim() ? { title: params.title.trim() } : {}),
          ...(tags ? { tags } : {}),
          ...(params.metadata && Object.keys(params.metadata).length > 0
            ? { metadata: params.metadata }
            : {}),
          ...bucketFields(params),
        },
      },
    );
    await putUploadBytes(session.upload_url, content);
    return this.api.request(
      `/knowledge/files/upload-session/${encodeURIComponent(session.session_id)}/finalize`,
      { method: "POST", body: {} },
    );
  }

  private async read(
    fileId: string,
    taskId?: string | null,
  ): Promise<KnowledgeUploadResult> {
    const file = await this.get(fileId);
    const task = taskId ? await this.getTask(taskId) : file.task || null;
    return { file, task };
  }

  private getTask(taskId: string): Promise<KnowledgeTaskObject> {
    return this.api.request(`/knowledge/tasks/${encodeURIComponent(taskId)}`, {
      method: "GET",
    });
  }
}

function idempotencyHeader(key?: string): Record<string, string> {
  return key?.trim() ? { "Idempotency-Key": key.trim() } : {};
}

/** The import endpoint answers flat; tools return the same shape as uploads. */
function importedFile(imported: UrlImportResponse): KnowledgeUploadResult {
  const taskId = imported.task_id ? String(imported.task_id) : null;
  return {
    file: {
      id: String(imported.knowledge_id || ""),
      object: "knowledge_file",
      status: imported.ingestion_status,
      title: imported.title,
      filename: imported.filename,
      content_type: imported.mime_type,
      size_bytes: imported.size_bytes,
      request_id: imported.request_id,
      ...(imported.bucket_assignment
        ? { bucket_assignment: imported.bucket_assignment }
        : {}),
    },
    task: taskId ? { id: taskId, status: imported.ingestion_status } : null,
  };
}

function statusOf(result: KnowledgeUploadResult): string {
  return String(result.file.status || result.task?.status || "")
    .trim()
    .toLowerCase();
}

function describeIndexingTimeout(result: KnowledgeUploadResult): string {
  const fileId = result.file.id ? ` file_id=${result.file.id}` : "";
  const taskId = result.task?.id ? ` task_id=${result.task.id}` : "";
  const status = statusOf(result);
  const statusText = status ? ` Last status: ${status}.` : "";
  return `Upload accepted but indexing did not start or finish before timeout.${statusText} It may still finish; check the file again later.${fileId}${taskId}`;
}
