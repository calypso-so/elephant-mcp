import { z } from "zod";

import { AgentResponses } from "../calypso/AgentResponses.js";
import { compactStrings } from "../calypso/coerce.js";
import { emptyKnowledgeAnswer } from "../hatching/HatchingCopy.js";
import {
  ElephantTool,
  type ToolArgs,
  type ToolOutput,
} from "./ElephantTool.js";
import type { ToolContext } from "./ToolContext.js";

const inputSchema = {
  prompt: z
    .string()
    .min(1)
    .describe(
      "The user's question, with any context or format they asked for.",
    ),
  fileIds: z
    .array(z.string())
    .optional()
    .describe(
      "Optional file ids (from elephant-list-buckets) to focus the answer on specific sources.",
    ),
  model: z
    .string()
    .optional()
    .describe(
      "Optional id of one of the team's Calypso agents. Omit to use the team's default agent.",
    ),
};

/** `elephant-ask`: a cited answer written from the team's knowledge. */
export class AskTool extends ElephantTool<typeof inputSchema> {
  readonly name = "elephant-ask";
  readonly title = "Ask Elephant";
  readonly description = [
    "Answers a question from the team's Calypso knowledge (documents, websites, images and other sources the team has added), with citations.",
    "",
    "Use it when the user asks about their own company, product, policies, documents or anything their team keeps in Calypso.",
    "Always cite the sources the answer returns. If the answer says the knowledge does not cover the question, say so plainly instead of answering from general knowledge.",
    "Each call stands alone: put everything needed to answer, including the subject of a follow-up, in the prompt.",
    "Optional `model` picks one of the team's Calypso agents; omit it to use the default.",
    "When the team has no knowledge yet, the answer says so and how to add a first source; relay it, do not answer from general knowledge.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  protected readonly failure = "Elephant could not answer.";

  protected async run(
    args: ToolArgs<typeof inputSchema>,
    { api, agents, inventory, log }: ToolContext,
  ): Promise<ToolOutput> {
    // An empty team gets the hatch, never an apology from an agent with
    // nothing to retrieve. Only when the inventory is known (hosted server).
    if ((await inventory.current())?.isEmpty) {
      await log.event("info", "Empty knowledge: answered with the hatch.", {
        tool: this.name,
        reason: "empty_knowledge",
      });
      return { text: emptyKnowledgeAnswer() };
    }
    const agentId = agents.resolve(args.model);
    const fileIds = compactStrings(args.fileIds);
    const conversationId = AgentResponses.newConversationId();
    await log.event("info", "Asking a Calypso agent.", {
      tool: this.name,
      agent: agentId,
      conversationId,
      fileCount: fileIds?.length ?? 0,
    });

    const answer = await api.agent.ask({
      agentId,
      prompt: args.prompt.trim(),
      fileIds,
      conversationId,
    });

    await log.event("info", "Calypso agent answered.", {
      tool: this.name,
      agent: agentId,
      responseId: answer.responseId,
      textLength: answer.text.length,
    });
    return { text: answer.text };
  }
}
