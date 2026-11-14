import {
  buildKnowledgeBatchManifest,
  type UploadKnowledgeFilesBatchParams,
} from "./BatchManifest.js";
import type { CalypsoApiClient } from "./CalypsoApiClient.js";
import type { KnowledgeBatchObject } from "./knowledgeTypes.js";
import { pollUntilSettled } from "./polling.js";
import {
  DEFAULT_MIME_TYPE,
  decodeUploadContent,
  type UploadContent,
} from "./UploadContent.js";
import { putUploadBytes } from "./uploadBytes.js";

type BatchSessions = {
  batch_id: string;
  accepted?: Array<{ client_file_id: string; upload_url: string }>;
};

type FinalizedItem = {
  client_file_id?: string;
  knowledge_id?: string;
  task_id?: string;
  [key: string]: unknown;
};

type FinalizedBatch = {
  batch_id: string;
  status?: string;
  finalized?: FinalizedItem[];
  replayed?: FinalizedItem[];
  pending?: Array<Record<string, unknown>>;
  failed?: Array<Record<string, unknown>>;
  request_id?: string;
  [key: string]: unknown;
};

const TERMINAL_STATUSES = [
  "active",
  "partially_active",
  "partially_failed",
  "failed",
];

/**
 * Several files added to the team's Calypso knowledge in one request.
 *
 * A batch is its own resource with its own status, so a caller can add a
 * hundred files and follow one id instead of a hundred.
 */
export class KnowledgeBatches {
  constructor(private readonly api: CalypsoApiClient) {}

  async upload(
    params: UploadKnowledgeFilesBatchParams,
  ): Promise<KnowledgeBatchObject> {
    const { manifest, clientFileIds } = buildKnowledgeBatchManifest(params);
    // Decode everything first: a bad item must fail the call before any
    // session exists, not leave a half-uploaded batch behind.
    const contents = params.items.map(decodeUploadContent);

    const sessions = await this.openSessions(manifest, clientFileIds, contents);
    await this.sendBytes(sessions, clientFileIds, contents);
    const finalized = await this.api.request<FinalizedBatch>(
      `/knowledge/files:batch/upload-session/${encodeURIComponent(sessions.batch_id)}/finalize`,
      { method: "POST", body: { mode: "finalize_uploaded" } },
    );

    return params.waitForBatchReady === true
      ? this.waitUntilReady(finalized.batch_id)
      : summarizeFinalized(finalized);
  }

  /** The batch with its items. */
  async get(batchId: string): Promise<KnowledgeBatchObject> {
    const id = String(batchId || "").trim();
    if (!id) {
      throw new Error("batchId is required.");
    }
    return this.api.request(
      `/knowledge/batches/${encodeURIComponent(id)}?include_items=true`,
      { method: "GET" },
    );
  }

  /**
   * Polls until the batch stops changing. Running out of time is reported in
   * the result rather than thrown: the batch was accepted and will finish, so
   * the caller needs its id and progress, not an error.
   */
  async waitUntilReady(batchId: string): Promise<KnowledgeBatchObject> {
    const { last, settled } = await pollUntilSettled(
      () => this.get(batchId),
      isTerminal,
    );
    if (settled) return last;
    return {
      ...last,
      status: last.status || "timeout",
      message: describeBatchTimeout(batchId, last),
    };
  }

  private openSessions(
    manifest: Record<string, unknown>,
    clientFileIds: string[],
    contents: UploadContent[],
  ): Promise<BatchSessions> {
    const files = contents.map((content, index) => ({
      client_file_id: clientFileIds[index],
      filename: content.filename,
      content_type: content.mimeType || DEFAULT_MIME_TYPE,
      size_bytes: content.bytes.byteLength,
    }));
    return this.api.request("/knowledge/files:batch/upload-session", {
      method: "POST",
      body: { manifest, files },
    });
  }

  /** Items the API rejected have no session and are skipped. */
  private async sendBytes(
    sessions: BatchSessions,
    clientFileIds: string[],
    contents: UploadContent[],
  ): Promise<void> {
    const uploadUrls = new Map(
      (sessions.accepted || []).map((item) => [
        item.client_file_id,
        item.upload_url,
      ]),
    );
    for (const [index, clientFileId] of clientFileIds.entries()) {
      const uploadUrl = uploadUrls.get(clientFileId);
      if (uploadUrl) await putUploadBytes(uploadUrl, contents[index]);
    }
  }
}

function isTerminal(batch: KnowledgeBatchObject): boolean {
  const status = String(batch.status || "")
    .trim()
    .toLowerCase();
  return TERMINAL_STATUSES.includes(status);
}

/** What a caller gets back when it does not wait: one row per item. */
function summarizeFinalized(finalized: FinalizedBatch): KnowledgeBatchObject {
  const queued = finalized.finalized || [];
  const replayed = finalized.replayed || [];
  const failed = finalized.failed || [];
  return {
    id: finalized.batch_id,
    status: finalized.status,
    accepted: queued.length + replayed.length,
    rejected: failed.length,
    items: [
      ...queued.map((item) => trackedItem(item, "queued")),
      ...replayed.map((item) => trackedItem(item, "replayed")),
      ...(finalized.pending || []).map((item) => ({
        ...item,
        status: "pending",
      })),
      ...failed.map((item) => ({ ...item, status: "failed" })),
    ],
    request_id: finalized.request_id,
    upload_session_finalize: finalized,
  };
}

function trackedItem(item: FinalizedItem, status: string) {
  return {
    client_file_id: item.client_file_id,
    status,
    knowledgeId: item.knowledge_id,
    taskId: item.task_id,
  };
}

function describeBatchTimeout(
  batchId: string,
  batch: KnowledgeBatchObject,
): string {
  const count = (value: unknown) => Number(value || 0);
  return `Batch ${batchId} was accepted but did not finish before timeout. Last status: ${String(batch.status || "timeout")}. queued=${count(batch.queued)} indexing=${count(batch.indexing)} active=${count(batch.active)} failed=${count(batch.failed)}. The files may still finish; check the batch again later.`;
}
