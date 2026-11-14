import { compactStrings } from "./coerce.js";

/**
 * Where an upload goes: bucket ids, bucket slugs, or one slug as a shortcut.
 *
 * Every write needs a destination, because knowledge outside a bucket cannot
 * be searched or asked about.
 */
export type BucketDestination = {
  bucketIds?: string[];
  bucketSlugs?: string[];
  bucket?: string;
  createMissingBuckets?: boolean;
};

export function hasBucketDestination(source: BucketDestination): boolean {
  return Boolean(
    compactStrings(source.bucketIds) ||
      compactStrings(source.bucketSlugs) ||
      String(source.bucket || "").trim(),
  );
}

/** How many destinations were named; a count is safe to log, names are not. */
export function countBucketTargets(source: BucketDestination): number {
  return (
    (source.bucketIds?.length || 0) +
    (source.bucketSlugs?.length || 0) +
    (source.bucket ? 1 : 0)
  );
}

/** The destination as the snake_case fields the upload endpoints take. */
export function bucketFields(
  source: BucketDestination,
): Record<string, unknown> {
  const bucketIds = compactStrings(source.bucketIds);
  const bucketSlugs = compactStrings(source.bucketSlugs);
  const bucket = String(source.bucket || "").trim();
  return {
    ...(bucketIds ? { bucket_ids: bucketIds } : {}),
    ...(bucketSlugs ? { bucket_slugs: bucketSlugs } : {}),
    ...(bucket ? { bucket } : {}),
    ...(typeof source.createMissingBuckets === "boolean"
      ? { create_missing_buckets: source.createMissingBuckets }
      : {}),
  };
}
