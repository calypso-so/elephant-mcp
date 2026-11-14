import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentCatalogSnapshot } from "./calypso/AgentCatalog.js";
import { AgentCatalog } from "./calypso/AgentCatalog.js";
import { CalypsoApi } from "./calypso/CalypsoApi.js";
import type { CalypsoApiConfig } from "./calypso/CalypsoApiConfig.js";
import type { ToolPreset } from "./presets/ToolPreset.js";
import type { ElephantTool } from "./tools/ElephantTool.js";
import type { ToolContext } from "./tools/ToolContext.js";
import { ToolLogger } from "./tools/ToolLogger.js";

export type PackageInfo = { readonly name: string; readonly version: string };

export type ElephantMcpServerOptions = {
  readonly preset: ToolPreset;
  /** The caller's Calypso API key and the API base URL. */
  readonly api: CalypsoApiConfig;
  /** The caller's agents, already discovered (and cached) by the endpoint. */
  readonly agents: AgentCatalogSnapshot;
  readonly packageInfo: PackageInfo;
  /** Safe-to-log label for the caller, e.g. `grant:<id>`. */
  readonly principal: string;
};

/**
 * Builds the MCP server for one preset and one caller.
 *
 * Built per request and thrown away after it: the tools close over this
 * caller's API client only, so nothing one caller does can reach another.
 */
export function createElephantMcpServer(
  options: ElephantMcpServerOptions,
): McpServer {
  const { preset, packageInfo } = options;
  const server = new McpServer(
    {
      name: preset.serverName,
      title: preset.displayName,
      version: packageInfo.version,
    },
    { capabilities: { logging: {} }, instructions: preset.instructions },
  );
  const context: ToolContext = {
    api: new CalypsoApi(
      options.api,
      `${packageInfo.name}/${packageInfo.version} (Node.js/${process.versions.node})`,
    ),
    agents: new AgentCatalog(options.agents),
    log: new ToolLogger(server, options.principal),
  };
  for (const tool of preset.tools) register(server, tool, context);
  return server;
}

function register(
  server: McpServer,
  tool: ElephantTool,
  context: ToolContext,
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
    (args) => tool.call(args, context),
  );
}
