import type { CalypsoApiClient } from "./CalypsoApiClient.js";

export type KnowledgeSearchResult = {
  source_index: number;
  type: string;
  title?: string | null;
  text?: string | null;
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
};

const MAX_RESULTS = 20;

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
    return this.api.request("/search", {
      method: "POST",
      body: {
        query: options.query,
        ...(agent ? { agent } : {}),
        ...(options.buckets?.length ? { buckets } : {}),
        ...maxResultsField(options.maxResults),
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
