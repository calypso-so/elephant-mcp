import type { CalypsoApiClient } from "./CalypsoApiClient.js";

export type BucketRename = {
  /** The bucket to change: its id or its slug. */
  bucket: string;
  name?: string;
  description?: string;
};

export type SourceMove = {
  sourceIds: string[];
  /** Bucket the sources are taken out of: id or slug. */
  fromBucket: string;
  /** Bucket the sources go into: id or slug. */
  toBucket: string;
};

export type SourceMoveResult = {
  bucket_id?: string;
  from_bucket_id?: string;
  moved: number;
  requested: number;
  /** One entry per source: `moved`, or why it was not. */
  sources: Array<{ id: string; status: string; detail?: string }>;
  request_id?: string;
};

/**
 * Reorganising what is already saved: a bucket's name and note, and which
 * bucket a source is filed in. Nothing here adds or deletes a source.
 */
export class BucketEdits {
  constructor(private readonly api: CalypsoApiClient) {}

  async rename(input: BucketRename): Promise<Record<string, unknown>> {
    const body = await this.api.request<Record<string, unknown> | null>(
      `/buckets/${encodeURIComponent(input.bucket.trim())}`,
      {
        method: "PATCH",
        body: {
          ...(input.name?.trim() ? { name: input.name.trim() } : {}),
          ...(typeof input.description === "string"
            ? { description: input.description.trim() }
            : {}),
        },
      },
    );
    return body ?? {};
  }

  /**
   * Moves sources into `toBucket`. The API adds each one there before taking
   * it out of `fromBucket`, so a source is never left in no bucket.
   */
  moveSources(input: SourceMove): Promise<SourceMoveResult> {
    return this.api.request<SourceMoveResult>(
      `/buckets/${encodeURIComponent(input.toBucket.trim())}/sources:move`,
      {
        method: "POST",
        body: {
          source_ids: input.sourceIds,
          from_bucket: input.fromBucket.trim(),
        },
      },
    );
  }
}
