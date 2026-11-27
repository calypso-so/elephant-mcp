import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GrantFacts } from "./auth/Credential.js";
import { GrantScopes } from "./auth/GrantScopes.js";
import type { AgentCatalogSnapshot } from "./calypso/AgentCatalog.js";
import { AgentCatalog } from "./calypso/AgentCatalog.js";
import { CalypsoApi } from "./calypso/CalypsoApi.js";
import type { CalypsoApiConfig } from "./calypso/CalypsoApiConfig.js";
import {
  KnowledgeInventory,
  type KnowledgeInventorySummary,
} from "./calypso/KnowledgeInventory.js";
import { hatchingCard, hatchingInstructions } from "./hatching/HatchingCopy.js";
import {
  NoUsageNotices,
  type ToolCall,
  type UsageNotices,
} from "./notices/UsageNotices.js";
import type { ToolPreset } from "./presets/ToolPreset.js";
import type { ElephantTool } from "./tools/ElephantTool.js";
import type { ToolContext } from "./tools/ToolContext.js";
import { ToolLogger } from "./tools/ToolLogger.js";
import { ToolRegistrar } from "./tools/ToolRegistrar.js";

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
  /**
   * The OAuth scopes the caller's grant carries. Absent or empty (a local
   * server, a raw API key) offers every tool of the preset.
   */
  readonly scopes?: readonly string[];
  /** The grant's non-secret facts, for the operator notices. */
  readonly grant?: GrantFacts;
  /** Told after each tool call. Absent (stdio, tests), nobody is told. */
  readonly notices?: UsageNotices;
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
  const grant = GrantScopes.of(options.scopes);
  const instructions = preset.instructionsFor(grant);
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
        ? hatchingInstructions(instructions, inventory)
        : instructions,
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
    notices: options.notices ?? new NoUsageNotices(),
  };
  const caller = {
    principal: options.principal,
    scopes: options.scopes ?? [],
    grant: options.grant,
  };
  for (const tool of preset.toolsFor(grant)) {
    register(server, tool, context, caller);
  }
  if (preset.hatches) registerGetStarted(server, context);
  return server;
}

type Caller = Pick<ToolCall, "principal" | "scopes" | "grant">;

/** Registers the tool and tells the notices how each of its calls went. */
function register(
  server: McpServer,
  tool: ElephantTool,
  context: ToolContext,
  caller: Caller,
): void {
  ToolRegistrar.register(server, tool, context, (report) =>
    context.notices.toolCalled({ ...report, ...caller }),
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
