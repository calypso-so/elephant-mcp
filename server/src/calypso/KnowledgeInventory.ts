import type { KnowledgeBucketList } from "./bucketList.js";
import { CalypsoApiClient } from "./CalypsoApiClient.js";
import type { CalypsoApiConfig } from "./CalypsoApiConfig.js";
import { KnowledgeBuckets } from "./KnowledgeBuckets.js";

/**
 * What the team has in Elephant right now, in the few numbers the hatching
 * copy and the empty-team short-circuit need. Derived from the bucket list
 * on every read; the server keeps no state of its own about a team.
 */
export type KnowledgeInventorySummary = {
  readonly bucketCount: number;
  /** Files across active buckets, by the most specific count the API gives. */
  readonly readyFileCount: number;
  /** Active bucket names, in the API's order, for example questions. */
  readonly bucketNames: readonly string[];
  /** No active bucket, or none with a file: nothing to answer from. */
  readonly isEmpty: boolean;
};

const EMPTY_SUMMARY: KnowledgeInventorySummary = Object.freeze({
  bucketCount: 0,
  readyFileCount: 0,
  bucketNames: [],
  isEmpty: true,
});

function isActive(status: string | undefined): boolean {
  return (status ?? "active").toLowerCase() === "active";
}

/** Pure: the summary of one bucket list. */
export function summarizeKnowledge(
  list: KnowledgeBucketList,
): KnowledgeInventorySummary {
  const active = list.buckets.filter((bucket) => isActive(bucket.status));
  const readyFileCount = active.reduce(
    (total, bucket) =>
      total +
      (bucket.retrievableFileCount ??
        bucket.fileCount ??
        bucket.filesCount ??
        bucket.fileIds.length),
    0,
  );
  const bucketNames = active
    .map((bucket) => bucket.name?.trim() ?? "")
    .filter((name) => name.length > 0);
  return {
    bucketCount: active.length,
    readyFileCount,
    bucketNames,
    isEmpty: active.length === 0 || readyFileCount === 0,
  };
}

// Read on the request path of every cold cache entry: a slow answer must
// degrade to "unknown" (normal instructions, no short-circuit), not stall.
const INVENTORY_TIMEOUT_MS = 2000;

/** Loads the summary for one caller; rejects when the API cannot be reached. */
export async function loadKnowledgeInventory(
  config: CalypsoApiConfig,
): Promise<KnowledgeInventorySummary> {
  const buckets = new KnowledgeBuckets(new CalypsoApiClient(config));
  const list = await Promise.race([
    buckets.list(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Knowledge inventory timed out.")),
        INVENTORY_TIMEOUT_MS,
      ).unref?.(),
    ),
  ]);
  return summarizeKnowledge(list);
}

/**
 * The inventory as a tool sees it in one request: seeded from the endpoint's
 * cache, re-read once when the seed says "empty" so a source added seconds
 * ago is not missed, and never read at all when there is no seed (the local
 * stdio server and the unit tests keep today's behaviour).
 */
export class KnowledgeInventory {
  private fresh: Promise<KnowledgeInventorySummary> | null = null;

  constructor(
    private readonly seed: KnowledgeInventorySummary | null,
    private readonly reload: () => Promise<KnowledgeBucketList>,
  ) {}

  /** The seed when it has knowledge; a fresh read when it is empty; null without a seed. */
  current(): Promise<KnowledgeInventorySummary | null> {
    if (!this.seed) return Promise.resolve(null);
    if (!this.seed.isEmpty) return Promise.resolve(this.seed);
    this.fresh ??= this.reload()
      .then(summarizeKnowledge)
      .catch(() => this.seed ?? EMPTY_SUMMARY);
    return this.fresh;
  }
}

export { EMPTY_SUMMARY as EMPTY_KNOWLEDGE_INVENTORY };
