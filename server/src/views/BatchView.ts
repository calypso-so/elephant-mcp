import {
  asRecord,
  numberOrUndefined,
  plainText,
  present,
  trimmedString,
} from "./viewFields.js";

export type PublicBatchFile = {
  /** The id the caller gave the item, to tell the files apart. */
  client_file_id?: string;
  /** The source's file id, once the file was accepted. */
  file_id?: string;
  filename?: string;
  status?: string;
  ready?: boolean;
  error?: string;
};

/** A batch of files, as the person who sent it may read it. */
export type PublicBatch = {
  id?: string;
  status?: string;
  message?: string;
  total?: number;
  accepted?: number;
  rejected?: number;
  queued?: number;
  indexing?: number;
  active?: number;
  failed?: number;
  files: PublicBatchFile[];
};

/**
 * How a batch upload went, file by file. The API's answer also carries the
 * upload sessions, task ids and index sync records; a view carries none.
 */
export class BatchView {
  private constructor(private readonly batch: Record<string, unknown>) {}

  static of(value: unknown): PublicBatch {
    return new BatchView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicBatch {
    const batch = this.batch;
    return present({
      id: trimmedString(batch.id) ?? trimmedString(batch.batch_id),
      status: trimmedString(batch.status),
      message: plainText(batch.message),
      total: numberOrUndefined(batch.total),
      accepted: numberOrUndefined(batch.accepted),
      rejected: numberOrUndefined(batch.rejected),
      queued: numberOrUndefined(batch.queued),
      indexing: numberOrUndefined(batch.indexing),
      active: numberOrUndefined(batch.active),
      failed: numberOrUndefined(batch.failed),
      files: (Array.isArray(batch.items) ? batch.items : []).map(
        BatchView.file,
      ),
    }) as PublicBatch;
  }

  private static file(value: unknown): PublicBatchFile {
    const item = asRecord(value) ?? {};
    const file = asRecord(item.file);
    const error = asRecord(item.error);
    return present({
      client_file_id:
        trimmedString(item.client_file_id) ?? trimmedString(item.clientFileId),
      file_id:
        trimmedString(item.knowledgeId) ??
        trimmedString(item.knowledge_id) ??
        trimmedString(file?.id),
      filename: trimmedString(item.filename) ?? trimmedString(file?.filename),
      status: trimmedString(item.canonicalStatus) ?? trimmedString(item.status),
      ready: typeof file?.ready === "boolean" ? file.ready : undefined,
      error: error
        ? (plainText(error.message) ?? plainText(error.code))
        : plainText(item.error),
    }) as PublicBatchFile;
  }
}
