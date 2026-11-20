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

async function connect(preset) {
  const server = createElephantMcpServer({
    preset,
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

test("Elephant publishes its four read-only tools, in order", async () => {
  const client = await connect(ToolPresetRegistry.elephant);
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "elephant-ask",
      "elephant-search",
      "elephant-list-buckets",
      "elephant-open-source",
    ],
  );
  // A directory review reads these three as explicit booleans on every tool.
  for (const tool of tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    assert.equal(tool.annotations?.openWorldHint, false, tool.name);
  }
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

test("elephant-ask streams one stateless question to the default agent", async () => {
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
  assert.equal(body.model, "elephant-agent");
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
  assert.equal(JSON.parse(text(result)).extra, true);
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
