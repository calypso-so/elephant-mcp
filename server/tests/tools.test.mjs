import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createElephantMcpServer } from "../dist/ElephantMcpServer.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

const API_BASE = "https://api.example.test/v1";
const agents = {
  models: [{ id: "elephant-agent" }, { id: "elephant-agent:sales" }],
  defaultModel: "elephant-agent",
  fetchedAt: null,
  source: "api",
};

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/**
 * Records every outgoing call and answers with `respond(url, init)`. JSON
 * bodies are parsed; file bytes sent to storage are left as they are.
 */
function stubCalypso(respond) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      init,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return respond(String(url), init);
  };
  return calls;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function connect(preset, scopes) {
  const server = createElephantMcpServer({
    preset,
    scopes,
    api: { apiKey: "sk-test", apiBaseUrl: API_BASE },
    agents,
    packageInfo: {
      name: "@calypsohq/elephant-mcp-server",
      version: "0.0.0-test",
    },
    principal: "key:sk-…test",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "tools-test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const text = (result) => result.content.map((part) => part.text).join("");

const READ_TOOLS = [
  "elephant-ask",
  "elephant-search",
  "elephant-list-buckets",
  "elephant-open-source",
];
const ADD_TOOLS = [
  "elephant-add-file",
  "elephant-add-files",
  "elephant-add-website",
  "elephant-create-bucket",
];
const ORGANISE_TOOLS = ["elephant-rename-bucket", "elephant-move-sources"];

test("a caller who only allowed reading sees the four reading tools", async () => {
  const client = await connect(ToolPresetRegistry.elephant, ["elephant:read"]);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    READ_TOOLS,
  );
  // A directory review reads these three as explicit booleans on every tool.
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    assert.equal(tool.annotations?.openWorldHint, false, tool.name);
  }
  // The session is told what it cannot do, and how the user gets it.
  const instructions = client.getInstructions() ?? "";
  assert.match(instructions, /cannot add files, websites or buckets/);
  assert.match(instructions, /rename buckets or move sources/);
  assert.match(instructions, /reconnect Elephant and allow it/);
  // A request to delete is answered without a tool call, for every caller.
  assert.match(instructions, /Elephant never deletes/);
  assert.match(instructions, /do not call any tool, not even to look for it/);
  assert.doesNotMatch(instructions, /It can save files/);
  // A tool the caller was not offered does not exist for them.
  const refused = await client
    .callTool({ name: "elephant-create-bucket", arguments: { name: "x" } })
    .then(
      (result) => result.isError === true,
      () => true,
    );
  assert.equal(refused, true);
});

test("each consent adds its own tools and its own instructions", async () => {
  const adding = await connect(ToolPresetRegistry.elephant, [
    "elephant:read",
    "elephant:write",
  ]);
  assert.deepEqual(
    (await adding.listTools()).tools.map((tool) => tool.name),
    [...READ_TOOLS, ...ADD_TOOLS],
  );
  assert.match(adding.getInstructions() ?? "", /It can save files/);
  assert.match(
    adding.getInstructions() ?? "",
    /cannot rename buckets or move sources/,
  );

  const everything = await connect(ToolPresetRegistry.elephant, [
    "elephant:read",
    "elephant:write",
    "elephant:organise",
  ]);
  const { tools } = await everything.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [...READ_TOOLS, ...ADD_TOOLS, ...ORGANISE_TOOLS],
  );
  assert.doesNotMatch(
    everything.getInstructions() ?? "",
    /This connection cannot/,
  );
  assert.match(everything.getInstructions() ?? "", /Elephant never deletes/);
  // Nothing in this release deletes. Only a rename is destructive, because it
  // overwrites the bucket's name and description; only the reading tools may
  // claim to be read-only.
  for (const tool of tools) {
    assert.equal(
      tool.annotations?.destructiveHint,
      tool.name === "elephant-rename-bucket",
      tool.name,
    );
    assert.equal(
      tool.annotations?.readOnlyHint,
      READ_TOOLS.includes(tool.name),
      tool.name,
    );
  }
});

