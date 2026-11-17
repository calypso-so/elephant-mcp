import type {
  AgentBucketDescriptor,
  AgentCatalogSnapshot,
  AgentDescriptor,
} from "./AgentCatalog.js";
import { CalypsoApiClient } from "./CalypsoApiClient.js";
import type { CalypsoApiConfig } from "./CalypsoApiConfig.js";
import {
  asRecord,
  numberOrUndefined,
  trimmedString,
  uniqueStrings,
} from "./coerce.js";

/**
 * Id of the agent every Calypso team has. It is an API model id (data the
 * Calypso API defines; `elephant-agent` since Step 2 of the Elephant rename,
 * 2026-11-17), used only so asking still works when discovery is
 * unreachable; it is never part of anything a client reads.
 */
const BASE_AGENT_ID = "elephant-agent";

// Discovery runs on the request path of every cold cache entry, so it gets a
// short budget: a slow answer must degrade to the fallback, not stall a call.
const DISCOVERY_TIMEOUT_MS = 2000;

function baseAgent(): AgentDescriptor {
  return {
    id: BASE_AGENT_ID,
    base_model: BASE_AGENT_ID,
    profile_id: null,
    source: "default_policy",
    enabled: true,
    bucket_ids: [],
    buckets: [],
    missing_bucket_ids: [],
  };
}

/** The catalog used when discovery cannot be reached: the base agent alone. */
export function fallbackAgentCatalog(error?: unknown): AgentCatalogSnapshot {
  return {
    models: [baseAgent()],
    defaultModel: BASE_AGENT_ID,
    fetchedAt: null,
    source: "fallback",
    error:
      error instanceof Error
        ? error.message
        : error
          ? String(error)
          : undefined,
  };
}

/**
 * Loads the team's agents from `GET /rag-agent/models`.
 *
 * Never rejects: any failure (no key, timeout, non-2xx, malformed body)
 * yields the fallback catalog, because a discovery outage must not take the
 * tools down with it.
 */
export async function loadAgentCatalog(
  config: CalypsoApiConfig,
): Promise<AgentCatalogSnapshot> {
  if (!String(config.apiKey || "").trim()) {
    return fallbackAgentCatalog("No Calypso API key on the request.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCOVERY_TIMEOUT_MS);
  try {
    const body = await new CalypsoApiClient(config).request<unknown>(
      "/rag-agent/models",
      { method: "GET", signal: controller.signal },
    );
    return normalizeCatalog(body);
  } catch (error) {
    return fallbackAgentCatalog(error);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCatalog(body: unknown): AgentCatalogSnapshot {
  const data = asRecord(body)?.data;
  const byId = new Map<string, AgentDescriptor>();
  for (const item of Array.isArray(data) ? data : []) {
    const agent = normalizeAgent(item);
    if (agent && !byId.has(agent.id)) byId.set(agent.id, agent);
  }
  const models = [...byId.values()];
  if (!byId.has(BASE_AGENT_ID)) models.unshift(baseAgent());

  // Discovery returns the workspace default first, so the default follows the
  // response rather than a constant; that keeps it right across an id rename.
  return {
    models,
    defaultModel: models[0]?.id || BASE_AGENT_ID,
    fetchedAt: new Date().toISOString(),
    source: "api",
  };
}

function normalizeAgent(value: unknown): AgentDescriptor | null {
  const raw = asRecord(value);
  const id = String(raw?.id || "").trim();
  if (!raw || !id) return null;
  return {
    id,
    base_model: trimmedString(raw.base_model),
    profile_id:
      trimmedString(raw.profile_id) ??
      (raw.profile_id === null ? null : undefined),
    source: trimmedString(raw.source),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    bucket_ids: uniqueStrings(raw.bucket_ids),
    buckets: normalizeBuckets(raw.buckets),
    missing_bucket_ids: uniqueStrings(raw.missing_bucket_ids),
  };
}

function normalizeBuckets(value: unknown): AgentBucketDescriptor[] {
  return (Array.isArray(value) ? value : [])
    .map(normalizeBucket)
    .filter((bucket): bucket is AgentBucketDescriptor => bucket !== null);
}

function normalizeBucket(value: unknown): AgentBucketDescriptor | null {
  const raw = asRecord(value);
  const id = String(raw?.id || "").trim();
  if (!raw || !id) return null;
  return {
    id,
    name: trimmedString(raw.name),
    slug: trimmedString(raw.slug),
    status: trimmedString(raw.status),
    member_count: numberOrUndefined(raw.member_count),
  };
}
