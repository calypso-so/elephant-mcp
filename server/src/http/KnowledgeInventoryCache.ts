import { createHash } from "node:crypto";

import type { CalypsoApiConfig } from "../calypso/CalypsoApiConfig.js";
import {
  type KnowledgeInventorySummary,
  loadKnowledgeInventory,
} from "../calypso/KnowledgeInventory.js";

type Entry = {
  inventory: Promise<KnowledgeInventorySummary | null>;
  expiresAt: number;
};

export type InventoryLoader = (
  config: CalypsoApiConfig,
) => Promise<KnowledgeInventorySummary>;

/**
 * Per-key cache of the team's knowledge inventory for the hosted server, the
 * twin of ModelCatalogCache: `initialize` needs the inventory to choose its
 * instructions, and without this every request would cost a bucket list.
 * Short TTL — a team that just added its first source should see the hatch
 * fade within seconds. A failed load resolves to null (unknown) and is not
 * cached. Keyed by a hash so raw keys never sit in a map.
 */
export class KnowledgeInventoryCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = 20_000,
    private readonly maxEntries = 1_000,
    private readonly load: InventoryLoader = loadKnowledgeInventory,
    private readonly now: () => number = Date.now,
  ) {}

  get(config: CalypsoApiConfig): Promise<KnowledgeInventorySummary | null> {
    const key = createHash("sha256")
      .update(`${config.apiBaseUrl}|${config.apiKey ?? ""}`)
      .digest("hex");
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.inventory;

    const inventory = this.load(config).catch(() => {
      this.entries.delete(key);
      return null;
    });
    this.entries.delete(key);
    this.entries.set(key, { inventory, expiresAt: this.now() + this.ttlMs });
    this.evictOverflow();
    return inventory;
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}
