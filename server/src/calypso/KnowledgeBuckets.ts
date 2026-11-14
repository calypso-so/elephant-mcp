import {
  type KnowledgeBucketList,
  normalizeKnowledgeBucketList,
} from "./bucketList.js";
import type { CalypsoApiClient } from "./CalypsoApiClient.js";

export type CreateKnowledgeBucketInput = {
  name: string;
  slug?: string;
  description?: string;
  idempotencyKey?: string;
};

/** The team's knowledge buckets: the folders its sources are kept in. */
export class KnowledgeBuckets {
  constructor(private readonly api: CalypsoApiClient) {}

  async list(
    options: { includeArchived?: boolean } = {},
  ): Promise<KnowledgeBucketList> {
    const query = options.includeArchived ? "?include_archived=true" : "";
    const body = await this.api.request<unknown>(`/knowledge/buckets${query}`, {
      method: "GET",
    });
    return normalizeKnowledgeBucketList(body);
  }

  /** Creates an empty bucket; a slug already in use is refused by the API. */
  async create(
    input: CreateKnowledgeBucketInput,
  ): Promise<Record<string, unknown>> {
    const body = await this.api.request<Record<string, unknown> | null>(
      "/knowledge/buckets",
      {
        method: "POST",
        headers: input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {},
        body: {
          name: input.name,
          ...(input.slug ? { slug: input.slug } : {}),
          ...(input.description ? { description: input.description } : {}),
        },
      },
    );
    return body ?? {};
  }
}
