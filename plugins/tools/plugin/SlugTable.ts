export interface SlugEntry {
  readonly package: string;
  readonly displayName: string;
  readonly serverName: string;
  readonly endpoint: string;
  readonly scope: string;
  readonly tools: readonly string[];
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
      serverName: "elephant",
      endpoint: "https://mcp.calypso.so/elephant/mcp",
      scope: "elephant:read",
      tools: ["elephant-ask", "elephant-search", "elephant-list-buckets", "elephant-open-source"],
    },
    {
      package: "elephant-builder",
      displayName: "Elephant Builder by Calypso",
      serverName: "elephant-builder",
      endpoint: "https://mcp.calypso.so/elephant/builder/mcp",
      scope: "elephant:write",
      tools: ["elephant-add-file", "elephant-add-files", "elephant-add-website", "elephant-create-bucket"],
    },
  ];

  static find(packageName: string): SlugEntry | undefined {
    return SlugTable.ENTRIES.find((entry) => entry.package === packageName);
  }

  static archiveName(packageName: string, version: string): string {
    return `${packageName}-openai-${version}.zip`;
  }
}