test("an API key is offered every tool: the API decides what it may do", async () => {
  const client = await connect(ToolPresetRegistry.elephant);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 10);
  assert.equal(client.getServerVersion().name, "elephant");
  assert.match(client.getInstructions() ?? "", /Elephant by Calypso/);
  assert.equal(client.getServerCapabilities()?.resources, undefined);
  // Elephant hatches: it publishes the one `elephant-get-started` prompt.
  assert.ok(client.getServerCapabilities()?.prompts);
  const { prompts } = await client.listPrompts();
  assert.deepEqual(
    prompts.map((prompt) => prompt.name),
    ["elephant-get-started"],
  );
});

test("Elephant Builder publishes its four write tools", async () => {
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "elephant-add-file",
      "elephant-add-files",
      "elephant-add-website",
      "elephant-create-bucket",
    ],
  );
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, false, tool.name);
    assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    assert.equal(typeof tool.annotations?.openWorldHint, "boolean", tool.name);
  }
});

test("nothing either endpoint publishes names Calypso tools, local files or other clients", async () => {
  for (const preset of ToolPresetRegistry.all()) {
    const client = await connect(preset);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      // The whole tool, including every input description and _meta.
      const published = JSON.stringify(tool);
      assert.doesNotMatch(
        published,
        /calypso-(?!agent\b)[a-z]|calypso:\/\/|filePath|npx|stdio|Claude Desktop|Cursor|Smithery/,
        `${preset.id}/${tool.name}`,
      );
      assert.match(tool.name, /^elephant-[a-z]+(-[a-z]+)*$/);
    }
  }
});

test("elephant-add-file declares the ChatGPT file input as OpenAI requires", async () => {
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const { tools } = await client.listTools();
  const addFile = tools.find((tool) => tool.name === "elephant-add-file");
  assert.deepEqual(addFile._meta, { "openai/fileParams": ["file"] });
  const file = addFile.inputSchema.properties.file;
  assert.deepEqual(Object.keys(file.properties).sort(), [
    "download_url",
    "file_id",
    "file_name",
    "mime_type",
  ]);
  assert.deepEqual(file.required.sort(), ["download_url", "file_id"]);
  assert.ok(!("filePath" in addFile.inputSchema.properties));
  for (const tool of tools.filter(
    (item) => item.name !== "elephant-add-file",
  )) {
    assert.equal(tool._meta, undefined, tool.name);
  }
});

