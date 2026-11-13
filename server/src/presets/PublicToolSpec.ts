/**
 * How one canonical Calypso tool is presented on a preset.
 *
 * The canonical id (`calypso-agent`, …) is the handler's identity and never
 * changes; a preset may publish it under another name and voice. Elephant uses
 * this to expose `elephant-ask` for `calypso-agent` without registering the
 * tool twice.
 */
export type PublicToolSpec = {
  /** Name clients see in `tools/list` and call with `tools/call`. */
  readonly name: string;
  /** Optional human title (`Tool.title`). */
  readonly title?: string;
  /** Replaces the canonical description entirely when present. */
  readonly description?: string;
  /**
   * Replaces input descriptions by field name. `items.filename` reaches one
   * level into an array-of-objects field. Fields not listed keep the
   * canonical wording.
   */
  readonly inputDescriptions?: Readonly<Record<string, string>>;
};
