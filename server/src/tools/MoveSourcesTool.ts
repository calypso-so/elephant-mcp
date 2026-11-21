import { z } from "zod";

import { ToolGroup } from "../presets/ToolGroup.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

/** The API moves at most this many sources in one request. */
const MAX_SOURCES = 100;

const inputSchema = {
  sourceIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_SOURCES)
    .describe(
      "Ids of the sources to move, from elephant-list-buckets. Up to 100.",
    ),
  fromBucket: z
    .string()
    .min(1)
    .describe("The bucket the sources are in now: its id or slug."),
  toBucket: z
    .string()
    .min(1)
    .describe("The bucket the sources go to: its id or slug. It must exist."),
};

/** `elephant-move-sources`: the same sources, filed in another bucket. */
export class MoveSourcesTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-move-sources";
  readonly title = "Move sources";
  readonly description = [
    "Moves sources from one bucket to another. Each source is added to the destination first and only then taken out of the bucket it came from, so it is never left without a bucket. Files are not deleted or uploaded again.",
    "",
    "Use it when the user wants to refile sources: split a bucket, tidy up, or put a file where it belongs.",
    "Before calling, name the sources and both buckets to the user. The destination must already exist: create it with elephant-create-bucket if this connection can.",
    "The result lists each source with what happened: `moved`, `not_in_source_bucket` (it was never in `fromBucket`), `not_found`, `not_added`, or `added_not_removed` (now in both buckets). Report anything that is not `moved`; do not say everything moved when it did not.",
    "A moved source is searchable in its new bucket once indexing there finishes, usually within a minute.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly group = ToolGroup.organise;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  protected readonly failure = "Moving the sources failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    if (args.fromBucket.trim() === args.toBucket.trim()) {
      throw new Error("`fromBucket` and `toBucket` are the same bucket.");
    }
    const result = await api.bucketEdits.moveSources({
      sourceIds: [...new Set(args.sourceIds.map((id) => id.trim()))],
      fromBucket: args.fromBucket,
      toBucket: args.toBucket,
    });
    await log.event("notice", "Sources moved.", {
      tool: this.name,
      requested: result.requested,
      moved: result.moved,
    });
    return { json: result };
  }
}
