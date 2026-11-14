import { z } from "zod";

import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import { idempotencyKeyInput } from "./schemaParts.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  name: z.string().min(1).max(120).describe("The bucket's name."),
  slug: z
    .string()
    .optional()
    .describe(
      "Optional short id for the bucket, used to add to it later. Made from the name when left out; a slug already in use is refused as `bucket_slug_exists`.",
    ),
  description: z
    .string()
    .optional()
    .describe("Optional note on what the bucket holds."),
  idempotencyKey: idempotencyKeyInput,
};

const outputSchema = {
  id: z.string().optional(),
  name: z.string().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
};

/** `elephant-create-bucket`: a new, empty folder of sources. */
export class CreateBucketTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-create-bucket";
  readonly title = "Create a bucket";
  readonly description = [
    "Creates a new knowledge bucket (a folder of sources) for the team.",
    "",
    "Use it when the user wants to keep a new topic separate before adding files or websites.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly outputSchema = outputSchema;
  readonly annotations = {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Creating the bucket failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, log }: ToolContext,
  ): Promise<ToolOutput> {
    const bucket = await api.buckets.create(args);
    await log.event("notice", "Bucket created.", {
      tool: this.name,
      bucketId: typeof bucket.id === "string" ? bucket.id : null,
    });
    return {
      json: bucket,
      structured: CreateBucketTool.declaredFields(bucket),
    };
  }

  /**
   * Structured output is checked strictly against `outputSchema`, but the
   * API adds fields over time. Only the declared fields go in the structured
   * part; the full payload stays in the text.
   */
  private static declaredFields(
    bucket: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.fromEntries(
      Object.keys(outputSchema)
        .filter((field) => bucket[field] !== undefined)
        .map((field) => [field, bucket[field]]),
    );
  }
}
