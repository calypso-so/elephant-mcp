import { randomUUID } from "node:crypto";
import { z } from "zod";
import { BATCH_MAX_FILES } from "../calypso/BatchManifest.js";
import { countBucketTargets } from "../calypso/BucketDestination.js";
import { ToolGroup } from "../presets/ToolGroup.js";
import { BatchView } from "../views/BatchView.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import { bucketDestinationInputs } from "./schemaParts.js";
import type { ToolContext } from "./ToolContext.js";

const itemSchema = z.object({
  filename: z.string().describe("File name to show for this source."),
  mimeType: z.string().describe("Content type of this file."),
  contentBase64: z.string().describe("The file's bytes as base64."),
  clientFileId: z
    .string()
    .optional()
    .describe(
      "Optional id of your own for this item, to match results to files. Generated when omitted.",
    ),
  title: z
    .string()
    .optional()
    .describe("Optional human-readable title for this source."),
  tags: z
    .array(z.string())
    .optional()
    .describe("Optional tags for this source."),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional extra fields stored with this source."),
  ...bucketDestinationInputs,
});

const inputSchema = {
  items: z
    .array(itemSchema)
    .min(1)
    .max(BATCH_MAX_FILES)
    .describe(`The files to add, 1 to ${BATCH_MAX_FILES}.`),
  batchIdempotencyKey: z
    .string()
    .optional()
    .describe(
      "Optional key that makes a retry of the whole batch return the first result. Generated when omitted.",
    ),
  ...bucketDestinationInputs,
  waitForBatchReady: z
    .boolean()
    .optional()
    .describe(
      "If true, wait until every file is ready (or has failed) before returning.",
    ),
};

/** `elephant-add-files`: up to a hundred files in one request. */
export class AddFilesTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-add-files";
  readonly title = "Add files";
  readonly description = [
    `Adds 1 to ${BATCH_MAX_FILES} files to knowledge buckets in one request.`,
    "",
    "Each item carries its bytes as `contentBase64`. A shared bucket applies to every item unless an item names its own.",
    "For a single file the user attached, use elephant-add-file instead.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly group = ToolGroup.add;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Adding the files failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    // A model rarely has a natural retry key, so one is made up per call.
    // Callers that retry across calls pass their own stable key.
    const batchIdempotencyKey =
      args.batchIdempotencyKey?.trim() || `elephant-batch-${randomUUID()}`;
    await log.event("info", "Adding a batch of files to knowledge.", {
      tool: this.name,
      itemCount: args.items.length,
      sharedBucketCount: countBucketTargets(args),
      waitForBatchReady: args.waitForBatchReady === true,
    });
    const batch = await api.batches.upload({ ...args, batchIdempotencyKey });
    await log.event("info", "Batch accepted.", {
      tool: this.name,
      batchId: batch.id ?? null,
      status: batch.status ?? null,
    });
    return { json: BatchView.of(batch) };
  }
}
