import { type InputShape, McpTool } from "./McpTool.js";
import type { ToolContext } from "./ToolContext.js";

export type { InputShape, ToolArgs, ToolOutput } from "./McpTool.js";

/**
 * One Elephant tool: a tool handed Elephant's context (the Calypso API as the
 * caller, their agents, their knowledge inventory).
 *
 * Each subclass owns everything a client sees about it, in Elephant's words.
 * Everything a tool of any Calypso server shares lives in `McpTool`.
 */
export abstract class ElephantTool<
  Shape extends InputShape = InputShape,
> extends McpTool<ToolContext, Shape> {}
