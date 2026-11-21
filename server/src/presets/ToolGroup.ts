/**
 * What a tool does to the caller's knowledge, and the consent that unlocks it.
 *
 * One endpoint offers every tool; a caller sees the groups they agreed to.
 * A group carries its own words, so the session instructions say exactly what
 * this connection can and cannot do instead of describing the whole product.
 */
export class ToolGroup {
  /** Answering and searching: never changes anything. */
  static readonly read = new ToolGroup({
    id: "read",
    scope: "elephant:read",
    can: "answer questions, search passages, list buckets and open a source",
    cannot: "",
  });

  /** Saving new sources and creating buckets. */
  static readonly add = new ToolGroup({
    id: "add",
    scope: "elephant:write",
    can: "save files, file links and web pages into buckets and create new buckets. Confirm the destination bucket with the user before adding anything",
    cannot: "add files, websites or buckets",
  });

  /** Renaming buckets and moving sources between them. Deletes nothing. */
  static readonly organise = new ToolGroup({
    id: "organise",
    scope: "elephant:organise",
    can: "rename buckets and move sources from one bucket to another. Say what will move and where before doing it",
    cannot: "rename buckets or move sources",
  });

  readonly id: string;
  /** OAuth scope a grant must carry for this group's tools. */
  readonly scope: string;
  /** Completes "It can …" for a caller who has the group. */
  readonly can: string;
  /** Completes "It cannot …" for a caller who does not. */
  readonly cannot: string;

  private constructor(options: {
    id: string;
    scope: string;
    can: string;
    cannot: string;
  }) {
    this.id = options.id;
    this.scope = options.scope;
    this.can = options.can;
    this.cannot = options.cannot;
  }
}
