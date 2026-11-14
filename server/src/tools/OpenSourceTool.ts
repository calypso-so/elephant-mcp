import { z } from "zod";

import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  fileId: z
    .string()
    .min(1)
    .describe("The source's file id, as listed by elephant-list-buckets."),
  verify: z
    .boolean()
    .optional()
    .describe(
      "If true, double-check the source's indexing status with the index itself. Slower.",
    ),
};

/** `elephant-open-source`: one source's details and readiness. */
export class OpenSourceTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-open-source";
  readonly title = "Open a source";
  readonly description = [
    "Returns one source's details by file id: name, type, size and whether it is ready to answer from.",
    "",
    "Use it when the user asks about a specific source cited in an answer or listed by elephant-list-buckets.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly annotations = {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Opening the source failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api }: ToolContext,
  ): Promise<ToolOutput> {
    return { json: await api.files.get(args.fileId, { verify: args.verify }) };
  }
}
