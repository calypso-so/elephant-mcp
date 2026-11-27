import type { IncomingMessage, ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthChallenge } from "../auth/AuthChallenge.js";
import type { BearerAuthenticator } from "../auth/BearerAuthenticator.js";
import type { Credential } from "../auth/Credential.js";
import type { ProtectedResource } from "../auth/ProtectedResource.js";
import type { RateLimiter } from "./RateLimiter.js";

export type StatelessMcpEndpointOptions<
  Resource extends ProtectedResource = ProtectedResource,
> = {
  readonly preset: Resource;
  readonly authenticator: BearerAuthenticator;
  /** Shared by every endpoint of a server, so a caller's budget spans them. */
  readonly limiter: RateLimiter;
};

/** What one request to an endpoint came to: a served principal, or a refusal. */
export type EndpointOutcome = {
  readonly principal?: string;
  /** Why authentication refused the request; see AuthChallenge.logReason. */
  readonly refused?: string;
};

/**
 * One protected resource served over stateless Streamable HTTP.
 *
 * Every POST is authenticated, checked against the caller's request budget,
 * then handled by a fresh MCP server built for that caller alone. Nothing
 * survives the request, so any instance can serve any call. What the server
 * holds is the subclass's to say: `serverFor` is the one step that differs
 * between products.
 */
export abstract class StatelessMcpEndpoint<
  Resource extends ProtectedResource = ProtectedResource,
> {
  readonly preset: Resource;
  private readonly authenticator: BearerAuthenticator;
  private readonly limiter: RateLimiter;

  constructor(options: StatelessMcpEndpointOptions<Resource>) {
    this.preset = options.preset;
    this.authenticator = options.authenticator;
    this.limiter = options.limiter;
  }

  /** The MCP server for one authenticated caller, built for this request. */
  protected abstract serverFor(credential: Credential): Promise<McpServer>;

  /** Who was served, or why the request was refused. */
  async handle(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
  ): Promise<EndpointOutcome> {
    const result = await this.authenticator.authenticate(
      req.headers.authorization,
      this.preset,
    );
    if (result instanceof AuthChallenge) {
      StatelessMcpEndpoint.refuse(res, result);
      return { refused: result.logReason() };
    }
    const decision = this.limiter.take(result.principal);
    if (!decision.allowed) {
      StatelessMcpEndpoint.throttle(res, decision.retryAfterSeconds);
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
    const server = await this.serverFor(credential);
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