test("a ChatGPT attachment is imported by Calypso from its download link", async () => {
  const calls = stubCalypso(() =>
    json({
      knowledge_id: "k1",
      task_id: "t1",
      ingestion_status: "queued",
      filename: "Price list.pdf",
    }),
  );
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const result = await client.callTool({
    name: "elephant-add-file",
    arguments: {
      file: {
        download_url: "https://files.oaiusercontent.test/abc?sig=1",
        file_id: "file_123",
        mime_type: "application/pdf",
        file_name: "Price list.pdf",
      },
      bucket: "sales",
    },
  });
  assert.equal(result.isError, undefined, text(result));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${API_BASE}/knowledge/files/import-url`);
  assert.deepEqual(calls[0].body, {
    url: "https://files.oaiusercontent.test/abc?sig=1",
    title: "Price list.pdf",
    bucket: "sales",
  });
  assert.equal(JSON.parse(text(result)).file.id, "k1");
});

test("an attachment cannot be combined with another source or lack an https link", async () => {
  stubCalypso(() => json({}));
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const both = await client.callTool({
    name: "elephant-add-file",
    arguments: {
      file: { download_url: "https://x.test/a", file_id: "f" },
      sourceUrl: "https://example.com/b.pdf",
      bucket: "sales",
    },
  });
  assert.equal(both.isError, true);
  assert.match(text(both), /one source/);

  const insecure = await client.callTool({
    name: "elephant-add-file",
    arguments: {
      file: { download_url: "http://x.test/a", file_id: "f" },
      bucket: "sales",
    },
  });
  assert.equal(insecure.isError, true);
});

test("elephant-ask streams one stateless question to the connector agent", async () => {
  const sse = [
    { type: "response.output_text.delta", delta: "Refunds within " },
    { type: "response.output_text.delta", delta: "14 days [1]." },
    { type: "response.completed", response: { id: "resp_1" } },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  const calls = stubCalypso(
    () =>
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "What is the refund policy?" },
  });

  assert.equal(text(result), "Refunds within 14 days [1].");
  assert.equal(calls[0].url, `${API_BASE}/responses`);
  assert.equal(
    new Headers(calls[0].init.headers).get("Authorization"),
    "Bearer sk-test",
  );
  const body = calls[0].body;
  // No `model`: the connection's own agent, which reads every bucket.
  assert.equal(body.model, "elephant-agent:mcp");
  assert.equal(body.stream, true);
  assert.match(body.conversation.id, /^conv_[0-9a-f]{32}$/);
  assert.equal(body.previous_response_id, undefined);
  assert.equal(body.input[0].content[0].text, "What is the refund policy?");
});

async function askWith(completed) {
  const sse = [
    { type: "response.output_text.delta", delta: "Returns within 30 days." },
    { type: "response.completed", response: { id: "resp_2", ...completed } },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  stubCalypso(
    () =>
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  return text(
    await client.callTool({
      name: "elephant-ask",
      arguments: { prompt: "What is the refund policy?" },
    }),
  );
}

test("elephant-ask lists the sources the API reports beside the answer", async () => {
  const answer = await askWith({
    metadata: {
      _aicore: {
        grounded_sources: [
          {
            filename: "Refund-Policy.pdf",
            knowledge_id: "kb_refund",
            page_number: 1,
          },
          // The same file and page cited again is one line, not two.
          {
            filename: "Refund-Policy.pdf",
            knowledge_id: "kb_refund",
            page_number: 1,
          },
          {
            filename: "Shipping-Policy.pdf",
            knowledge_id: "kb_ship",
            page_label: "p. 2",
          },
          { title: "Returns", url: "https://example.test/returns" },
          { quote: "no name, no url: not a source a reader can follow" },
        ],
      },
    },
  });
  assert.equal(
    answer,
    [
      "Returns within 30 days.",
      "",
      "Sources:",
      "1. Refund-Policy.pdf (p. 1, file id kb_refund)",
      "2. Shipping-Policy.pdf (p. 2, file id kb_ship)",
      "3. Returns (https://example.test/returns)",
    ].join("\n"),
  );
});

test("elephant-ask falls back to the output annotations for its sources", async () => {
  const answer = await askWith({
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            annotations: [
              {
                type: "file_citation",
                file_id: "kb_warranty",
                filename: "Warranty-Terms.pdf",
              },
              {
                type: "url_citation",
                url: "https://example.test/a",
                title: "A page",
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(
    answer,
    [
      "Returns within 30 days.",
      "",
      "Sources:",
      "1. Warranty-Terms.pdf (file id kb_warranty)",
      "2. A page (https://example.test/a)",
    ].join("\n"),
  );
});

test("elephant-ask does not list sources twice when the answer already does", async () => {
  const body = "Returns within 30 days.\n\nSources:\n1. Refund-Policy.pdf";
  const sse = [
    { type: "response.output_text.delta", delta: body },
    {
      type: "response.completed",
      response: {
        id: "resp_3",
        metadata: {
          _aicore: { grounded_sources: [{ filename: "Refund-Policy.pdf" }] },
        },
      },
    },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  stubCalypso(
    () =>
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "What is the refund policy?" },
  });
  assert.equal(text(result), body);
});

test("elephant-ask adds nothing when the API reports no sources", async () => {
  for (const completed of [
    {},
    { metadata: { _aicore: { grounded_sources: [] } }, output: [] },
    { metadata: null, output: "unexpected" },
  ]) {
    assert.equal(await askWith(completed), "Returns within 30 days.");
  }
});

test("elephant-ask refuses an agent the team does not have, naming the ones it has", async () => {
  const calls = stubCalypso(() => json({}));
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "hi", model: "someone-else" },
  });
  assert.equal(result.isError, true);
  assert.match(
    text(result),
    /Unknown agent `someone-else`.*elephant-agent, elephant-agent:sales/,
  );
  assert.equal(calls.length, 0);
});

async function askAtDepth(depth, effort) {
  const sse = [
    { type: "response.output_text.delta", delta: "Returns within 30 days." },
    {
      type: "response.completed",
      response: { id: "resp_d", ...(effort ? { reasoning: { effort } } : {}) },
    },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
  const calls = stubCalypso(
    () =>
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: {
      prompt: "What is the refund policy?",
      ...(depth ? { depth } : {}),
    },
  });
  return { answer: text(result), body: calls[0].body, result };
}

test("elephant-ask sends the depth as the API's response policy", async () => {
  for (const [depth, policy] of [
    ["fast", "fast"],
    ["balanced", "medium"],
    ["deep", "extended"],
  ]) {
    const { body } = await askAtDepth(depth, null);
    assert.equal(body.metadata.response_policy, policy);
  }
  // No depth asked: the request names none and the agent's default applies.
  const { body } = await askAtDepth(undefined, null);
  assert.equal("response_policy" in body.metadata, false);
});

test("elephant-ask closes with the depth the answer got", async () => {
  for (const [effort, name] of [
    ["low", "fast"],
    ["minimal", "fast"],
    ["medium", "balanced"],
    ["high", "deep"],
  ]) {
    const { answer } = await askAtDepth(undefined, effort);
    assert.equal(
      answer,
      `Returns within 30 days.\n\nAnswered at depth: ${name} (the agent's default; pass \`depth\` as \`fast\`, \`balanced\` or \`deep\` to choose).`,
    );
  }
  // An effort the API does not report, or one this server does not know.
  for (const effort of [null, "unheard-of"]) {
    const { answer } = await askAtDepth("deep", effort);
    assert.equal(answer, "Returns within 30 days.");
  }
});

