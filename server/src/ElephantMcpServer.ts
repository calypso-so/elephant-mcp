import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AgentCatalogSnapshot } from "./calypso/AgentCatalog.js";
import { AgentCatalog } from "./calypso/AgentCatalog.js";
import { CalypsoApi } from "./calypso/CalypsoApi.js";
import type { CalypsoApiConfig } from "./calypso/CalypsoApiConfig.js";
import {
  KnowledgeInventory,
  type KnowledgeInventorySummary,
} from "./calypso/KnowledgeInventory.js";
import { hatchingCard, hatchingInstructions } from "./hatching/HatchingCopy.js";
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
  /**
   * What the team has in Elephant, read (and cached) by the endpoint; null
   * when unknown or not read at all, which keeps every behaviour as it was.
   */
  readonly inventory?: KnowledgeInventorySummary | null;
  readonly packageInfo: PackageInfo;
  /** Safe-to-log label for the caller, e.g. `grant:<id>`. */
  readonly principal: string;
};

export const GET_STARTED_PROMPT = "elephant-get-started";

/**
 * Builds the MCP server for one preset and one caller.
 *
 * Built per request and thrown away after it: the tools close over this
 * caller's API client only, so nothing one caller does can reach another.
 * A hatching preset chooses its `instructions` by the team's inventory and
 * publishes the `elephant-get-started` prompt.
 */
export function createElephantMcpServer(
  options: ElephantMcpServerOptions,
): McpServer {
  const { preset, packageInfo } = options;
  const inventory = preset.hatches ? (options.inventory ?? null) : null;
  const server = new McpServer(
    {
      name: preset.serverName,
      title: preset.displayName,
      version: packageInfo.version,
    },
    {
      capabilities: { logging: {} },
      instructions: preset.hatches
        ? hatchingInstructions(preset.instructions, inventory)
        : preset.instructions,
    },
  );
  const api = new CalypsoApi(
    options.api,
    `${packageInfo.name}/${packageInfo.version} (Node.js/${process.versions.node})`,
  );
  const context: ToolContext = {
    api,
    agents: new AgentCatalog(options.agents),
    inventory: new KnowledgeInventory(inventory, () => api.buckets.list()),
    log: new ToolLogger(server, options.principal),
  };
  for (const tool of preset.tools) register(server, tool, context);
  if (preset.hatches) registerGetStarted(server, context);
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

/**
 * The one prompt: the whole setup for an empty team, a short tour for a team
 * with knowledge. Clients show it as a slash command or a starter.
 */
function registerGetStarted(server: McpServer, context: ToolContext): void {
  server.registerPrompt(
    GET_STARTED_PROMPT,
    {
      title: "Get started with Elephant",
      description:
        "What Elephant can do for this team right now, and the next step: add a first source, or try a question.",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: hatchingCard(await context.inventory.current()),
          },
        },
      ],
    }),
  );
}
