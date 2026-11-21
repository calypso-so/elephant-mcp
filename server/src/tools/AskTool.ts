import { z } from "zod";

import { AgentChoice, isUnknownAgent } from "../calypso/AgentChoice.js";
import {
  type AgentAnswer,
  type AgentQuestion,
  AgentResponses,
} from "../calypso/AgentResponses.js";
import { ANSWER_DEPTHS, AnswerDepth } from "../calypso/AnswerDepth.js";
import type { CalypsoApi } from "../calypso/CalypsoApi.js";
import { compactStrings } from "../calypso/coerce.js";
import { emptyKnowledgeAnswer } from "../hatching/HatchingCopy.js";
import { ToolGroup } from "../presets/ToolGroup.js";
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
      "Optional source ids (from elephant-list-buckets or a search result) that the answer must take into account. The answer may still draw on the agent's other sources; to read only certain buckets, use elephant-search with `buckets`.",
    ),
  model: z
    .string()
    .optional()
    .describe(
      "Optional id of one of the team's Calypso agents, when the user names one. Omit it to answer from every bucket the user has, including ones created a moment ago.",
    ),
  buckets: z
    .array(z.string().min(1))
    .min(1)
    .max(5)
    .optional()
    .describe(
      "Optional bucket ids or slugs (from elephant-list-buckets), up to 5, to answer only from those. Use it when the user names a folder or topic that matches a bucket; omit it otherwise and Elephant finds the right buckets itself.",
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
    "Without `model`, Elephant answers from every bucket the user has, including one created a moment ago. Optional `model` picks one of the team's Calypso agents instead, which reads only its own buckets. Optional `buckets` limits the answer to up to five named buckets.",
    "When the user has more buckets than one answer reads, Elephant picks the ones with evidence and the reply names any it did not search; ask again with `buckets` to choose them.",
    "Optional `depth` (`fast`, `balanced`, `deep`) sets how much work the answer gets. Choose it from the question, not from habit: `fast` for one stated fact, `balanced` for an explanation or summary, `deep` when several sources must be compared or the answer will be acted on. The reply ends by naming the depth it was answered at.",
    "If an answer is thin, misses part of the question, or says the knowledge does not cover something the user expects to be there, ask once more one depth higher before telling the user it is not covered. Do not repeat a call at the same depth, and do not go above `deep`.",
    "A team's plan may cap depth; when the reply says it was answered at a lower depth than asked, that is the most this team allows, so do not retry higher.",
    "When the team has no knowledge yet, the answer says so and how to add a first source; relay it, do not answer from general knowledge.",
  ].join("\n");
  readonly inputSchema = inputSchema;
  readonly group = ToolGroup.read;
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
    const choice = AgentChoice.of(agents, args.model);
    const asked = AnswerDepth.named(args.depth);
    const fileIds = compactStrings(args.fileIds);
    const buckets = compactStrings(args.buckets);
    const conversationId = AgentResponses.newConversationId();
    const question: Omit<AgentQuestion, "agentId"> = {
      prompt: args.prompt.trim(),
      fileIds,
      conversationId,
      depth: asked,
      buckets,
    };
    await log.event("info", "Asking a Calypso agent.", {
      tool: this.name,
      agent: choice.agentId,
      conversationId,
      fileCount: fileIds?.length ?? 0,
      bucketCount: buckets?.length ?? 0,
    });

    const answer = await AskTool.askWithFallback(api, choice, question, log);
    const agentId = answer.agentId;
    // Retrieval could not run as asked: say why, in words the caller can
    // act on, instead of relaying "not enough information".
    const refusal = answer.diagnostics.failureReason();
    if (refusal) {
      await log.event("info", "Retrieval refused the request.", {
        tool: this.name,
        agent: agentId,
        failureCode: answer.diagnostics.failureCode,
      });
      throw new Error(refusal);
    }

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
      await AskTool.coverageNote(api, answer),
      AskTool.depthNote(asked, answer.depth),
    ];
    return { text: parts.filter(Boolean).join("\n\n") };
  }

  /**
   * The connector agent first; the catalog's default when this API does not
   * know it yet. Only an "unknown agent" answer falls back: anything else is
   * the real outcome of the question.
   */
  private static async askWithFallback(
    api: CalypsoApi,
    choice: AgentChoice,
    question: Omit<AgentQuestion, "agentId">,
    log: ToolContext["log"],
  ): Promise<AgentAnswer & { agentId: string }> {
    try {
      const answer = await api.agent.ask({
        ...question,
        agentId: choice.agentId,
      });
      return { ...answer, agentId: choice.agentId };
    } catch (error) {
      if (!choice.fallbackId || !isUnknownAgent(error)) {
        throw AskTool.readable(error, question.fileIds);
      }
      await log.event(
        "warning",
        "Connector agent unknown; asked the default.",
        {
          tool: "elephant-ask",
          agent: choice.fallbackId,
        },
      );
      const answer = await api.agent
        .ask({ ...question, agentId: choice.fallbackId })
        .catch((retryError: unknown) => {
          throw AskTool.readable(retryError, question.fileIds);
        });
      return { ...answer, agentId: choice.fallbackId };
    }
  }

  /**
   * One line naming the buckets the answer did not read, when there were
   * more than one answer reads. Names come from the bucket list; an id is
   * shown when a name cannot be read.
   */
  private static async coverageNote(
    api: CalypsoApi,
    answer: AgentAnswer,
  ): Promise<string> {
    const coverage = answer.diagnostics.coverage;
    if (!coverage) return "";
    const names = new Map<string, string>();
    try {
      for (const bucket of (await api.buckets.list()).buckets) {
        names.set(bucket.id, bucket.name || bucket.slug || bucket.id);
      }
    } catch {
      // Ids are still an honest answer.
    }
    const label = (id: string) => names.get(id) ?? id;
    const total = coverage.searched.length + coverage.unsearched.length;
    return `Searched ${coverage.searched.length} of ${total} buckets, the ones with the strongest match. Not searched: ${coverage.unsearched.map(label).join(", ")}. Ask again with \`buckets\` to choose.`;
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
    if (!asked) {
      // Said in the reply because a client may hold a tool list from before
      // `depth` existed, and would otherwise report that it cannot be set.
      return `Answered at depth: ${used.name} (the agent's default; pass \`depth\` as \`fast\`, \`balanced\` or \`deep\` to choose).`;
    }
    if (used.isShallowerThan(asked)) {
      return `Answered at depth: ${used.name} (asked for ${asked.name}; this team's plan caps depth here, so a higher depth will not change the answer).`;
    }
    return `Answered at depth: ${used.name}.`;
  }

  /**
   * A file id the API does not know arrives as a bare 404. Say what it means
   * and what to do, since "404 status code (no body)" tells the caller nothing.
   */
  private static readable(
    error: unknown,
    fileIds: readonly string[] | undefined,
  ): unknown {
    const status = (error as { status?: unknown } | null)?.status;
    if (status !== 404 || !fileIds?.length) return error;
    return new Error(
      "One of the `fileIds` is not a source in this team's knowledge. Use ids from elephant-list-buckets, or ask again without `fileIds`.",
    );
  }

  /** Whether the answer text already ends in its own list of sources. */
  private static namesItsSources(text: string): boolean {
    return /(^|\n)\s*(\*\*)?(sources|references|fuentes|referencias)(\*\*)?:\s*\n/i.test(
      text,
    );
  }
}
