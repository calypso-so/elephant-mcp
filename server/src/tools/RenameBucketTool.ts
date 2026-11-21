import { z } from "zod";

import { ToolGroup } from "../presets/ToolGroup.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  bucket: z
    .string()
    .min(1)
    .describe(
      "The bucket to change: its id or slug, from elephant-list-buckets.",
    ),
  name: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe("The bucket's new name."),
  description: z
    .string()
    .max(500)
    .optional()
    .describe("A new note on what the bucket holds."),
};

/** `elephant-rename-bucket`: a bucket's name and note, nothing in it. */
export class RenameBucketTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-rename-bucket";
  readonly title = "Rename a bucket";
  readonly description = [
    "Changes a bucket's name, its description, or both. The sources in the bucket, their indexing and the bucket's slug stay as they are.",
    "",
    "Use it when the user wants a bucket called something else or wants to note what it holds.",
    "Find the bucket with elephant-list-buckets first, and tell the user the old and the new name. Pass at least one of `name` and `description`.",
    "It does not move, add or delete anything: to move sources use elephant-move-sources.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly group = ToolGroup.organise;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  protected readonly failure = "Renaming the bucket failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    if (!args.name?.trim() && typeof args.description !== "string") {
      throw new Error("Pass a new `name`, a new `description`, or both.");
    }
    const bucket = await api.bucketEdits.rename(args);
    await log.event("notice", "Bucket renamed.", {
      tool: this.name,
      bucketId: typeof bucket.id === "string" ? bucket.id : null,
    });
    return { json: bucket };
  }
}
