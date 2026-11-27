import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { InputShape, McpTool, ToolRuntime } from "./McpTool.js";

/** How one tool call went, for whoever wants to hear about it. */
export type ToolCallReport = {
  readonly tool: string;
  /** The caller's own input, as the tool received it. */
  readonly args: unknown;
  readonly outcome: "ok" | "error";
  readonly durationMs: number;
};

/**
 * Publishes a tool on an MCP server exactly as the tool describes itself.
 *
 * The one place a tool's name, wording, schemas, annotations and file inputs
 * are handed to the SDK, so every Calypso server lists its tools the same way.
 * `observe` hears how each call went once it has its result: the tool's own
 * error handling has already turned a failure into an `isError` result, so
 * the outcome is read from that.
 */
export const ToolRegistrar = {
  register<Context extends ToolRuntime>(
    server: McpServer,
    tool: McpTool<Context, InputShape>,
    context: Context,
    observe?: (report: ToolCallReport) => void,
  ): void {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
        annotations: tool.annotations,
        ...(tool.fileParams?.length
          ? { _meta: { "openai/fileParams": [...tool.fileParams] } }
          : {}),
      },
      async (args) => {
        const startedAt = performance.now();
        const result = await tool.call(args, context);
        observe?.({
          tool: tool.name,
          args,
          outcome: result.isError ? "error" : "ok",
          durationMs: performance.now() - startedAt,
        });
        return result;
      },
    );
  },
};
