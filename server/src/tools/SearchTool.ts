import { z } from "zod";

import { SEARCH_DEPTHS } from "../calypso/AnswerDepth.js";
import { MAX_EXTRA_QUERIES } from "../calypso/KnowledgeSearch.js";

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
    .describe(
      "The most passages to return, 1 to 20 (default 10). A ceiling, not a target: a search returns as many passages as it finds.",
    ),
  depth: z
    .enum(SEARCH_DEPTHS)
    .optional()
    .describe(
      "`fast` (default) runs one search. `thorough` runs several in parallel and merges them: use it when a fast search came back with fewer passages than the question deserves, or when you are gathering evidence, not checking one fact.",
    ),
  alsoSearchFor: z
    .array(z.string().min(1))
    .max(MAX_EXTRA_QUERIES)
    .optional()
    .describe(
      `Up to ${MAX_EXTRA_QUERIES} other ways of saying the same thing, searched alongside \`query\` (this makes the search thorough). Write them as the document would: its own terms, a synonym, the specific item ("express delivery times", "international shipping days"). This is the strongest way to get more of a document back.`,
    ),
};

/** `elephant-search`: matching passages and their sources, no answer. */
export class SearchTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-search";
  readonly title = "Search Elephant";
  readonly description = [
    "Searches the team's Calypso knowledge and returns the matching passages and their sources, without writing an answer.",
    "",
    "Use it when the user wants the exact wording, quotes, or a list of where something is mentioned.",
    "Each result is a short quotation chosen from one matching passage, not the whole passage, and a short document is one passage. So one result does not mean the document says only that: it means one passage matched and this is the line picked from it.",
    'To get more of what is there, search again with `depth: "thorough"` and `alsoSearchFor` (other phrasings, or the specific items you expect), or narrow to `buckets`. To have the full content read and summarised, use elephant-ask instead.',
    "Pass `buckets` (ids or slugs from elephant-list-buckets, up to 5) to search specific buckets, or `agent` to search what one Calypso agent can see — not both.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
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
