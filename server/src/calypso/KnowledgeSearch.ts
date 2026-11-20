import { type SearchDepthName, searchDepthForApi } from "./AnswerDepth.js";
import type { CalypsoApiClient } from "./CalypsoApiClient.js";

export type KnowledgeSearchResult = {
  source_index: number;
  type: string;
  title?: string | null;
  /** The whole matching passage, as the document has it. */
  text?: string | null;
  /** The line in the passage that matched most closely, when one stood out. */
  quote?: string | null;
  file_id?: string | null;
  filename?: string | null;
  url?: string | null;
  attributes: Record<string, unknown>;
};

export type KnowledgeSearchResponse = {
  object: string;
  query: string;
  agent?: string | null;
  strategy: string;
  /** The depth the search ran at, as the API names it. */
  depth?: string;
  results: KnowledgeSearchResult[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  request_id?: string;
};

export type SearchKnowledgeOptions = {
  query: string;
  /** Search what this agent can see. Not together with `buckets`. */
  agent?: string;
  /** Bucket ids or slugs to search directly. */
  buckets?: string[];
  maxResults?: number;
  depth?: SearchDepthName;
  /** Other phrasings of the same question, searched alongside it. */
  alsoSearchFor?: string[];
};

const MAX_RESULTS = 20;
/** The API searches at most this many extra phrasings. */
export const MAX_EXTRA_QUERIES = 2;

/**
 * Retrieval without an answer (`POST /search`): the passages and sources an
 * agent would cite, for callers that want the evidence itself.
 */
export class KnowledgeSearch {
  constructor(private readonly api: CalypsoApiClient) {}

  search(options: SearchKnowledgeOptions): Promise<KnowledgeSearchResponse> {
    const agent = options.agent?.trim();
    const buckets = (options.buckets ?? [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const extra = (options.alsoSearchFor ?? [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, MAX_EXTRA_QUERIES);
    const depth = searchDepthForApi(options.depth, extra.length);
    return this.api.request("/search", {
      method: "POST",
      body: {
        query: options.query,
        ...(agent ? { agent } : {}),
        ...(options.buckets?.length ? { buckets } : {}),
        ...maxResultsField(options.maxResults),
        ...(depth ? { depth } : {}),
        ...(extra.length ? { additional_queries: extra } : {}),
      },
    });
  }
}

function maxResultsField(maxResults?: number): { max_results?: number } {
  if (typeof maxResults !== "number" || !Number.isFinite(maxResults)) {
    return {};
  }
  return {
    max_results: Math.max(1, Math.min(MAX_RESULTS, Math.floor(maxResults))),
  };
}
