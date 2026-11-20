import { randomUUID } from "node:crypto";
import OpenAI from "openai";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import { AnswerDepth } from "./AnswerDepth.js";
import { AnswerSources } from "./AnswerSources.js";
import { type CalypsoApiConfig, requireApiKey } from "./CalypsoApiConfig.js";

export type AgentQuestion = {
  /** Agent that answers, already checked against the catalog. */
  readonly agentId: string;
  readonly prompt: string;
  /** Sources to focus the answer on. */
  readonly fileIds?: readonly string[];
  /** Names the conversation this single turn opens. */
  readonly conversationId: string;
  /** How much work the answer is worth; the agent's own default when absent. */
  readonly depth?: AnswerDepth;
};

export type AgentAnswer = {
  readonly text: string;
  readonly responseId: string | null;
  /** What the answer was grounded in; empty when the response names none. */
  readonly sources: AnswerSources;
  /** The depth the API reports it answered at, which a plan may cap. */
  readonly depth?: AnswerDepth;
};

/**
 * The Calypso API accepts Responses fields this SDK version does not type yet
 * (`conversation`, free-form `metadata`), so the request is described here and
 * cast once, at the API boundary.
 */
type AgentResponsesRequest = Omit<
  ResponseCreateParamsStreaming,
  "input" | "metadata"
> & {
  input: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  conversation: { id: string };
};

/**
 * Asks a Calypso agent through the OpenAI-compatible `POST /responses`.
 *
 * Each question is its own conversation. The server is stateless (every HTTP
 * request builds a fresh one), so there is nowhere to keep a thread between
 * calls and a follow-up must carry its own context in the prompt.
 */
export class AgentResponses {
  private client: OpenAI | null = null;

  constructor(
    private readonly config: CalypsoApiConfig,
    private readonly userAgent: string,
  ) {}

  static newConversationId(): string {
    return `conv_${randomUUID().replace(/-/g, "")}`;
  }

  async ask(question: AgentQuestion): Promise<AgentAnswer> {
    const stream = await this.openai().responses.create(
      AgentResponses.requestFor(
        question,
      ) as unknown as ResponseCreateParamsStreaming,
    );
    return AgentResponses.collect(stream);
  }

  // Built on first use: the SDK refuses to construct without a key, and that
  // failure belongs in the tool result of the call that needed it.
  private openai(): OpenAI {
    this.client ??= new OpenAI({
      apiKey: requireApiKey(this.config),
      baseURL: this.config.apiBaseUrl,
      defaultHeaders: { "User-Agent": this.userAgent },
      // The platform fetch, looked up per call, like every other Calypso
      // request here: one transport to configure, trace and stub.
      fetch: (url, init) =>
        globalThis.fetch(url as RequestInfo, init as RequestInit) as never,
    });
    return this.client;
  }

  private static requestFor(question: AgentQuestion): AgentResponsesRequest {
    const fileIds = question.fileIds ?? [];
    return {
      model: question.agentId,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: question.prompt },
            ...fileIds.map((fileId) => ({
              type: "input_file",
              file_id: fileId,
            })),
          ],
        },
      ],
      stream: true,
      store: true,
      metadata: AgentResponses.metadataFor(question),
      conversation: { id: question.conversationId },
    };
  }

  private static metadataFor(question: AgentQuestion): Record<string, unknown> {
    return {
      tool: "mcp",
      agent: question.agentId,
      conversation_id: question.conversationId,
      ...(question.depth
        ? { response_policy: question.depth.responsePolicy }
        : {}),
      // Named files are retrieved from, not pasted into the prompt whole.
      ...(question.fileIds?.length
        ? { _aicore: { file_input_strategy: "rag_policy" } }
        : {}),
    };
  }

  /** Folds the event stream into the answer text, its sources and the response id. */
  private static async collect(
    stream: AsyncIterable<ResponseStreamEvent>,
  ): Promise<AgentAnswer> {
    let text = "";
    let responseId: string | null = null;
    let sources = AnswerSources.none();
    let depth: AnswerDepth | undefined;

    for await (const event of stream) {
      if (
        event.type === "response.output_text.delta" &&
        typeof event.delta === "string"
      ) {
        text += event.delta;
      }
      // Some responses skip deltas and only send the finished text.
      if (
        event.type === "response.output_text.done" &&
        !text &&
        typeof event.text === "string"
      ) {
        text = event.text;
      }
      if (event.type === "response.completed") {
        if (typeof event.response?.id === "string") {
          responseId = event.response.id;
        }
        sources = AnswerSources.fromResponse(event.response);
        depth = AnswerDepth.used(event.response);
      }
    }

    return { text, responseId, sources, depth };
  }
}