test("elephant-ask says when the team's plan capped the depth", async () => {
  const { answer } = await askAtDepth("deep", "low");
  assert.match(answer, /Answered at depth: fast \(asked for deep;/);
  assert.match(answer, /a higher depth will not change the answer/);

  // Answered at or above what was asked: a plain closing line.
  const met = await askAtDepth("balanced", "medium");
  assert.match(met.answer, /Answered at depth: balanced\.$/);
});

test("elephant-ask refuses a depth it does not offer", async () => {
  const calls = stubCalypso(() => json({}));
  const client = await connect(ToolPresetRegistry.elephant);
  let refused = false;
  try {
    const result = await client.callTool({
      name: "elephant-ask",
      arguments: { prompt: "What is the refund policy?", depth: "exhaustive" },
    });
    refused = result.isError === true;
  } catch {
    refused = true;
  }
  assert.equal(refused, true);
  assert.equal(calls.length, 0);
});

test("elephant-search passes depth and extra phrasings to the API", async () => {
  const calls = stubCalypso(() =>
    json({
      object: "search.results",
      query: "q",
      strategy: "bucket_stores",
      depth: "standard",
      results: [],
      usage: {},
    }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const call = (args) =>
    client.callTool({
      name: "elephant-search",
      arguments: { query: "shipping times", ...args },
    });

  await call({});
  assert.equal("depth" in calls.at(-1).body, false);
  assert.equal("additional_queries" in calls.at(-1).body, false);

  await call({ depth: "fast" });
  assert.equal(calls.at(-1).body.depth, "fast");

  await call({ depth: "thorough" });
  assert.equal(calls.at(-1).body.depth, "standard");

  // Naming other phrasings asks for the deeper search by itself.
  await call({
    alsoSearchFor: ["express delivery times", " international shipping days "],
  });
  assert.equal(calls.at(-1).body.depth, "standard");
  assert.deepEqual(calls.at(-1).body.additional_queries, [
    "express delivery times",
    "international shipping days",
  ]);

  const before = calls.length;
  let refused = false;
  try {
    refused = (await call({ alsoSearchFor: ["a", "b", "c"] })).isError === true;
  } catch {
    refused = true;
  }
  assert.equal(refused, true);
  assert.equal(calls.length, before);
});

test("elephant-search refuses agent and buckets together", async () => {
  const calls = stubCalypso(() => json({}));
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-search",
    arguments: { query: "refunds", agent: "elephant-agent", buckets: ["docs"] },
  });
  assert.equal(result.isError, true);
  assert.equal(calls.length, 0);
});

test("elephant-list-buckets calls the bucket endpoint with the caller's key", async () => {
  const calls = stubCalypso(() => json({ team_id: "t1", buckets: [] }));
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-list-buckets",
    arguments: {},
  });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0].url, `${API_BASE}/knowledge/buckets`);
  assert.equal(
    new Headers(calls[0].init.headers).get("Authorization"),
    "Bearer sk-test",
  );
});

