// Probes the local stdio server the way an MCP client starts it.
//
//   npm run smoke:stdio                       # placeholder key; discovery falls back
//   SMOKE_API_KEY=sk-... npm run smoke:stdio  # real key: lists the team's buckets too
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const { ToolPresetRegistry } = await import(
  path.join(repoRoot, "dist/presets/ToolPresetRegistry.js")
);
const { localPreset } = await import(
  path.join(repoRoot, "dist/stdio/LocalPresets.js")
);

const apiKey = process.env.SMOKE_API_KEY;
const env = {
  PATH: process.env.PATH,
  CALYPSO_API_KEY: apiKey ?? "sk-smoke-placeholder",
  ...(process.env.CALYPSO_API_BASE_URL
    ? { CALYPSO_API_BASE_URL: process.env.CALYPSO_API_BASE_URL }
    : apiKey
      ? {}
      : { CALYPSO_API_BASE_URL: "http://127.0.0.1:1/v1" }),
};

const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures.push(label);
};

const presets = ["all", ...ToolPresetRegistry.all().map((p) => p.id)];
for (const id of presets) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repoRoot, "dist/stdio.js"), "--preset", id],
    env,
    stderr: "pipe",
  });
  const client = new Client({ name: "smoke-stdio", version: "0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const expected = localPreset(id).toolNames();
    check(
      JSON.stringify(tools.map((t) => t.name)) === JSON.stringify(expected),
      `${id}: tools/list = ${expected.join(", ")}`,
    );
    if (apiKey && expected.includes("elephant-list-buckets")) {
      const result = await client.callTool({
        name: "elephant-list-buckets",
        arguments: {},
      });
      check(!result.isError, `${id}: elephant-list-buckets answers`);
    }
  } catch (error) {
    check(false, `${id}: ${error instanceof Error ? error.message : error}`);
  } finally {
    await client.close().catch(() => {});
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed.`);
  process.exit(1);
}
console.log("\nstdio smoke passed.");
