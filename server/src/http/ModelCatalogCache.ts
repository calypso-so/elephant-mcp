import { createHash } from "node:crypto";

import type { CalypsoRuntimeConfig } from "../config.js";
import { type CalypsoRagModelCatalog, loadRagModelCatalog } from "../models.js";

type Entry = { catalog: Promise<CalypsoRagModelCatalog>; expiresAt: number };

export type CatalogLoader = (
  config: CalypsoRuntimeConfig,
) => Promise<CalypsoRagModelCatalog>;

/**
 * Per-key cache of the team's agent catalog for the hosted server.
 *
 * The stateless HTTP server builds a fresh McpServer for every request, and
 * each one needs the catalog; without this, every tools/list would cost an
 * AIcore round trip. Keyed by a hash so raw keys never sit in a map.
 */
export class ModelCatalogCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 1_000,
    private readonly load: CatalogLoader = loadRagModelCatalog,
    private readonly now: () => number = Date.now,
  ) {}

  get(config: CalypsoRuntimeConfig): Promise<CalypsoRagModelCatalog> {
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
