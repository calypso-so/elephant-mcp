import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";
import { localPreset } from "../dist/stdio/LocalPresets.js";
import { parseStdioOptions } from "../dist/stdio/StdioOptions.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "dist", "stdio.js");
// Nothing listens here: discovery falls back and the inventory stays unknown.
const UNREACHABLE_API = "http://127.0.0.1:1/v1";

const run = (args, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], {
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });

const connect = async (args, env) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry, ...args],
    env: { PATH: process.env.PATH, ...env },
    stderr: "pipe",
  });
  const client = new Client({ name: "stdio-test", version: "0" });
  await client.connect(transport);
  return { client, close: () => client.close() };
};

test("parseStdioOptions: flags beat env, env beats defaults", () => {
  const base = { CALYPSO_API_KEY: " sk-test " };
  assert.equal(parseStdioOptions([], base).preset, "all");
  assert.equal(parseStdioOptions([], base).apiKey, "sk-test");
  assert.equal(
    parseStdioOptions([], base).apiBaseUrl,
    "https://api.calypso.so/v1",
  );
  assert.equal(
    parseStdioOptions([], { ...base, ELEPHANT_PRESET: "elephant" }).preset,
    "elephant",
  );
  assert.equal(
    parseStdioOptions(["--preset", "elephant-builder"], {
      ...base,
      ELEPHANT_PRESET: "elephant",
    }).preset,
    "elephant-builder",
  );
  assert.equal(parseStdioOptions(["--preset=all"], base).preset, "all");
  assert.equal(
    parseStdioOptions([], { ...base, CALYPSO_API_BASE_URL: "http://x/v1/" })
      .apiBaseUrl,
    "http://x/v1",
  );
  assert.throws(
    () => parseStdioOptions([], { CALYPSO_API_BASE_URL: "http://x" }),
    /must end in \/v1/,
  );
  assert.throws(() => parseStdioOptions(["--bogus"], base), /Unknown option/);
  assert.throws(() => parseStdioOptions(["--preset"], base), /needs a value/);
});

test("localPreset: all = both hosted tool sets, hosted ids unchanged", () => {
  const all = localPreset("all");
  assert.deepEqual(all.toolNames(), [
    ...ToolPresetRegistry.elephant.toolNames(),
    ...ToolPresetRegistry.elephantBuilder.toolNames(),
  ]);
  assert.equal(all.hatches, true);
  assert.equal(all.serverName, "elephant");
  assert.match(all.instructions, /cites every source/);
  assert.match(all.instructions, /can also add files/);
  assert.doesNotMatch(all.instructions, /use Elephant Builder/);
  assert.equal(localPreset("elephant"), ToolPresetRegistry.elephant);
  assert.equal(
    localPreset("elephant-builder"),
    ToolPresetRegistry.elephantBuilder,
  );
  assert.throws(() => localPreset("nope"), /Unknown preset "nope"/);
  // The local-only preset never becomes an HTTP endpoint.
  assert.equal(
    ToolPresetRegistry.all().some((preset) => preset.id === "all"),
    false,
  );
});

test("stdio: refuses to start without a key, says how to get one", async () => {
  const result = await run([], { CALYPSO_API_BASE_URL: UNREACHABLE_API });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /CALYPSO_API_KEY is not set/);
  assert.match(result.stderr, /API Keys/);
});

test("stdio: unknown preset and unknown flag exit 1 on stderr", async () => {
  const env = {
    CALYPSO_API_KEY: "sk-test",
    CALYPSO_API_BASE_URL: UNREACHABLE_API,
  };
  const preset = await run(["--preset", "nope"], env);
  assert.equal(preset.code, 1);
  assert.match(preset.stderr, /Unknown preset "nope"/);
  const flag = await run(["--frobnicate"], env);
  assert.equal(flag.code, 1);
  assert.match(flag.stderr, /Unknown option: --frobnicate/);
});

test("stdio: --help and --version write to stderr and exit 0", async () => {
  const help = await run(["--help"], {});
  assert.equal(help.code, 0);
  assert.equal(help.stdout, "");
  assert.match(help.stderr, /Usage: elephant-mcp/);
  const version = await run(["--version"], {});
  assert.equal(version.code, 0);
  assert.match(version.stderr, /^\d+\.\d+\.\d+\n$/);
});

test("stdio: serves every tool by default, with the Elephant identity", async () => {
  const { client, close } = await connect([], {
    CALYPSO_API_KEY: "sk-test",
    CALYPSO_API_BASE_URL: UNREACHABLE_API,
  });
  try {
    const info = client.getServerVersion();
    assert.equal(info.name, "elephant");
    assert.equal(info.title, "Elephant by Calypso");
    assert.match(client.getInstructions(), /cites every source/);
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      localPreset("all").toolNames(),
    );
    const { prompts } = await client.listPrompts();
    assert.deepEqual(
      prompts.map((prompt) => prompt.name),
      ["elephant-get-started"],
    );
  } finally {
    await close();
  }
});

test("stdio: --preset elephant publishes the read-only set alone", async () => {
  const { client, close } = await connect(["--preset", "elephant"], {
    CALYPSO_API_KEY: "sk-test",
    CALYPSO_API_BASE_URL: UNREACHABLE_API,
  });
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((tool) => tool.name),
      ToolPresetRegistry.elephant.toolNames(),
    );
  } finally {
    await close();
  }
});

test("stdio: a tool call reaches the API with the key and reports failure as a tool error", async () => {
  const { client, close } = await connect(["--preset", "elephant"], {
    CALYPSO_API_KEY: "sk-test",
    CALYPSO_API_BASE_URL: UNREACHABLE_API,
  });
  try {
    const result = await client.callTool({
      name: "elephant-list-buckets",
      arguments: {},
    });
    assert.equal(result.isError, true);
  } finally {
    await close();
  }
});
