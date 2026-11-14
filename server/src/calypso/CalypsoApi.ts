import { AgentResponses } from "./AgentResponses.js";
import { CalypsoApiClient } from "./CalypsoApiClient.js";
import type { CalypsoApiConfig } from "./CalypsoApiConfig.js";
import { KnowledgeBatches } from "./KnowledgeBatches.js";
import { KnowledgeBuckets } from "./KnowledgeBuckets.js";
import { KnowledgeFiles } from "./KnowledgeFiles.js";
import { KnowledgeSearch } from "./KnowledgeSearch.js";
import { KnowledgeWebsites } from "./KnowledgeWebsites.js";

/**
 * The Calypso API as one caller sees it, grouped by resource.
 *
 * Tools take this instead of a key and a base URL so that none of them can
 * build a request by hand: everything a tool does to Calypso is a named
 * operation on one of these resources.
 */
export class CalypsoApi {
  readonly agent: AgentResponses;
  readonly batches: KnowledgeBatches;
  readonly buckets: KnowledgeBuckets;
  readonly files: KnowledgeFiles;
  readonly search: KnowledgeSearch;
  readonly websites: KnowledgeWebsites;

  /** `userAgent` identifies this server on agent calls. */
  constructor(config: CalypsoApiConfig, userAgent: string) {
    const client = new CalypsoApiClient(config);
    this.agent = new AgentResponses(config, userAgent);
    this.batches = new KnowledgeBatches(client);
    this.buckets = new KnowledgeBuckets(client);
    this.files = new KnowledgeFiles(client);
    this.search = new KnowledgeSearch(client);
    this.websites = new KnowledgeWebsites(client);
  }
}
