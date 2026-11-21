import { z } from "zod";
import type { BucketSource } from "../calypso/BucketSources.js";
import type { KnowledgeBucketDescriptor } from "../calypso/bucketList.js";
import type { CalypsoApi } from "../calypso/CalypsoApi.js";
import { ToolGroup } from "../presets/ToolGroup.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  includeArchived: z
    .boolean()
    .optional()
    .describe("If true, also list archived buckets. Defaults to false."),
  includeSources: z
    .boolean()
    .optional()
    .describe(
      "Name the sources in each bucket (id, name, type, ready). Defaults to true; pass false for counts only.",
    ),
};

/** A bucket with the sources in it named, where they could be read. */
type BucketWithSources = KnowledgeBucketDescriptor & {
  sources?: BucketSource[];
  /** True when the bucket holds more sources than were named. */
  moreSources?: boolean;
};

/** `elephant-list-buckets`: what Elephant knows about, folder by folder. */
export class ListBucketsTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-list-buckets";
  readonly title = "List buckets";
  readonly description = [
    "Lists the team's knowledge buckets — folders of sources Elephant remembers — with their names, slugs, file counts and the sources in each (id, name, type, and whether it is ready to answer from).",
    "",
    "Use it to show the user what Elephant knows about, to pick buckets before elephant-search, or to find a source's id by its name.",
    "Call a source by its name when you tell the user about it. `moreSources: true` means the bucket holds more than the ones named.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly group = ToolGroup.read;
  readonly annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  protected readonly failure = "Listing the team's buckets failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    const list = await api.buckets.list({
      includeArchived: args.includeArchived,
    });
    const buckets =
      args.includeSources === false
        ? list.buckets
        : await Promise.all(
            list.buckets.map((bucket) => ListBucketsTool.named(api, bucket)),
          );
    await log.event("info", "Listed knowledge buckets.", {
      tool: this.name,
      bucketCount: list.buckets.length,
    });
    return { json: { ...list, buckets } };
  }

  /**
   * The bucket with its sources named. A bucket whose sources cannot be read
   * is returned as it was: the names are a help, and a listing that fails
   * because one bucket's names did not load would be worse than ids alone.
   */
  private static async named(
    api: CalypsoApi,
    bucket: KnowledgeBucketDescriptor,
  ): Promise<BucketWithSources> {
    if (bucket.knowledgeIds.length === 0 && bucket.fileIds.length === 0) {
      return { ...bucket, sources: [] };
    }
    try {
      const page = await api.bucketSources.firstPage(bucket.id);
      return { ...bucket, sources: page.sources, moreSources: page.hasMore };
    } catch {
      return bucket;
    }
  }
}
