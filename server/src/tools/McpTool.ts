import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import type { ToolGroup } from "../presets/ToolGroup.js";
import { ErrorView } from "../views/ErrorView.js";
import type { ToolLogger } from "./ToolLogger.js";

export type InputShape = Record<string, z.ZodTypeAny>;
export type ToolArgs<Shape extends InputShape> = z.objectOutputType<
  Shape,
  z.ZodTypeAny
>;

/** What a tool produced: a JSON payload, or text, plus optional structure. */
export type ToolOutput =
  | { readonly json: unknown; readonly structured?: Record<string, unknown> }
  | { readonly text: string };

/** What every tool is handed, whatever else its product adds: a logger. */
export type ToolRuntime = { readonly log: ToolLogger };

/**
 * One MCP tool: its public name, wording and inputs, and what it does.
 *
 * Each subclass owns everything a client sees about it, so there is no second
 * layer that renames or rewrites tools on the way out. `call` turns failures
 * into tool errors the model can read and act on, instead of protocol errors
 * it cannot. `Context` is what the product hands its tools per request.
 */
export abstract class McpTool<
  Context extends ToolRuntime,
  Shape extends InputShape = InputShape,
> {
  abstract readonly name: string;
  abstract readonly title: string;
  abstract readonly description: string;
  abstract readonly inputSchema: Shape;
  /** What the tool does, which decides who is offered it. */
  abstract readonly group: ToolGroup;
  /**
   * The three hints a directory review reads are stated outright on every
   * tool, never left to a default: whether it only reads, whether it can
   * destroy anything, and whether it reaches beyond the caller's own
   * knowledge (a public URL, say). The reading tools answer true, false,
   * false.
   */
  abstract readonly annotations: ToolAnnotations & {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
  readonly outputSchema?: InputShape;
  /**
   * Top-level inputs that take a file the user attached in ChatGPT, declared
   * in `_meta["openai/fileParams"]`.
   */
  readonly fileParams?: readonly string[];

  /** First words of the error a failed call returns. */
  protected abstract readonly failure: string;

  protected abstract run(
    args: ToolArgs<Shape>,
    context: Context,
  ): Promise<ToolOutput>;

  async call(args: ToolArgs<Shape>, context: Context): Promise<CallToolResult> {
    try {
      return McpTool.result(await this.run(args, context));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const message = ErrorView.of(detail);
      await context.log.event(
        "error",
        `${this.name} failed.`,
        { tool: this.name, error: message },
        { detail },
      );
      return {
        isError: true,
        content: [{ type: "text", text: `Error: ${this.failure} ${message}` }],
      };
    }
  }

  private static result(output: ToolOutput): CallToolResult {
    if ("text" in output) {
      return { content: [{ type: "text", text: output.text }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(output.json, null, 2) }],
      ...(output.structured ? { structuredContent: output.structured } : {}),
    };
  }
}
