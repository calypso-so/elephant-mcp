import { z } from "zod";

import { emptyKnowledgeAnswer } from "../hatching/HatchingCopy.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  query: z.string().min(1).describe("What to look for."),
  agent: z
    .string()
    .optional()
    .describe(
      "Optional id of one of the team's Calypso agents, to search only what that agent can see. Not together with buckets.",
    ),
  buckets: z
    .array(z.string())
    .max(5)
    .optional()
    .describe(
      "Bucket ids or slugs (from elephant-list-buckets) to search directly, up to 5. Not together with agent.",
    ),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe("How many passages to return, 1 to 20 (default 10)."),
};

/** `elephant-search`: matching passages and their sources, no answer. */
export class SearchTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-search";
  readonly title = "Search Elephant";
  readonly description = [
    "Searches the team's Calypso knowledge and returns the matching passages and their sources, without writing an answer.",
    "",
    "Use it when the user wants the exact wording, quotes, or a list of where something is mentioned.",
    "Pass `buckets` (ids or slugs from elephant-list-buckets, up to 5) to search specific buckets, or `agent` to search what one Calypso agent can see — not both.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly annotations = {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  };
  protected readonly failure = "Searching Elephant failed.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, inventory, log }: ToolContext,
  ): Promise<ToolOutput> {
    if (args.agent?.trim() && args.buckets?.length) {
      throw new Error("Pass `agent` or `buckets`, not both.");
    }
    // Nothing to search yet: the hatch, not an empty result set.
    if ((await inventory.current())?.isEmpty) {
      await log.event("info", "Empty knowledge: answered with the hatch.", {
        tool: this.name,
        reason: "empty_knowledge",
      });
      return { text: emptyKnowledgeAnswer() };
    }
    const result = await api.search.search(args);
    await log.event("info", "Knowledge search completed.", {
      tool: this.name,
      strategy: result.strategy,
      resultCount: result.results.length,
    });
    return { json: result };
  }
}
