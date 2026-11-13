import type { IncomingMessage, ServerResponse } from "node:http";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { AuthChallenge } from "../auth/AuthChallenge.js";
import type { BearerAuthenticator } from "../auth/BearerAuthenticator.js";
import type { Credential } from "../auth/Credential.js";
import type { ToolPreset } from "../presets/ToolPreset.js";
import { createElephantMcpServer } from "../server.js";
import type { ModelCatalogCache } from "./ModelCatalogCache.js";

export type PackageInfo = { name: string; version: string };

/**
 * One preset served over stateless Streamable HTTP.
 *
 * Every POST is authenticated, then handled by a fresh McpServer bound to the
 * caller's API key and the preset. Nothing survives the request, so any
 * instance can serve any call and the service scales horizontally.
 */
export class McpEndpoint {
  constructor(
    readonly preset: ToolPreset,
    private readonly authenticator: BearerAuthenticator,
    private readonly catalogs: ModelCatalogCache,
    private readonly apiBaseUrl: string,
    private readonly packageInfo: PackageInfo,
  ) {}

  /** Returns the principal handled, or undefined when refused. */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<string | undefined> {
    const result = await this.authenticator.authenticate(
      req.headers.authorization,
      this.preset,
    );
    if (result instanceof AuthChallenge) {
      McpEndpoint.refuse(res, result);
      return undefined;
    }
    await this.serve(req, res, body, result);
    return result.principal;
  }

  private async serve(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    credential: Credential,
  ): Promise<void> {
    const config = {
      apiKey: credential.apiKey,
      apiBaseUrl: this.apiBaseUrl,
      localFileAccess: false,
    };
    const server = createElephantMcpServer({
      config,
      modelCatalog: await this.catalogs.get(config),
      packageInfo: this.packageInfo,
      preset: this.preset,
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
}
