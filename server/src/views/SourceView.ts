import {
  asRecord,
  bucketIds,
  numberOrUndefined,
  plainText,
  present,
  trimmedString,
} from "./viewFields.js";

/** One source, as its owner may read it. */
export type PublicSource = {
  id: string;
  title?: string;
  filename?: string;
  content_type?: string;
  size_bytes?: number;
  /** Where the source is on its way to being answerable. */
  status?: string;
  /** Indexed and answerable right now. */
  ready: boolean;
  /** The buckets the source is filed in. */
  bucket_ids?: string[];
  created_at?: string;
  updated_at?: string;
  /** Why the source could not be indexed, when it could not. */
  failure?: string;
  /** Present when the index itself was asked (`verify`). */
  index_check?: { in_index: boolean; checked_at?: string };
};

/** A source just added, with how far its indexing has come. */
export type PublicAddedSource = {
  file: PublicSource;
  indexing_status?: string;
};

const READY_STATUSES = new Set(["active", "indexed"]);

/**
 * A file's details and readiness (`GET /knowledge/files/{id}` and what an
 * upload answers). The API's record also says which key added the file and
 * where it sits in the index; a view carries neither.
 */
export class SourceView {
  private constructor(private readonly file: Record<string, unknown>) {}

  static of(value: unknown): PublicSource {
    return new SourceView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicSource {
    const file = this.file;
    const status = trimmedString(file.status);
    return present({
      id: trimmedString(file.id) ?? "",
      title: trimmedString(file.title),
      filename: trimmedString(file.filename),
      content_type: trimmedString(file.content_type),
      size_bytes: numberOrUndefined(file.size_bytes),
      status,
      ready:
        typeof file.ready === "boolean"
          ? file.ready
          : READY_STATUSES.has(status ?? ""),
      bucket_ids: bucketIds(asRecord(file.bucket_assignment)?.assigned),
      created_at: trimmedString(file.created_at),
      updated_at: trimmedString(file.updated_at),
      failure: SourceView.failure(file.failure_details),
      index_check: SourceView.indexCheck(file.gemini),
    }) as PublicSource;
  }

  /** What `elephant-add-file` answers: the file, and its indexing status. */
  static added(value: { file?: unknown; task?: unknown }): PublicAddedSource {
    return present({
      file: SourceView.of(value.file),
      indexing_status: trimmedString(asRecord(value.task)?.status),
    }) as PublicAddedSource;
  }

  private static failure(value: unknown): string | undefined {
    const details = asRecord(value);
    if (!details) return undefined;
    return (
      plainText(details.message) ??
      plainText(details.reason) ??
      plainText(details.code)
    );
  }

  /** Whether the index holds the source in every bucket it is filed in. */
  private static indexCheck(value: unknown): PublicSource["index_check"] {
    const check = asRecord(value);
    if (!check) return undefined;
    const documents = (
      Array.isArray(check.documents) ? check.documents : []
    ).map((document) => asRecord(document));
    return present({
      in_index:
        documents.length > 0 &&
        documents.every((document) => document?.exists === true),
      checked_at: trimmedString(check.verifiedAt),
    }) as PublicSource["index_check"];
  }
}