function sseOf(completed, text = "Returns within 30 days.") {
  return [
    { type: "response.output_text.delta", delta: text },
    { type: "response.completed", response: { id: "resp_9", ...completed } },
  ]
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join("");
}

const stream = (body) =>
  new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });

test("elephant-ask with a named agent asks exactly that agent", async () => {
  const calls = stubCalypso(() => stream(sseOf({})));
  const client = await connect(ToolPresetRegistry.elephant);
  await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "hi", model: "elephant-agent:sales" },
  });
  assert.equal(calls[0].body.model, "elephant-agent:sales");
});

test("elephant-ask falls back to the default agent on an API that does not know the connector agent", async () => {
  let call = 0;
  const calls = stubCalypso(() =>
    call++ === 0
      ? json(
          {
            error: {
              message: "The model does not exist.",
              code: "model_not_found",
            },
          },
          404,
        )
      : stream(sseOf({})),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "hi" },
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(
    calls.map((c) => c.body.model),
    ["elephant-agent:mcp", "elephant-agent"],
  );
});

test("elephant-ask sends named buckets to the API", async () => {
  const calls = stubCalypso(() => stream(sseOf({})));
  const client = await connect(ToolPresetRegistry.elephant);
  await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "openings?", buckets: ["chess", " "] },
  });
  assert.deepEqual(calls[0].body.metadata._aicore, { buckets: ["chess"] });
});

test("elephant-ask says why retrieval refused, instead of relaying 'not enough information'", async () => {
  stubCalypso(() =>
    stream(
      sseOf(
        {
          metadata: {
            _aicore: { answer_failure_code: "attached_source_outside_scope" },
          },
        },
        "I don't have enough information to answer that.",
      ),
    ),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-ask",
    arguments: {
      prompt: "chess?",
      model: "elephant-agent:sales",
      fileIds: ["k1"],
    },
  });
  assert.equal(result.isError, true);
  assert.match(text(result), /bucket the agent named in `model` does not read/);
  assert.doesNotMatch(text(result), /enough information/);
});

test("elephant-ask names the buckets it did not search", async () => {
  stubCalypso((url) =>
    url.endsWith("/knowledge/buckets")
      ? json({
          team_id: "t1",
          buckets: [
            { id: "b1", name: "Policies" },
            { id: "b7", name: "Chess" },
          ],
        })
      : stream(
          sseOf({
            metadata: {
              _aicore: {
                bucket_coverage: {
                  searched: ["b2", "b3", "b4", "b5", "b7"],
                  unsearched: ["b1", "b6"],
                },
              },
            },
          }),
        ),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const answer = text(
    await client.callTool({ name: "elephant-ask", arguments: { prompt: "q" } }),
  );
  assert.match(answer, /Searched 5 of 7 buckets/);
  assert.match(answer, /Not searched: Policies, b6\./);
});

test("elephant-search with no agent or buckets searches every bucket, with a fallback", async () => {
  let call = 0;
  const calls = stubCalypso(() =>
    call++ === 0
      ? json(
          { error: { code: "agent_not_found", message: "Unknown agent: mcp" } },
          404,
        )
      : json({
          object: "search.results",
          query: "q",
          strategy: "s",
          results: [],
          usage: {},
        }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-search",
    arguments: { query: "openings" },
  });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0].body.agent, "elephant-agent:mcp");
  assert.equal(calls[1].body.agent, undefined);
});

