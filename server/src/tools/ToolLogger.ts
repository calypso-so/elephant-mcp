import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type LogLevel = "debug" | "info" | "notice" | "warning" | "error";

/**
 * Structured logs for one tool call: sent to the MCP client, and errors to
 * the server's own log with the caller's principal.
 *
 * Callers log identifiers, counts and statuses only. Prompts, file bytes and
 * API keys never reach a log line.
 */
export class ToolLogger {
  constructor(
    private readonly server: McpServer | null,
    private readonly principal: string,
  ) {}

  async event(
    level: LogLevel,
    message: string,
    data: Record<string, unknown> = {},
    /** Kept in the server's log only: what a client is not shown. */
    serverOnly: Record<string, unknown> = {},
  ): Promise<void> {
    if (level === "error") {
      console.error(
        JSON.stringify({
          level,
          message,
          principal: this.principal,
          ...data,
          ...serverOnly,
        }),
      );
    }
    try {
      // The client is told what happened, not who the caller is to Calypso:
      // the principal (a grant or key reference) stays in the server's log.
      await this.server?.server.sendLoggingMessage({
        level,
        logger: "elephant",
        data: { message, ...data },
      });
    } catch {
      // Logging is best-effort and must never break a tool call.
    }
  }
}
