import type { ToolGroup } from "../presets/ToolGroup.js";

/**
 * What one caller agreed to, as the tool layer needs to ask it.
 *
 * An OAuth grant lists its scopes. A raw API key lists none: the Calypso API
 * is the authority on what that key may do, so every tool is offered and a
 * call the key cannot make fails with the API's own error.
 */
export class GrantScopes {
  private constructor(private readonly scopes: ReadonlySet<string> | null) {}

  /** Everything: a local server, or a key whose limits the API enforces. */
  static everything(): GrantScopes {
    return new GrantScopes(null);
  }

  static of(scopes: readonly string[] | undefined): GrantScopes {
    return scopes?.length
      ? new GrantScopes(new Set(scopes))
      : GrantScopes.everything();
  }

  allows(group: ToolGroup): boolean {
    return this.scopes === null || this.scopes.has(group.scope);
  }
}
