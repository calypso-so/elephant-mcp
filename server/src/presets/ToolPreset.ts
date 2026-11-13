import type { CalypsoToolName } from "../config.js";
import type { PublicToolSpec } from "./PublicToolSpec.js";

export type ToolPresetOptions = {
  /** Stable identifier, e.g. `elephant`. */
  readonly id: string;
  /** HTTP path the preset is served on, e.g. `/elephant/mcp`. */
  readonly path: string;
  /** Name returned in `initialize.serverInfo.name`. */
  readonly serverName: string;
  /** Human name shown on consent and in protected-resource metadata. */
  readonly displayName: string;
  /** Routing guidance returned in `initialize.instructions`. */
  readonly instructions?: string;
  /** OAuth scope a bearer token must carry to call this preset. */
  readonly scope: string;
  /** Canonical tool → public presentation. Order is `tools/list` order. */
  readonly tools: ReadonlyArray<readonly [CalypsoToolName, PublicToolSpec]>;
};

/**
 * One published surface of the Calypso MCP server: which tools exist, what
 * they are called, and how a client is told to use them.
 *
 * A preset is a value object. It is the single place that decides the public
 * tool surface, so `tools/list`, `calypso://server-info`, the protected
 * resource metadata, and the smoke tests all read the same answer.
 */
export class ToolPreset {
  readonly id: string;
  readonly path: string;
  readonly serverName: string;
  readonly displayName: string;
  readonly instructions?: string;
  readonly scope: string;
  private readonly specs: ReadonlyMap<CalypsoToolName, PublicToolSpec>;

  constructor(options: ToolPresetOptions) {
    this.id = options.id;
    this.path = options.path;
    this.serverName = options.serverName;
    this.displayName = options.displayName;
    this.instructions = options.instructions;
    this.scope = options.scope;
    this.specs = new Map(options.tools);
    ToolPreset.assertUniquePublicNames(this.id, [...this.specs.values()]);
  }

  includes(tool: CalypsoToolName): boolean {
    return this.specs.has(tool);
  }

  /** Public presentation of a canonical tool; throws when not in the preset. */
  specFor(tool: CalypsoToolName): PublicToolSpec {
    const spec = this.specs.get(tool);
    if (!spec) {
      throw new Error(`Tool ${tool} is not part of the ${this.id} preset.`);
    }
    return spec;
  }

  /** Public name for a canonical tool, or the canonical name when absent. */
  publicName(tool: CalypsoToolName): string {
    return this.specs.get(tool)?.name ?? tool;
  }

  canonicalTools(): CalypsoToolName[] {
    return [...this.specs.keys()];
  }

  publicToolNames(): string[] {
    return [...this.specs.values()].map((spec) => spec.name);
  }

  /** Absolute resource URL (`aud`) for this preset under a public base URL. */
  resourceUrl(publicBaseUrl: string): string {
    return new URL(
      this.path,
      ensureTrailingSlashless(publicBaseUrl),
    ).toString();
  }

  private static assertUniquePublicNames(
    id: string,
    specs: PublicToolSpec[],
  ): void {
    const names = specs.map((spec) => spec.name);
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(
        `Preset ${id} publishes duplicate tool names: ${duplicates.join(", ")}`,
      );
    }
  }
}

function ensureTrailingSlashless(value: string): string {
  return value.replace(/\/+$/, "");
}
