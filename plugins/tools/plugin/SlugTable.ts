import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface SlugEntry {
  readonly package: string;
  /** The product name, as written in prose. */
  readonly displayName: string;
  /** The directory listing title; at most 30 characters. */
  readonly listingTitle: string;
  readonly serverName: string;
  readonly endpoint: string;
  readonly scope: string;
  readonly tools: readonly string[];
}

/** What a packaging root is checked against: its website and its packages. */
export interface Slugs {
  readonly website: string;
  readonly entries: readonly SlugEntry[];
}

/**
 * The binding slug table from the Elephant plan (§0.1 / §0.2). Profiles are
 * checked against it by `NamingRule`; changing a value here is a product
 * decision, not a refactor.
 */
export class SlugTable {
  static readonly AUTHOR = "Calypso";
  static readonly WEBSITE = "https://www.calypso.so/elephant";
  static readonly MCP_ORIGIN = "https://mcp.calypso.so";

  static readonly ENTRIES: readonly SlugEntry[] = [
    {
      package: "elephant",
      displayName: "Elephant by Calypso",
      listingTitle: "Elephant: PDF AI & Docs Q&A",
      serverName: "elephant",
      endpoint: "https://mcp.calypso.so/elephant/mcp",
      scope: "elephant:read",
      // One plugin for everything since 2.0. `scope` is what connecting
      // needs; saving and organising are further scopes the user may allow.
      tools: [
        "elephant-ask",
        "elephant-search",
        "elephant-list-buckets",
        "elephant-open-source",
        "elephant-add-file",
        "elephant-add-files",
        "elephant-add-website",
        "elephant-create-bucket",
        "elephant-rename-bucket",
        "elephant-move-sources",
      ],
    },
    {
      package: "elephant-builder",
      displayName: "Elephant Builder by Calypso",
      listingTitle: "Elephant Builder: Save PDFs",
      serverName: "elephant-builder",
      endpoint: "https://mcp.calypso.so/elephant/builder/mcp",
      scope: "elephant:write",
      tools: ["elephant-add-file", "elephant-add-files", "elephant-add-website", "elephant-create-bucket"],
    },
  ];

  /** A packaging root other than Elephant's keeps its table here, in the shape of {@link Slugs}. */
  static readonly FILE = "slugs.json";

  /**
   * The table for the packaging root a profile lives in (`<root>/profiles/<name>`).
   * Elephant's is the one above; another product's root, built with `--root`,
   * brings its own in `slugs.json`.
   */
  static forProfile(directory: string): Slugs {
    const path = join(resolve(directory, "..", ".."), SlugTable.FILE);
    if (!existsSync(path)) return { website: SlugTable.WEBSITE, entries: SlugTable.ENTRIES };
    return JSON.parse(readFileSync(path, "utf8")) as Slugs;
  }

  static find(packageName: string): SlugEntry | undefined {
    return SlugTable.ENTRIES.find((entry) => entry.package === packageName);
  }

  static archiveName(packageName: string, version: string): string {
    return `${packageName}-openai-${version}.zip`;
  }
}
