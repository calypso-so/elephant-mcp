import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { BearerAuthenticator } from "../auth/BearerAuthenticator.js";
import type { Credential } from "../auth/Credential.js";
import {
  createElephantMcpServer,
  type PackageInfo,
} from "../ElephantMcpServer.js";
import type { UsageNotices } from "../notices/UsageNotices.js";
import type { ToolPreset } from "../presets/ToolPreset.js";
import type { KnowledgeInventoryCache } from "./KnowledgeInventoryCache.js";
import type { ModelCatalogCache } from "./ModelCatalogCache.js";
import type { RateLimiter } from "./RateLimiter.js";
import { StatelessMcpEndpoint } from "./StatelessMcpEndpoint.js";

export type { EndpointOutcome } from "./StatelessMcpEndpoint.js";

export type McpEndpointOptions = {
  readonly preset: ToolPreset;
  readonly authenticator: BearerAuthenticator;
  readonly catalogs: ModelCatalogCache;
  /**
   * The team's knowledge inventory, read only for presets that hatch. Absent
   * (the HTTP tests), the inventory is unknown and nothing hatches.
   */
  readonly inventories?: KnowledgeInventoryCache;
  /** Shared by every endpoint, so a caller's budget spans both plugins. */
  readonly limiter: RateLimiter;
  readonly apiBaseUrl: string;
  readonly packageInfo: PackageInfo;
  /** Told after each tool call; absent (the HTTP tests), nobody is told. */
  readonly notices?: UsageNotices;
};

/**
 * One Elephant preset served over stateless Streamable HTTP.
 *
 * The request handling is `StatelessMcpEndpoint`'s. This class adds the one
 * Elephant step: a server bound to the caller's API key, with their agents
 * and, for a preset that hatches, what their team has saved.
 */
export class McpEndpoint extends StatelessMcpEndpoint<ToolPreset> {
  constructor(private readonly options: McpEndpointOptions) {
    super(options);
  }

  protected async serverFor(credential: Credential): Promise<McpServer> {
    const api = {
      apiKey: credential.apiKey,
      apiBaseUrl: this.options.apiBaseUrl,
    };
    const [agents, inventory] = await Promise.all([
      this.options.catalogs.get(api),
      this.preset.hatches && this.options.inventories
        ? this.options.inventories.get(api)
        : null,
    ]);
    return createElephantMcpServer({
      preset: this.preset,
      api,
      agents,
      inventory,
      packageInfo: this.options.packageInfo,
      principal: credential.principal,
      scopes: credential.scopes,
      grant: credential.grant,
      notices: this.options.notices,
    });
  }
}