test("elephant-list-buckets names the sources in each bucket", async () => {
  const calls = stubCalypso((url) => {
    if (url.endsWith("/knowledge/buckets")) {
      return json({
        team_id: "t1",
        buckets: [
          { id: "b1", name: "Policies", fileIds: ["k1", "k2"] },
          { id: "b2", name: "Empty" },
          { id: "b3", name: "Broken", fileIds: ["k9"] },
        ],
      });
    }
    if (url.includes("/buckets/b3/sources")) return json({}, 500);
    return json({
      sources: [
        { id: "k1", type: "file", title: "Refund-Policy.pdf", ready: true },
        { id: "k2", type: "page", title: "", ready: false },
      ],
      total: 2,
      has_more: false,
    });
  });
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-list-buckets",
    arguments: {},
  });
  assert.equal(result.isError, undefined);
  const { buckets } = JSON.parse(text(result));
  assert.deepEqual(buckets[0].sources, [
    { id: "k1", name: "Refund-Policy.pdf", type: "file", ready: true },
    // A source without a title is still listed, under its id.
    { id: "k2", name: "k2", type: "page", ready: false },
  ]);
  assert.equal(buckets[0].moreSources, false);
  // An empty bucket is not asked about; a failing one keeps its ids.
  assert.deepEqual(buckets[1].sources, []);
  assert.equal(buckets[2].sources, undefined);
  assert.deepEqual(buckets[2].source_ids, ["k9"]);
  // The workspace id the API lists the buckets under is not repeated.
  assert.equal(JSON.parse(text(result)).team_id, undefined);
  assert.deepEqual(calls.map((call) => call.url.replace(API_BASE, "")).sort(), [
    "/buckets/b1/sources?limit=50",
    "/buckets/b3/sources?limit=50",
    "/knowledge/buckets",
  ]);

  const countsOnly = stubCalypso(() =>
    json({ team_id: "t1", buckets: [{ id: "b1", fileIds: ["k1"] }] }),
  );
  await client.callTool({
    name: "elephant-list-buckets",
    arguments: { includeSources: false },
  });
  assert.equal(countsOnly.length, 1);
});

test("elephant-ask explains a file id the API does not know", async () => {
  stubCalypso(() => json({ detail: "File not found" }, 404));
  const client = await connect(ToolPresetRegistry.elephant);
  const named = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "What is the refund window?", fileIds: ["nope"] },
  });
  assert.equal(named.isError, true);
  assert.match(text(named), /not a source in this team's knowledge/);
  assert.match(text(named), /elephant-list-buckets/);

  // Without file ids a 404 is something else: left as the API said it.
  const plain = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "What is the refund window?" },
  });
  assert.equal(plain.isError, true);
  assert.doesNotMatch(text(plain), /not a source in this team's knowledge/);
});

test("API errors come back as tool errors carrying the typed code", async () => {
  stubCalypso(() =>
    json(
      { error: { code: "bucket_slug_exists", message: "Slug taken." } },
      409,
    ),
  );
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const result = await client.callTool({
    name: "elephant-create-bucket",
    arguments: { name: "Sales", slug: "sales" },
  });
  assert.equal(result.isError, true);
  assert.match(
    text(result),
    /^Error: Creating the bucket failed\. .*409: bucket_slug_exists/,
  );
});

test("elephant-rename-bucket patches the bucket by id or slug", async () => {
  const calls = stubCalypso(() => json({ id: "b1", name: "Research" }));
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-rename-bucket",
    arguments: { bucket: "old notes", name: " Research " },
  });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0].url, `${API_BASE}/buckets/old%20notes`);
  assert.equal(calls[0].init.method, "PATCH");
  assert.deepEqual(calls[0].body, { name: "Research" });

  // Nothing to change is refused here, before the API is asked.
  const empty = stubCalypso(() => json({}));
  const refused = await client.callTool({
    name: "elephant-rename-bucket",
    arguments: { bucket: "b1" },
  });
  assert.equal(refused.isError, true);
  assert.match(text(refused), /`name`, a new `description`, or both/);
  assert.equal(empty.length, 0);
});

