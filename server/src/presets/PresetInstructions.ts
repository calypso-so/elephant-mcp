import type { GrantScopes } from "../auth/GrantScopes.js";
import type { ToolGroup } from "./ToolGroup.js";

/**
 * The session instructions for one caller: what the server is, then what this
 * connection can do and what it cannot.
 *
 * Composed from the groups the caller holds, so a read-only session is never
 * told it can save a file, and a session that can is told to confirm first.
 * What it cannot do comes with the way to get it, because the model is the
 * only one who can tell the user.
 */
/**
 * Said to every caller, whatever they allowed. A model asked to delete tends
 * to go looking for the thing first; looking is a tool call, and the honest
 * answer needs none.
 */
export const NEVER_DELETES =
  "Elephant never deletes. When the user asks to delete, remove, erase or forget a source or a bucket, do not call any tool, not even to look for it: say that Elephant cannot delete and that sources and buckets are removed in the Elephant console at https://elephant.calypso.so.";

export const PresetInstructions = {
  compose(
    about: string,
    groups: readonly ToolGroup[],
    grant: GrantScopes,
  ): string {
    const held = groups.filter((group) => grant.allows(group));
    const missing = groups.filter(
      (group) => !grant.allows(group) && group.cannot,
    );
    const lines = [about];
    for (const group of held) {
      if (group.id !== "read") lines.push(`It can ${group.can}.`);
    }
    if (missing.length > 0) {
      const what = missing.map((group) => group.cannot).join(", or ");
      lines.push(
        `This connection cannot ${what}: the user did not allow it when connecting. If they ask for that, say so and tell them to reconnect Elephant and allow it. Never claim to have done it.`,
      );
    }
    if (held.length === 1 && missing.length === 0) {
      lines.push("It only reads: it cannot add, change or delete knowledge.");
    }
    lines.push(NEVER_DELETES);
    return lines.join(" ");
  },
};
