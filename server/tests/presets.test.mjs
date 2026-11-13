import assert from "node:assert/strict";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { resolveUploadContent } from "../dist/files.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";
import { createElephantMcpServer } from "../dist/server.js";

const modelCatalog = {
  models: [{ id: "calypso-agent" }],
  defaultModel: "calypso-agent",
  fetchedAt: null,
  source: "fallback",
};

async function connect(preset, { localFileAccess = false } = {}) {
  const server = createElephantMcpServer({
    config: {
      apiKey: "sk-test",
      apiBaseUrl: "https://api.example.test/v1",
      localFileAccess,
    },
    modelCatalog,
    packageInfo: {
      name: "@calypsohq/elephant-mcp-server",
      version: "0.0.0-test",
    },
    preset,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "preset-test", version: "0.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

test("elephant publishes exactly its four read-only tools, Elephant-named", async () => {
  const client = await connect(ToolPresetRegistry.elephant, {
    localFileAccess: false,
  });
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "elephant-search",
      "elephant-list-buckets",
      "elephant-open-source",
      "elephant-ask",
    ].sort((a, b) => order(a) - order(b)),
  );
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.doesNotMatch(tool.description ?? "", /calypso-[a-z]/, tool.name);
    assert.doesNotMatch(tool.description ?? "", /npx|filePath/, tool.name);
  }
  assert.equal(client.getServerVersion().name, "elephant");
  assert.match(client.getInstructions() ?? "", /Elephant by Calypso/);
});

// Registration order in server.ts decides tools/list order.
function order(name) {
  return [
    "elephant-search",
    "elephant-list-buckets",
    "elephant-open-source",
    "elephant-ask",
  ].indexOf(name);
}

test("elephant exposes no Calypso resources or prompts", async () => {
  const client = await connect(ToolPresetRegistry.elephant, {
    localFileAccess: false,
  });
  assert.equal(client.getServerCapabilities()?.resources, undefined);
  assert.equal(client.getServerCapabilities()?.prompts, undefined);
});

test("elephant-builder publishes the four add/create tools without filePath", async () => {
  const client = await connect(ToolPresetRegistry.elephantBuilder, {
    localFileAccess: false,
  });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "elephant-add-file",
    "elephant-add-files",
    "elephant-add-website",
    "elephant-create-bucket",
  ]);
  const addFile = tools.find((tool) => tool.name === "elephant-add-file");
  assert.ok(!("filePath" in addFile.inputSchema.properties));
  assert.ok("sourceUrl" in addFile.inputSchema.properties);
  const addFiles = tools.find((tool) => tool.name === "elephant-add-files");
  assert.ok(
    !("filePath" in addFiles.inputSchema.properties.items.items.properties),
  );
  assert.ok(
    "contentBase64" in addFiles.inputSchema.properties.items.items.properties,
  );
});

test("calling an Elephant tool reaches the canonical handler", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ team_id: "t1", buckets: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const client = await connect(ToolPresetRegistry.elephant, {
      localFileAccess: false,
    });
    const result = await client.callTool({
      name: "elephant-list-buckets",
      arguments: {},
    });
    assert.equal(result.isError, undefined);
    assert.ok(calls[0].url.endsWith("/v1/knowledge/buckets"));
    assert.equal(
      new Headers(calls[0].init.headers).get("Authorization"),
      "Bearer sk-test",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a canonical name is not callable on an Elephant endpoint", async () => {
  const client = await connect(ToolPresetRegistry.elephant, {
    localFileAccess: false,
  });
  const result = await client.callTool({
    name: "calypso-list-buckets",
    arguments: {},
  });
  assert.equal(result.isError, true);
});

test("hosted uploads refuse filePath at call time, not just in the schema", async () => {
  await assert.rejects(
    resolveUploadContent(
      { filename: "passwd", mimeType: "text/plain", filePath: "/etc/passwd" },
      { localFileAccess: false },
    ),
    /not available on the hosted/,
  );
});

test("presets have unique paths and public names", () => {
  const presets = ToolPresetRegistry.all();
  assert.equal(new Set(presets.map((p) => p.path)).size, presets.length);
  assert.equal(
    ToolPresetRegistry.elephant.resourceUrl("https://mcp.calypso.so/"),
    "https://mcp.calypso.so/elephant/mcp",
  );
});

test("nothing an Elephant endpoint publishes names Calypso tools, resources or local installs", async () => {
  for (const preset of [
    ToolPresetRegistry.elephant,
    ToolPresetRegistry.elephantBuilder,
  ]) {
    const client = await connect(preset, { localFileAccess: false });
    const { tools } = await client.listTools();
    for (const tool of tools) {
      // Whole tool, including every input description, not just the summary.
      const published = JSON.stringify(tool);
      assert.doesNotMatch(
        published,
        /calypso-[a-z]|calypso:\/\/|filePath|npx|Claude Desktop|Cursor/,
        `${preset.id}/${tool.name}`,
      );
      assert.match(tool.name, /^elephant-[a-z]+(-[a-z]+)*$/);
    }
  }
});
