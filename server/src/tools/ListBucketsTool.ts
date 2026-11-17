import { z } from "zod";

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
};

/** `elephant-list-buckets`: what Elephant knows about, folder by folder. */
export class ListBucketsTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-list-buckets";
  readonly title = "List buckets";
  readonly description = [
    "Lists the team's knowledge buckets — folders of sources Elephant remembers — with their names, slugs, file counts and file ids.",
    "",
    "Use it to show the user what Elephant knows about, or to pick buckets before elephant-search.",
  ].join("\n");
  readonly inputSchema = inputSchema;
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
    await log.event("info", "Listed knowledge buckets.", {
      tool: this.name,
      bucketCount: list.buckets.length,
    });
    return { json: list };
  }
}
