import { createHash } from "node:crypto";

import type { AgentCatalogSnapshot } from "../calypso/AgentCatalog.js";
import { loadAgentCatalog } from "../calypso/AgentCatalogLoader.js";
import type { CalypsoApiConfig } from "../calypso/CalypsoApiConfig.js";

type Entry = { catalog: Promise<AgentCatalogSnapshot>; expiresAt: number };

export type CatalogLoader = (
  config: CalypsoApiConfig,
) => Promise<AgentCatalogSnapshot>;

/**
 * Per-key cache of the team's agent catalog for the hosted server.
 *
 * The stateless HTTP server builds a fresh McpServer for every request, and
 * each one needs the catalog; without this, every tools/list would cost an
 * Calypso API round trip. Keyed by a hash so raw keys never sit in a map.
 */
export class ModelCatalogCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 1_000,
    private readonly load: CatalogLoader = loadAgentCatalog,
    private readonly now: () => number = Date.now,
  ) {}

  get(config: CalypsoApiConfig): Promise<AgentCatalogSnapshot> {
    const key = createHash("sha256")
      .update(`${config.apiBaseUrl}|${config.apiKey ?? ""}`)
      .digest("hex");
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.catalog;

    const catalog = this.load(config);
    // A failed load must not be cached for the whole TTL.
    catalog.catch(() => this.entries.delete(key));
    this.entries.delete(key);
    this.entries.set(key, { catalog, expiresAt: this.now() + this.ttlMs });
    this.evictOverflow();
    return catalog;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
