import type { AgentCatalog } from "./AgentCatalog.js";

/**
 * The agent a connection asks when the caller names none: the team's default
 * agent reading every bucket the team has, decided per question by the API.
 * A bucket created through Elephant is answerable from the next question on,
 * which a stored agent (linked to at most five chosen buckets) cannot promise.
 */
export const CONNECTOR_AGENT_ID = "elephant-agent:mcp";

/**
 * Which agent answers this call, and what to fall back to.
 *
 * A caller that names an agent gets exactly that one, checked against the
 * catalog. A caller that names none gets the connector agent, with the
 * catalog's default behind it for an API that does not know the connector
 * agent yet, so the server can be deployed before or after the API.
 */
export class AgentChoice {
  private constructor(
    readonly agentId: string,
    readonly fallbackId: string | null,
  ) {}

  static of(catalog: AgentCatalog, requested?: string): AgentChoice {
    if (String(requested || "").trim()) {
      return new AgentChoice(catalog.resolve(requested), null);
    }
    const fallback = catalog.defaultAgentId;
    return new AgentChoice(
      CONNECTOR_AGENT_ID,
      fallback && fallback !== CONNECTOR_AGENT_ID ? fallback : null,
    );
  }

  get isConnector(): boolean {
    return this.agentId === CONNECTOR_AGENT_ID;
  }
}

/** Whether an API error says the agent itself is unknown, not something in the request. */
export function isUnknownAgent(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    status === 404 &&
    /model_not_found|agent_not_found|unknown (rag )?(agent|profile|model)|does not exist/i.test(
      message,
    )
  );
}
