import type { ElephantTool } from "../tools/ElephantTool.js";

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
  readonly instructions: string;
  /** OAuth scope a bearer token must carry to call this preset. */
  readonly scope: string;
  /** The tools this preset publishes, in `tools/list` order. */
  readonly tools: readonly ElephantTool[];
  /**
   * The preset answers questions, so it hatches: empty-team instructions,
   * the `elephant-get-started` prompt, and the hatch card in place of an
   * answer when there is nothing to answer from. Off for Builder.
   */
  readonly hatches?: boolean;
};

/**
 * One published plugin surface: its endpoint, its scope, and its tools.
 *
 * The preset is the single answer to "what does this endpoint offer", read by
 * `tools/list`, the protected-resource metadata and the smoke probe alike.
 */
export class ToolPreset {
  readonly id: string;
  readonly path: string;
  readonly serverName: string;
  readonly displayName: string;
  readonly instructions: string;
  readonly scope: string;
  readonly tools: readonly ElephantTool[];
  readonly hatches: boolean;

  constructor(options: ToolPresetOptions) {
    this.id = options.id;
    this.path = options.path;
    this.serverName = options.serverName;
    this.displayName = options.displayName;
    this.instructions = options.instructions;
    this.scope = options.scope;
    this.tools = options.tools;
    this.hatches = options.hatches ?? false;
    ToolPreset.assertUniqueNames(this.id, this.toolNames());
  }

  toolNames(): string[] {
    return this.tools.map((tool) => tool.name);
  }

  /** Absolute resource URL (`aud`) for this preset under a public base URL. */
  resourceUrl(publicBaseUrl: string): string {
    return new URL(this.path, publicBaseUrl.replace(/\/+$/, "")).toString();
  }

  private static assertUniqueNames(id: string, names: string[]): void {
    const duplicates = names.filter((name, i) => names.indexOf(name) !== i);
    if (duplicates.length > 0) {
      throw new Error(`Preset ${id} publishes ${duplicates.join(", ")} twice.`);
    }
  }
}
