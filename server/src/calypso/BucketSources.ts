import type { CalypsoApiClient } from "./CalypsoApiClient.js";
import { asRecord, numberOrUndefined, trimmedString } from "./coerce.js";

/** One source in a bucket, as a person would name it. */
export type BucketSource = {
  id: string;
  name: string;
  type: string;
  /** Indexed and answerable. */
  ready: boolean;
};

export type BucketSourcePage = {
  sources: BucketSource[];
  /** How many sources the bucket holds in all. */
  total: number;
  hasMore: boolean;
};

/** The most sources named per bucket in one listing. */
export const SOURCES_PER_BUCKET = 50;

/**
 * What is inside a bucket (`GET /buckets/{id}/sources`): the names behind the
 * ids a bucket listing carries, so a file can be called by its name before
 * any answer has cited it.
 */
export class BucketSources {
  constructor(private readonly api: CalypsoApiClient) {}

  async firstPage(bucketId: string): Promise<BucketSourcePage> {
    const body = await this.api.request<unknown>(
      `/buckets/${encodeURIComponent(bucketId)}/sources?limit=${SOURCES_PER_BUCKET}`,
      { method: "GET" },
    );
    const raw = asRecord(body) ?? {};
    const sources = (Array.isArray(raw.sources) ? raw.sources : [])
      .map(BucketSources.source)
      .filter((source): source is BucketSource => source !== null);
    return {
      sources,
      total: numberOrUndefined(raw.total) ?? sources.length,
      hasMore: raw.has_more === true,
    };
  }

  private static source(value: unknown): BucketSource | null {
    const raw = asRecord(value);
    const id = trimmedString(raw?.id);
    if (!raw || !id) return null;
    return {
      id,
      name: trimmedString(raw.title) ?? id,
      type: trimmedString(raw.type) ?? "file",
      ready: raw.ready === true,
    };
  }
}
