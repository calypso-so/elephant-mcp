import {
  asRecord,
  numberOrUndefined,
  trimmedString,
  uniqueStrings,
} from "./coerce.js";

export type KnowledgeBucketStoreState = {
  alias?: string | null;
  gemini_store_name?: string | null;
  status?: string;
  file_count?: number;
  indexed_file_count?: number;
  pending_file_count?: number;
  member_count?: number;
  indexed_member_count?: number;
  pending_member_count?: number;
  last_synced_at?: unknown;
  last_error?: string | null;
};

export type KnowledgeBucketDescriptor = {
  id: string;
  teamId?: string;
  slug?: string;
  name?: string;
  description?: string | null;
  status?: string;
  knowledgeIds: string[];
  fileIds: string[];
  fileKnowledgeIds: string[];
  filesCount?: number;
  memberCount?: number;
  rawMemberCount?: number;
  fileCount?: number;
  retrievableFileCount?: number;
  staleMemberCount?: number;
  activeNonFileMemberCount?: number;
  counts: Record<string, number>;
  bucketStore?: KnowledgeBucketStoreState | null;
};

export type KnowledgeBucketList = {
  team_id: string;
  buckets: KnowledgeBucketDescriptor[];
  request_id?: string;
};

/**
 * Reads a bucket listing into a stable shape.
 *
 * The listing is what a model reads to choose buckets and file ids, so it is
 * normalized rather than passed through: blank and duplicate entries are
 * dropped, and the two names the API has used for a bucket's files
 * (`fileIds`, formerly `fileKnowledgeIds`) are both filled from whichever is
 * present.
 */
export function normalizeKnowledgeBucketList(
  value: unknown,
): KnowledgeBucketList {
  const raw = asRecord(value);
  if (!raw) {
    throw new Error("Bucket listing response must be a JSON object.");
  }
  const byId = new Map<string, KnowledgeBucketDescriptor>();
  for (const item of Array.isArray(raw.buckets) ? raw.buckets : []) {
    const bucket = normalizeBucket(item);
    if (bucket && !byId.has(bucket.id)) byId.set(bucket.id, bucket);
  }
  return {
    team_id: String(raw.team_id || "").trim(),
    buckets: [...byId.values()],
    request_id: trimmedString(raw.request_id),
  };
}

function normalizeBucket(value: unknown): KnowledgeBucketDescriptor | null {
  const raw = asRecord(value);
  const id = String(raw?.id || "").trim();
  if (!raw || !id) return null;

  const fileIds = uniqueStrings(raw.fileIds);
  const fileKnowledgeIds = uniqueStrings(raw.fileKnowledgeIds);
  return {
    id,
    teamId: trimmedString(raw.teamId),
    slug: trimmedString(raw.slug),
    name: trimmedString(raw.name),
    description: trimmedString(raw.description) ?? null,
    status: trimmedString(raw.status),
    knowledgeIds: uniqueStrings(raw.knowledgeIds),
    fileIds: fileIds.length > 0 ? fileIds : fileKnowledgeIds,
    fileKnowledgeIds: fileKnowledgeIds.length > 0 ? fileKnowledgeIds : fileIds,
    filesCount:
      numberOrUndefined(raw.filesCount) ?? numberOrUndefined(raw.fileCount),
    memberCount: numberOrUndefined(raw.memberCount),
    rawMemberCount: numberOrUndefined(raw.rawMemberCount),
    fileCount: numberOrUndefined(raw.fileCount),
    retrievableFileCount: numberOrUndefined(raw.retrievableFileCount),
    staleMemberCount: numberOrUndefined(raw.staleMemberCount),
    activeNonFileMemberCount: numberOrUndefined(raw.activeNonFileMemberCount),
    counts: finiteNumbers(raw.counts),
    bucketStore: normalizeBucketStore(raw.bucketStore),
  };
}

function normalizeBucketStore(
  value: unknown,
): KnowledgeBucketStoreState | null {
  const raw = asRecord(value);
  if (!raw) return null;
  return {
    alias: typeof raw.alias === "string" ? raw.alias : null,
    gemini_store_name:
      typeof raw.gemini_store_name === "string" ? raw.gemini_store_name : null,
    status: trimmedString(raw.status),
    file_count: numberOrUndefined(raw.file_count),
    indexed_file_count: numberOrUndefined(raw.indexed_file_count),
    pending_file_count: numberOrUndefined(raw.pending_file_count),
    member_count: numberOrUndefined(raw.member_count),
    indexed_member_count: numberOrUndefined(raw.indexed_member_count),
    pending_member_count: numberOrUndefined(raw.pending_member_count),
    last_synced_at: raw.last_synced_at,
    last_error: typeof raw.last_error === "string" ? raw.last_error : null,
  };
}

function finiteNumbers(value: unknown): Record<string, number> {
  const entries = Object.entries(asRecord(value) ?? {}).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]),
  );
  return Object.fromEntries(entries);
}