test("elephant-move-sources moves into the destination and reports each source", async () => {
  const calls = stubCalypso(() =>
    json({
      moved: 1,
      requested: 2,
      sources: [
        { id: "k1", status: "moved" },
        { id: "k2", status: "not_in_source_bucket" },
      ],
    }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-move-sources",
    arguments: {
      sourceIds: ["k1", "k2", "k1"],
      fromBucket: "inbox",
      toBucket: "research",
    },
  });
  assert.equal(result.isError, undefined);
  assert.equal(calls[0].url, `${API_BASE}/buckets/research/sources:move`);
  assert.deepEqual(calls[0].body, {
    source_ids: ["k1", "k2"],
    from_bucket: "inbox",
  });
  assert.match(text(result), /not_in_source_bucket/);

  const same = stubCalypso(() => json({}));
  const refused = await client.callTool({
    name: "elephant-move-sources",
    arguments: { sourceIds: ["k1"], fromBucket: "inbox", toBucket: "inbox" },
  });
  assert.equal(refused.isError, true);
  assert.equal(same.length, 0);
});

test("elephant-create-bucket returns only declared fields as structured content", async () => {
  stubCalypso(() =>
    json({
      id: "b1",
      name: "Sales",
      slug: "sales",
      status: "active",
      member_count: 0,
      extra: true,
    }),
  );
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  const result = await client.callTool({
    name: "elephant-create-bucket",
    arguments: { name: "Sales" },
  });
  assert.deepEqual(result.structuredContent, {
    id: "b1",
    name: "Sales",
    slug: "sales",
    status: "active",
  });
  // The text is the bucket's view: nothing the view does not name.
  assert.deepEqual(JSON.parse(text(result)), {
    id: "b1",
    name: "Sales",
    slug: "sales",
    status: "active",
  });
});

test("elephant-add-files makes up a batch key when none is given", async () => {
  const calls = stubCalypso((url) => {
    if (url.endsWith("/knowledge/files:batch/upload-session")) {
      return json({
        batch_id: "batch1",
        accepted: [
          { client_file_id: "c1", upload_url: "https://storage.test/u1" },
        ],
      });
    }
    if (url.startsWith("https://storage.test/"))
      return new Response(null, { status: 200 });
    return json({ batch_id: "batch1", status: "accepted", items: [] });
  });
  const client = await connect(ToolPresetRegistry.elephantBuilder);
  await client.callTool({
    name: "elephant-add-files",
    arguments: {
      items: [
        {
          filename: "a.txt",
          mimeType: "text/plain",
          contentBase64: "aGk=",
          clientFileId: "c1",
        },
      ],
      bucket: "docs",
    },
  });
  const session = calls.find((call) =>
    call.url.endsWith("/knowledge/files:batch/upload-session"),
  );
  assert.ok(session, "a batch session was opened");
  assert.match(
    session.body.manifest.batch_idempotency_key,
    /^elephant-batch-[0-9a-f-]{36}$/,
  );
  const upload = calls.find((call) =>
    call.url.startsWith("https://storage.test/"),
  );
  assert.equal(
    new Headers(upload.init.headers).get("Authorization"),
    null,
    "storage never sees the key",
  );
});

test("a canonical Calypso name is not callable", async () => {
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "calypso-agent",
    arguments: { prompt: "x" },
  });
  assert.equal(result.isError, true);
});

test("presets have unique paths and resource URLs", () => {
  const presets = ToolPresetRegistry.all();
  assert.equal(
    new Set(presets.map((preset) => preset.path)).size,
    presets.length,
  );
  assert.equal(
    ToolPresetRegistry.elephant.resourceUrl("https://mcp.calypso.so/"),
    "https://mcp.calypso.so/elephant/mcp",
  );
});
