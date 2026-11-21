import type { GrantScopes } from "../auth/GrantScopes.js";
import type { ElephantTool } from "../tools/ElephantTool.js";
import { PresetInstructions } from "./PresetInstructions.js";
import type { ToolGroup } from "./ToolGroup.js";

export type ToolPresetOptions = {
  /** Stable identifier, e.g. `elephant`. */
  readonly id: string;
  /** HTTP path the preset is served on, e.g. `/elephant/mcp`. */
  readonly path: string;
  /** Name returned in `initialize.serverInfo.name`. */
  readonly serverName: string;
  /** Human name shown on consent and in protected-resource metadata. */
  readonly displayName: string;
  /**
   * What the server is, in a sentence or two. What a caller can and cannot
   * do with it is added per caller; see `instructionsFor`.
   */
  readonly instructions: string;
  /**
   * OAuth scope a bearer token must carry to connect at all. Further tools
   * are unlocked by the scopes of their groups.
   */
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

  /** The groups this preset's tools belong to, in first-seen order. */
  groups(): ToolGroup[] {
    return [...new Set(this.tools.map((tool) => tool.group))];
  }

  /** Every OAuth scope a grant for this preset may carry. */
  scopes(): string[] {
    if (!this.scope) return [];
    return [...new Set([this.scope, ...this.groups().map((g) => g.scope)])];
  }

  /** The tools one caller is offered: those of the groups they agreed to. */
  toolsFor(grant: GrantScopes): ElephantTool[] {
    return this.tools.filter((tool) => grant.allows(tool.group));
  }

  /** `initialize.instructions` for one caller. */
  instructionsFor(grant: GrantScopes): string {
    return PresetInstructions.compose(this.instructions, this.groups(), grant);
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
