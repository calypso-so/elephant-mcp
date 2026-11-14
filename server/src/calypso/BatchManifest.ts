import { createHash } from "node:crypto";

import {
  type BucketDestination,
  bucketFields,
  hasBucketDestination,
} from "./BucketDestination.js";
import { compactStrings } from "./coerce.js";

export const BATCH_MAX_FILES = 100;
const CLIENT_FILE_ID_MAX_LENGTH = 128;

export type BatchItemParams = BucketDestination & {
  filename: string;
  mimeType: string;
  contentBase64?: string;
  clientFileId?: string;
  title?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export type UploadKnowledgeFilesBatchParams = BucketDestination & {
  items: BatchItemParams[];
  batchIdempotencyKey: string;
  waitForBatchReady?: boolean;
};

export type BatchManifest = {
  manifest: Record<string, unknown>;
  /** One id per item, in item order; how sessions are matched back to files. */
  clientFileIds: string[];
};

/**
 * Describes a batch to Calypso before any bytes move.
 *
 * Everything that can be refused without a network call is refused here, so a
 * batch of a hundred files does not fail on item ninety after uploading the
 * rest.
 */
export function buildKnowledgeBatchManifest(
  params: UploadKnowledgeFilesBatchParams,
): BatchManifest {
  if (!Array.isArray(params.items) || params.items.length === 0) {
    throw new Error("Batch upload requires at least one item.");
  }
  if (params.items.length > BATCH_MAX_FILES) {
    throw new Error(`Batch upload supports at most ${BATCH_MAX_FILES} files.`);
  }
  const batchIdempotencyKey = String(params.batchIdempotencyKey || "").trim();
  if (!batchIdempotencyKey) {
    throw new Error("batchIdempotencyKey is required for batch uploads.");
  }
  requireDestinations(params);

  const seen = new Set<string>();
  const clientFileIds = params.items.map((item, index) =>
    clientFileIdFor(item, index, seen),
  );
  return {
    clientFileIds,
    manifest: {
      version: 1,
      batch_idempotency_key: batchIdempotencyKey,
      ...bucketFields(params),
      items: params.items.map((item, index) =>
        manifestItem(item, clientFileIds[index]),
      ),
    },
  };
}

/** A shared destination covers every item; otherwise each needs its own. */
function requireDestinations(params: UploadKnowledgeFilesBatchParams): void {
  if (hasBucketDestination(params)) return;
  const missing = params.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !hasBucketDestination(item))
    .map(
      ({ item, index }) =>
        item.clientFileId || item.filename || `item ${index + 1}`,
    );
  if (missing.length > 0) {
    throw new Error(
      `Batch knowledge uploads require a shared bucket destination or a bucket destination on every item. Missing: ${missing.join(", ")}`,
    );
  }
}

function manifestItem(
  item: BatchItemParams,
  clientFileId: string,
): Record<string, unknown> {
  const tags = compactStrings(item.tags);
  return {
    client_file_id: clientFileId,
    filename: item.filename,
    ...(item.title?.trim() ? { title: item.title.trim() } : {}),
    ...(tags ? { tags } : {}),
    ...(item.metadata && Object.keys(item.metadata).length > 0
      ? { metadata: item.metadata }
      : {}),
    ...bucketFields(item),
  };
}

/**
 * The caller's id when given (validated), otherwise one derived from the file
 * name and position, so retrying the same batch yields the same ids and the
 * API can recognize the replay.
 */
function clientFileIdFor(
  item: BatchItemParams,
  index: number,
  seen: Set<string>,
): string {
  const explicit = String(item.clientFileId || "").trim();
  const id = explicit
    ? validatedClientFileId(explicit, seen)
    : derivedClientFileId(item, index, seen);
  seen.add(id);
  return id;
}

function validatedClientFileId(explicit: string, seen: Set<string>): string {
  if (
    explicit.length > CLIENT_FILE_ID_MAX_LENGTH ||
    explicit.startsWith("__") ||
    !/^[A-Za-z0-9_.-]+$/.test(explicit)
  ) {
    throw new Error("clientFileId must be Firestore-safe.");
  }
  if (seen.has(explicit)) {
    throw new Error("clientFileId values must be unique.");
  }
  return explicit;
}

function derivedClientFileId(
  item: BatchItemParams,
  index: number,
  seen: Set<string>,
): string {
  const digest = createHash("sha256")
    .update(`${index}:${item.filename}:`)
    .digest("hex")
    .slice(0, 16);
  let candidate = `${safeIdStem(item.filename || "file")}_${digest}`.slice(
    0,
    CLIENT_FILE_ID_MAX_LENGTH,
  );
  for (let suffix = 2; seen.has(candidate); suffix += 1) {
    const suffixText = `_${suffix}`;
    candidate = `${candidate.slice(0, CLIENT_FILE_ID_MAX_LENGTH - suffixText.length)}${suffixText}`;
  }
  return candidate;
}

function safeIdStem(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+/, "")
    .slice(0, 80);
  return sanitized || "file";
}
