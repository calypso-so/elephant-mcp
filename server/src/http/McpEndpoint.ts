import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { AuthChallenge } from "../auth/AuthChallenge.js";
import type { BearerAuthenticator } from "../auth/BearerAuthenticator.js";
import type { Credential } from "../auth/Credential.js";
import {
  createElephantMcpServer,
  type PackageInfo,
} from "../ElephantMcpServer.js";
import type { ToolPreset } from "../presets/ToolPreset.js";
import type { KnowledgeInventoryCache } from "./KnowledgeInventoryCache.js";
import type { ModelCatalogCache } from "./ModelCatalogCache.js";
import type { RateLimiter } from "./RateLimiter.js";

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
};

/** What one request to an endpoint came to: a served principal, or a refusal. */
export type EndpointOutcome = {
  readonly principal?: string;
  /** Why authentication refused the request; see AuthChallenge.logReason. */
  readonly refused?: string;
};

/**
 * One preset served over stateless Streamable HTTP.
 *
 * Every POST is authenticated, checked against the caller's request budget,
 * then handled by a fresh MCP server bound to the caller's API key. Nothing
 * survives the request, so any instance can serve any call.
 */
export class McpEndpoint {
  readonly preset: ToolPreset;

  constructor(private readonly options: McpEndpointOptions) {
    this.preset = options.preset;
  }

  /** Who was served, or why the request was refused. */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<EndpointOutcome> {
    const result = await this.options.authenticator.authenticate(
      req.headers.authorization,
      this.preset,
    );
    if (result instanceof AuthChallenge) {
      McpEndpoint.refuse(res, result);
      return { refused: result.logReason() };
    }
    const decision = this.options.limiter.take(result.principal);
    if (!decision.allowed) {
      McpEndpoint.throttle(res, decision.retryAfterSeconds);
      return { principal: result.principal };
    }
    await this.serve(req, res, body, result);
    return { principal: result.principal };
  }

  private async serve(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    credential: Credential,
  ): Promise<void> {
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
    const server = createElephantMcpServer({
      preset: this.preset,
      api,
      agents,
      inventory,
      packageInfo: this.options.packageInfo,
      principal: credential.principal,
      scopes: credential.scopes,
    });
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  private static refuse(res: ServerResponse, challenge: AuthChallenge): void {
    res.writeHead(challenge.status, {
      "Content-Type": "application/json",
      "WWW-Authenticate": challenge.header(),
    });
    res.end(JSON.stringify(challenge.body()));
  }

  private static throttle(res: ServerResponse, retryAfterSeconds: number) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
    });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: `Too many requests. Try again in ${retryAfterSeconds} s.`,
        },
        id: null,
      }),
    );
  }
}
