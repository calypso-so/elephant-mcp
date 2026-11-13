import type {
  McpServer,
  RegisteredTool,
  ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";

import type { CalypsoToolName } from "../config.js";
import type { ToolPreset } from "../presets/ToolPreset.js";
import type { HostedUploadPolicy } from "./HostedUploadPolicy.js";
import { InputDescriptions } from "./InputDescriptions.js";

export type CanonicalToolConfig<InputArgs extends ZodRawShape> = {
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: ZodRawShape;
  annotations?: ToolAnnotations;
};

/**
 * Registers canonical Calypso tools onto an MCP server through a preset.
 *
 * Every tool in server.ts is declared once, under its canonical id, and goes
 * through `register`. The catalog decides whether the preset publishes it,
 * under which name and description, and with which inputs — so a branded
 * surface (Elephant) and the canonical one (Calypso) share every handler.
 */
export class ToolCatalog {
  private readonly published: string[] = [];

  constructor(
    private readonly server: McpServer,
    private readonly preset: ToolPreset,
    private readonly uploadPolicy: HostedUploadPolicy,
  ) {}

  register<InputArgs extends ZodRawShape>(
    canonical: CalypsoToolName,
    config: CanonicalToolConfig<InputArgs>,
    handler: ToolCallback<InputArgs>,
  ): RegisteredTool | null {
    if (!this.preset.includes(canonical)) return null;

    const spec = this.preset.specFor(canonical);
    this.published.push(spec.name);
    return this.server.registerTool(
      spec.name,
      {
        ...config,
        title: spec.title ?? config.title,
        description: spec.description ?? config.description,
        inputSchema: new InputDescriptions(spec.inputDescriptions ?? {}).apply(
          this.uploadPolicy.adapt(config.inputSchema),
        ),
      },
      handler as ToolCallback<InputArgs>,
    );
  }

  /** Public names registered so far, in registration order. */
  publishedToolNames(): string[] {
    return [...this.published];
  }
}
