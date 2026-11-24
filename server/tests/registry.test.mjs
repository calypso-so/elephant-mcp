import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// server.json is what the MCP Registry lists. The registry refuses a server
// whose npm package does not carry the same name (`mcpName`) at the same
// version, so the two files are held together here, not found out at publish.

const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const pkg = read("../package.json");
const server = read("../server.json");
const local = server.packages[0];

test("server.json and package.json name the same server and version", () => {
  assert.equal(server.name, "io.github.calypso-so/elephant-mcp-server");
  assert.equal(pkg.mcpName, server.name);
  assert.equal(server.version, pkg.version);
  assert.equal(local.registryType, "npm");
  assert.equal(local.identifier, pkg.name);
  assert.equal(local.version, pkg.version);
  assert.equal(local.transport.type, "stdio");
});

test("server.json stays inside the registry's limits", () => {
  assert.ok(
    server.description.length <= 100,
    "description is 100 characters at most",
  );
  assert.ok(server.title.length <= 100, "title is 100 characters at most");
  assert.match(server.name, /^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
});

test("server.json points at the hosted endpoint and this repository", async () => {
  const { ToolPresetRegistry } = await import(
    "../dist/presets/ToolPresetRegistry.js"
  );
  assert.deepEqual(server.remotes, [
    {
      type: "streamable-http",
      url: ToolPresetRegistry.elephant.resourceUrl("https://mcp.calypso.so/"),
    },
  ]);
  assert.equal(
    server.repository.url,
    "https://github.com/calypso-so/elephant-mcp",
  );
  assert.equal(server.repository.subfolder, "server");
});

test("server.json documents the environment the local server reads", async () => {
  const { USAGE } = await import("../dist/stdio/StdioOptions.js");
  const names = local.environmentVariables.map((variable) => variable.name);
  assert.deepEqual(names, [
    "CALYPSO_API_KEY",
    "ELEPHANT_PRESET",
    "CALYPSO_API_BASE_URL",
  ]);
  for (const name of names) assert.match(USAGE, new RegExp(name));
  const key = local.environmentVariables[0];
  assert.equal(key.isRequired, true);
  assert.equal(key.isSecret, true);
});
