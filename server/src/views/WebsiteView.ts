import {
  asRecord,
  bucketIds,
  plainText,
  present,
  trimmedString,
} from "./viewFields.js";

/** A saved web page, as its owner may read it. */
export type PublicWebsite = {
  /** The page's file id, usable with `elephant-open-source`. */
  id?: string;
  title?: string;
  url?: string;
  summary?: string;
  tags?: string[];
  status?: string;
  bucket_ids?: string[];
  /** Buckets made for this page because they did not exist yet. */
  created_bucket_ids?: string[];
};

/** What saving a web page answers, without the workspace or request ids. */
export class WebsiteView {
  private constructor(private readonly website: Record<string, unknown>) {}

  static of(value: unknown): PublicWebsite {
    return new WebsiteView(asRecord(value) ?? {}).fields();
  }

  private fields(): PublicWebsite {
    const website = this.website;
    const assignment = asRecord(website.bucket_assignment);
    const tags = (Array.isArray(website.tags) ? website.tags : [])
      .map((tag) => trimmedString(tag))
      .filter((tag): tag is string => Boolean(tag));
    return present({
      id: trimmedString(website.knowledge_id) ?? trimmedString(website.id),
      title: trimmedString(website.title),
      url: trimmedString(website.url),
      summary: plainText(website.summary),
      tags: tags.length ? tags : undefined,
      status:
        trimmedString(website.ingestion_status) ??
        trimmedString(website.status),
      bucket_ids: bucketIds(assignment?.assigned),
      created_bucket_ids: bucketIds(assignment?.created),
    }) as PublicWebsite;
  }
}
