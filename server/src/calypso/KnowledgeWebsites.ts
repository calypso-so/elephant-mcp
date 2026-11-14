import type { CalypsoApiClient } from "./CalypsoApiClient.js";

export type AddKnowledgeWebsiteInput = {
  url: string;
  title?: string;
  tagsHint?: string;
  preferredLanguage?: string;
  bucketIds?: string[];
  bucketSlugs?: string[];
  bucket?: string;
  createMissingBuckets?: boolean;
  idempotencyKey?: string;
};

export type KnowledgeWebsiteObject = {
  object?: string;
  knowledge_id?: string;
  team_id?: string;
  title?: string;
  tags?: string[];
  url?: string;
  summary?: string;
  ingestion_status?: string;
  bucket_assignment?: Record<string, unknown>;
  request_id?: string;
  [key: string]: unknown;
};

/** Web pages kept as knowledge in the team's buckets. */
export class KnowledgeWebsites {
  constructor(private readonly api: CalypsoApiClient) {}

  /**
   * Adds a page in one call (`POST /knowledge/websites`): Calypso reads it,
   * writes its title, summary and tags, and files it in the given buckets.
   *
   * The normalized URL identifies the website within a team, so adding the
   * same page twice is a conflict unless the same `Idempotency-Key` is sent,
   * in which case the existing website is returned.
   */
  async add(input: AddKnowledgeWebsiteInput): Promise<KnowledgeWebsiteObject> {
    const url = String(input.url || "").trim();
    if (!url) {
      throw new Error("A website `url` is required.");
    }
    const bucketSlugs = slugsOf(input);
    if (!(input.bucketIds?.length || bucketSlugs.length)) {
      throw new Error(
        "Website ingestion requires bucketIds, bucketSlugs, or bucket.",
      );
    }
    const title = input.title?.trim();
    const tagsHint = input.tagsHint?.trim();
    const preferredLanguage = input.preferredLanguage?.trim();
    const idempotencyKey = input.idempotencyKey?.trim();

    return this.api.request("/knowledge/websites", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      body: {
        url,
        ...(title ? { title } : {}),
        ...(tagsHint ? { tags_hint: tagsHint } : {}),
        ...(preferredLanguage ? { preferred_language: preferredLanguage } : {}),
        ...(input.bucketIds?.length ? { bucket_ids: input.bucketIds } : {}),
        ...(bucketSlugs.length ? { bucket_slugs: bucketSlugs } : {}),
        ...(input.createMissingBuckets === true
          ? { create_missing_buckets: true }
          : {}),
      },
    });
  }
}

/** This endpoint has no single-bucket field; the shortcut joins the slugs. */
function slugsOf(input: AddKnowledgeWebsiteInput): string[] {
  const bucket = input.bucket?.trim();
  return [...(input.bucketSlugs || []), ...(bucket ? [bucket] : [])].filter(
    (slug) => slug.trim().length > 0,
  );
}
