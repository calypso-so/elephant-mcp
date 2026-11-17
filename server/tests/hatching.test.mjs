import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  KnowledgeInventory,
  summarizeKnowledge,
} from "../dist/calypso/KnowledgeInventory.js";
import { createElephantMcpServer } from "../dist/ElephantMcpServer.js";
import {
  emptyKnowledgeAnswer,
  hatchingCard,
  hatchingExamples,
  hatchingInstructions,
} from "../dist/hatching/HatchingCopy.js";
import { KnowledgeInventoryCache } from "../dist/http/KnowledgeInventoryCache.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

const API_BASE = "https://api.example.test/v1";
const agents = {
  models: [{ id: "calypso-agent" }],
  defaultModel: "calypso-agent",
  fetchedAt: null,
  source: "api",
};

const EMPTY = {
  bucketCount: 0,
  readyFileCount: 0,
  bucketNames: [],
  isEmpty: true,
};
const FILLED = {
  bucketCount: 2,
  readyFileCount: 41,
  bucketNames: ["Policies", "Pricing"],
  isEmpty: false,
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function stubCalypso(respond) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return respond(String(url), init);
  };
  return calls;
}

async function connect(preset, inventory) {
  const server = createElephantMcpServer({
    preset,
    api: { apiKey: "sk-test", apiBaseUrl: API_BASE },
    agents,
    inventory,
    packageInfo: {
      name: "@calypsohq/elephant-mcp-server",
      version: "0.0.0-test",
    },
    principal: "key:sk-…test",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "hatching-test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

// --- the words ---------------------------------------------------------------

test("instructions: the preset's text when unknown, the hatch when empty, a citing note otherwise", () => {
  const base = "Base instructions.";
  assert.equal(hatchingInstructions(base, null), base);
  assert.match(hatchingInstructions(base, EMPTY), /nothing in it yet/);
  assert.match(hatchingInstructions(base, EMPTY), /elephant-get-started/);
  assert.doesNotMatch(hatchingInstructions(base, EMPTY), /Base instructions/);
  assert.match(
    hatchingInstructions(base, FILLED),
    /^Base instructions\. Every answer cites its source/,
  );
});

test("the card: three steps and one link for an empty team, a tour with live counts otherwise", () => {
  const hatch = hatchingCard(EMPTY);
  assert.match(hatch, /Elephant is connected/);
  assert.match(hatch, /1\. \*\*Add a first source\*\*/);
  assert.match(hatch, /2\. \*\*Wait for "ready"\*\*/);
  assert.match(hatch, /3\. \*\*Trust, then verify\*\*/);
  assert.equal((hatch.match(/https?:\/\//g) ?? []).length, 1, "one link");
  assert.doesNotMatch(hatch, /OAuth|token|MCP/);
  assert.equal(
    hatchingCard(null),
    hatch,
    "unknown reads as empty for the card",
  );
  assert.equal(emptyKnowledgeAnswer(), hatch);

  const tour = hatchingCard(FILLED);
  assert.match(tour, /2 buckets, 41 sources ready/);
  assert.match(tour, /What do we have in Policies\?/);
  assert.doesNotMatch(tour, /Add a first source/);
  assert.deepEqual(hatchingExamples(FILLED).length, 3);
  assert.equal(hatchingExamples(EMPTY)[0], "What does our refund policy say?");
});

// --- the facts ---------------------------------------------------------------

test("summarizeKnowledge counts active buckets and their files, and calls none or none-ready empty", () => {
  const list = (buckets) => ({ team_id: "t", buckets });
  const bucket = (over) => ({
    id: "b",
    knowledgeIds: [],
    fileIds: [],
    fileKnowledgeIds: [],
    counts: {},
    ...over,
  });
  assert.deepEqual(summarizeKnowledge(list([])), EMPTY);
  assert.equal(
    summarizeKnowledge(list([bucket({ name: "Empty", fileCount: 0 })])).isEmpty,
    true,
  );
  assert.equal(
    summarizeKnowledge(
      list([bucket({ name: "Old", status: "archived", fileCount: 9 })]),
    ).isEmpty,
    true,
    "archived buckets do not count",
  );
  const filled = summarizeKnowledge(
    list([
      bucket({
        id: "a",
        name: "Policies",
        retrievableFileCount: 3,
        fileCount: 5,
      }),
      bucket({ id: "b", name: " Pricing ", fileIds: ["f1", "f2"] }),
    ]),
  );
  assert.deepEqual(filled, {
    bucketCount: 2,
    readyFileCount: 5,
    bucketNames: ["Policies", "Pricing"],
    isEmpty: false,
  });
});

test("KnowledgeInventory: null without a seed, the seed when it has knowledge, one fresh read when empty", async () => {
  let reloads = 0;
  const reload = async () => {
    reloads += 1;
    return {
      team_id: "t",
      buckets: [
        {
          id: "n",
          name: "New",
          knowledgeIds: [],
          fileIds: ["f"],
          fileKnowledgeIds: [],
          counts: {},
        },
      ],
    };
  };
  assert.equal(await new KnowledgeInventory(null, reload).current(), null);
  assert.equal(reloads, 0);
  assert.equal(await new KnowledgeInventory(FILLED, reload).current(), FILLED);
  assert.equal(reloads, 0);
  const seededEmpty = new KnowledgeInventory(EMPTY, reload);
  const first = await seededEmpty.current();
  const second = await seededEmpty.current();
  assert.equal(first.isEmpty, false, "a source added seconds ago is seen");
  assert.equal(second, first, "read once per request");
  assert.equal(reloads, 1);
  const failing = new KnowledgeInventory(EMPTY, async () => {
    throw new Error("down");
  });
  assert.equal(
    await failing.current(),
    EMPTY,
    "a failed re-read keeps the seed",
  );
});

test("KnowledgeInventoryCache caches per key within the TTL and never caches a failure", async () => {
  let now = 1_000;
  let loads = 0;
  const cache = new KnowledgeInventoryCache(
    20_000,
    10,
    async () => {
      loads += 1;
      if (loads === 1) throw new Error("down");
      return FILLED;
    },
    () => now,
  );
  const config = { apiKey: "sk-a", apiBaseUrl: API_BASE };
  assert.equal(await cache.get(config), null, "a failed load reads as unknown");
  assert.equal(await cache.get(config), FILLED, "and is not cached");
  assert.equal(await cache.get(config), FILLED);
  assert.equal(loads, 2);
  now += 20_001;
  assert.equal(await cache.get(config), FILLED);
  assert.equal(loads, 3, "reloaded after the TTL");
});

// --- the protocol ------------------------------------------------------------

test("initialize carries the empty-team instructions when the inventory is empty, the normal ones otherwise", async () => {
  const empty = await connect(ToolPresetRegistry.elephant, EMPTY);
  assert.match(empty.getInstructions() ?? "", /nothing in it yet/);
  const filled = await connect(ToolPresetRegistry.elephant, FILLED);
  assert.match(filled.getInstructions() ?? "", /^Elephant by Calypso answers/);
  assert.match(filled.getInstructions() ?? "", /elephant-open-source/);
  const unknown = await connect(ToolPresetRegistry.elephant, null);
  assert.match(unknown.getInstructions() ?? "", /^Elephant by Calypso answers/);
  assert.doesNotMatch(unknown.getInstructions() ?? "", /elephant-open-source/);
});

test("the elephant-get-started prompt renders the card from the live inventory; Builder has no prompt", async () => {
  const client = await connect(ToolPresetRegistry.elephant, FILLED);
  const { messages } = await client.getPrompt({ name: "elephant-get-started" });
  assert.equal(messages.length, 1);
  assert.match(messages[0].content.text, /2 buckets, 41 sources ready/);

  const builder = await connect(ToolPresetRegistry.elephantBuilder, EMPTY);
  assert.equal(builder.getServerCapabilities()?.prompts, undefined);
  assert.match(builder.getInstructions() ?? "", /^Elephant Builder/);
});

test("elephant-ask and elephant-search answer an empty team with the hatch and never call the agent", async () => {
  const calls = stubCalypso((url) => {
    if (url.endsWith("/knowledge/buckets"))
      return json({ team_id: "t", buckets: [] });
    throw new Error(`unexpected call ${url}`);
  });
  const client = await connect(ToolPresetRegistry.elephant, EMPTY);
  const asked = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "What is our refund window?" },
  });
  assert.equal(asked.isError, undefined);
  assert.match(asked.content[0].text, /Add a first source/);
  const searched = await client.callTool({
    name: "elephant-search",
    arguments: { query: "refund" },
  });
  assert.match(searched.content[0].text, /Add a first source/);
  assert.ok(
    calls.every((call) => call.url.endsWith("/knowledge/buckets")),
    "only the inventory re-read",
  );
  assert.ok(calls.length <= 2);
});

test("with knowledge present the tools call Calypso as before", async () => {
  const calls = stubCalypso((url) => {
    if (url.endsWith("/responses")) {
      return json({
        id: "resp_1",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "30 days." }],
          },
        ],
      });
    }
    throw new Error(`unexpected call ${url}`);
  });
  const client = await connect(ToolPresetRegistry.elephant, FILLED);
  const asked = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "Refund window?" },
  });
  assert.equal(asked.isError, undefined);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/responses"));
});
