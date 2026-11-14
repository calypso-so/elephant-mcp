export type AgentBucketDescriptor = {
  id: string;
  name?: string;
  slug?: string;
  status?: string;
  member_count?: number;
};

export type AgentDescriptor = {
  id: string;
  base_model?: string;
  profile_id?: string | null;
  source?: string;
  enabled?: boolean;
  bucket_ids: string[];
  buckets: AgentBucketDescriptor[];
  missing_bucket_ids: string[];
};

/** The team's agents as discovery returned them, or the fallback list. */
export type AgentCatalogSnapshot = {
  models: AgentDescriptor[];
  defaultModel: string;
  fetchedAt: string | null;
  source: "api" | "fallback";
  error?: string;
};

/**
 * The agents a caller may ask, and which one answers by default.
 *
 * Tools read the catalog through this accessor rather than the raw snapshot so
 * the rule "only ids discovery lists are accepted" lives in one place. An
 * unknown id fails loudly and names the alternatives, which lets the model
 * correct itself instead of the API answering with an opaque 404.
 */
export class AgentCatalog {
  constructor(private readonly snapshot: AgentCatalogSnapshot) {}

  get defaultAgentId(): string {
    return this.snapshot.defaultModel;
  }

  ids(): string[] {
    return this.snapshot.models.map((agent) => agent.id);
  }

  /** The requested agent id, or the default when none was requested. */
  resolve(requested?: string): string {
    const agentId = String(requested || "").trim() || this.defaultAgentId;
    const known = this.ids();
    if (!known.includes(agentId)) {
      throw new Error(
        `Unknown agent \`${agentId}\`. Available: ${known.join(", ")}.`,
      );
    }
    return agentId;
  }
}
