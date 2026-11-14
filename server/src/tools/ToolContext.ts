import type { AgentCatalog } from "../calypso/AgentCatalog.js";
import type { CalypsoApi } from "../calypso/CalypsoApi.js";
import type { ToolLogger } from "./ToolLogger.js";

/**
 * Everything a tool needs for one request: the Calypso API as the caller,
 * the caller's agents, and a logger.
 *
 * Built per request from the caller's credential, so a tool can never reach
 * another caller's key or data.
 */
export type ToolContext = {
  readonly api: CalypsoApi;
  readonly agents: AgentCatalog;
  readonly log: ToolLogger;
};
