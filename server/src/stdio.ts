#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadAgentCatalog } from "./calypso/AgentCatalogLoader.js";
import { loadKnowledgeInventory } from "./calypso/KnowledgeInventory.js";
import { createElephantMcpServer } from "./ElephantMcpServer.js";
import { localPreset } from "./stdio/LocalPresets.js";
import { parseStdioOptions, USAGE } from "./stdio/StdioOptions.js";

type PackageInfo = { name: string; version: string };

async function loadPackageInfo(): Promise<PackageInfo> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const raw = await readFile(path.join(here, "..", "package.json"), "utf8");
  const { name, version } = JSON.parse(raw) as PackageInfo;
  return { name, version };
}

/**
 * Local entry point: one MCP server over stdio for the key in the
 * environment. Discovery and the inventory load once at startup; stdout
 * belongs to the protocol, so every message of our own goes to stderr.
 */
async function main(): Promise<void> {
  const options = parseStdioOptions(process.argv.slice(2), process.env);
  const packageInfo = await loadPackageInfo();
  if (options.help) {
    process.stderr.write(USAGE);
    return;
  }
  if (options.version) {
    process.stderr.write(`${packageInfo.version}\n`);
    return;
  }
  const preset = localPreset(options.preset);
  if (!options.apiKey) {
    throw new Error(
      "CALYPSO_API_KEY is not set. Create a key under API Keys in Calypso and export it before starting elephant-mcp.",
    );
  }
  const api = { apiKey: options.apiKey, apiBaseUrl: options.apiBaseUrl };
  const [agents, inventory] = await Promise.all([
    loadAgentCatalog(api),
    preset.hatches ? loadKnowledgeInventory(api).catch(() => null) : null,
  ]);
  const server = createElephantMcpServer({
    preset,
    api,
    agents,
    inventory,
    packageInfo,
    principal: "stdio",
  });
  await server.connect(new StdioServerTransport());
  process.stderr.write(
    `Elephant MCP ${packageInfo.version} (${preset.id}) on stdio; ${preset.tools.length} tools, agents from ${agents.source}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
