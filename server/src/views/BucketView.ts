import type { BucketSource } from "../calypso/BucketSources.js";
import type { KnowledgeBucketDescriptor } from "../calypso/bucketList.js";
import {
  asRecord,
  numberOrUndefined,
  present,
  trimmedString,
} from "./viewFields.js";

/** A bucket, as its owner may read it. */
export type PublicBucket = {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  status?: string;
};

/** A bucket in a listing, with what it holds. */
export type PublicListedBucket = PublicBucket & {
  file_count?: number;
  source_count?: number;
  sources?: BucketSource[];
  /** The bucket holds more sources than the ones named. */
  moreSources?: boolean;
  /** The sources' ids, when their names were not asked for or did not load. */
  source_ids?: string[];
};

/**
 * A bucket's name, slug and note. The API's record also names the workspace,
 * who made the bucket and the index store behind it; a view carries none.
 */
export class BucketView {
  private constructor(private readonly bucket: Record<string, unknown>) {}

  static of(value: unknown): PublicBucket {
    return new BucketView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicBucket {
    const bucket = this.bucket;
    return present({
      id: trimmedString(bucket.id) ?? "",
      name: trimmedString(bucket.name),
      slug: trimmedString(bucket.slug),
      description: trimmedString(bucket.description),
      status: trimmedString(bucket.status),
    }) as PublicBucket;
  }

  static listed(
    bucket: KnowledgeBucketDescriptor,
    named?: { sources: BucketSource[]; moreSources?: boolean },
  ): PublicListedBucket {
    const ids = [...new Set([...bucket.knowledgeIds, ...bucket.fileIds])];
    return present({
      ...BucketView.of(bucket),
      file_count: numberOrUndefined(bucket.filesCount),
      source_count: numberOrUndefined(bucket.memberCount),
      sources: named?.sources,
      moreSources: named?.moreSources,
      source_ids: named || ids.length === 0 ? undefined : ids,
    }) as PublicListedBucket;
  }
}
