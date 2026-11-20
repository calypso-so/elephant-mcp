import { z } from "zod";

import { AgentResponses } from "../calypso/AgentResponses.js";
import { ANSWER_DEPTHS, AnswerDepth } from "../calypso/AnswerDepth.js";
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
  depth: z
    .enum(ANSWER_DEPTHS)
    .optional()
    .describe(
      [
        "How much work the answer is worth. Omit it for the agent's own default.",
        "`fast`: a lookup of one stated fact (a price, a date, a limit); a few seconds.",
        "`balanced`: an explanation or summary that draws on a few passages; around 20 seconds.",
        "`deep`: comparing or reconciling several sources, or an answer someone will act on; the slowest.",
        "Start at the lowest depth that fits the question and raise it only on a retry.",
      ].join(" "),
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
    "Optional `depth` (`fast`, `balanced`, `deep`) sets how much work the answer gets. Choose it from the question, not from habit: `fast` for one stated fact, `balanced` for an explanation or summary, `deep` when several sources must be compared or the answer will be acted on. The reply ends by naming the depth it was answered at.",
    "If an answer is thin, misses part of the question, or says the knowledge does not cover something the user expects to be there, ask once more one depth higher before telling the user it is not covered. Do not repeat a call at the same depth, and do not go above `deep`.",
    "A team's plan may cap depth; when the reply says it was answered at a lower depth than asked, that is the most this team allows, so do not retry higher.",
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
    const asked = AnswerDepth.named(args.depth);
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
      depth: asked,
    });

    await log.event("info", "Calypso agent answered.", {
      tool: this.name,
      agent: agentId,
      responseId: answer.responseId,
      textLength: answer.text.length,
      sourceCount: answer.sources.count,
      depthAsked: asked?.name,
      depthUsed: answer.depth?.name,
    });
    // The API reports sources beside the text, not in it. Without this block
    // a correct, grounded answer reaches the client looking uncited.
    const sources = AskTool.namesItsSources(answer.text)
      ? ""
      : answer.sources.render();
    const parts = [
      answer.text,
      sources,
      AskTool.depthNote(asked, answer.depth),
    ];
    return { text: parts.filter(Boolean).join("\n\n") };
  }

  /**
   * One closing line saying the depth the answer got, so the caller knows
   * what a retry one step higher would buy, and when a plan capped the ask.
   */
  private static depthNote(
    asked: AnswerDepth | undefined,
    used: AnswerDepth | undefined,
  ): string {
    if (!used) return "";
    if (asked && used.isShallowerThan(asked)) {
      return `Answered at depth: ${used.name} (asked for ${asked.name}; this team's plan caps depth here, so a higher depth will not change the answer).`;
    }
    return `Answered at depth: ${used.name}.`;
  }

  /** Whether the answer text already ends in its own list of sources. */
  private static namesItsSources(text: string): boolean {
    return /(^|\n)\s*(\*\*)?(sources|references|fuentes|referencias)(\*\*)?:\s*\n/i.test(
      text,
    );
  }
}
