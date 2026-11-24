import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

import { createElephantMcpServer } from "../dist/ElephantMcpServer.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

// What a tool answers is a view: the fields a person may read about their own
// knowledge. These tests hand each tool an API record as production sends it,
// with everything only Calypso needs, and check that none of it comes out.

const API_BASE = "https://api.example.test/v1";
const STORE = "fileSearchStores/teamt1buc-35j";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubCalypso(respond) {
  globalThis.fetch = async (url, init) => respond(String(url), init);
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function connect(preset, onLog) {
  const server = createElephantMcpServer({
    preset,
    api: { apiKey: "sk-test", apiBaseUrl: API_BASE },
    agents: {
      get: async () => [],
      invalidate: () => {},
    },
    packageInfo: { name: "@calypsohq/elephant-mcp-server", version: "0.0.0" },
    principal: "grant:gid_secret_1",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "views-test", version: "0" });
  if (onLog) {
    client.setNotificationHandler(LoggingMessageNotificationSchema, onLog);
  }
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

const text = (result) => result.content.map((part) => part.text).join("");

/** A file as `GET /knowledge/files/{id}?verify=gemini` answers in production. */
const fileRecord = {
  id: "k1",
  object: "knowledge_file",
  status: "indexed",
  title: "Warranty-Terms",
  filename: "Warranty-Terms.pdf",
  content_type: "application/pdf",
  size_bytes: 2017,
  sha256: "2674cb5a0c83ca0e9dd7583931296c22",
  task: { id: "task_1", status: "indexed" },
  source: {
    request_id: "req_upload_1",
    channel: "project_api",
    auth_type: "project_api_key",
    api_key_id: "key_rec_1",
  },
  document_state: null,
  ingest_info: {
    bucketSync: {
      synced: 1,
      results: [
        {
          operation_name: `${STORE}/operations/op1`,
          document_name: `${STORE}/documents/d1`,
          store_name: STORE,
          bucket_id: "b1",
        },
      ],
      indexer_version: "v2",
    },
    bucketIds: ["b1"],
  },
  failure_details: null,
  metadata_budget: null,
  created_at: "2026-11-19T20:23:37.388000+00:00",
  updated_at: "2026-11-19T20:32:45.686000+00:00",
  request_id: "req_read_1",
  bucketSyncStatus: "active",
  bucket_sync_status: "active",
  bucketSync: {
    b1: {
      lastGeminiOperationId: `${STORE}/operations/op1`,
      bucketStoreName: STORE,
    },
  },
  bucket_sync: {
    b1: {
      lastGeminiOperationId: `${STORE}/operations/op1`,
      bucketStoreName: STORE,
    },
  },
  bucket_assignment: {
    requested: [],
    assigned: ["b1"],
    created: [],
    skipped: [],
  },
  ready: true,
  gemini: {
    documents: [
      { documentName: `${STORE}/documents/d1`, bucketId: "b1", exists: true },
    ],
    verifiedAt: "2026-11-24T15:28:34+00:00",
  },
};

const bucketRecord = {
  id: "b1",
  teamId: "team_secret_1",
  slug: "product-docs",
  name: "Product docs",
  description: "Guides and warranty terms.",
  status: "active",
  knowledgeIds: ["k1"],
  fileIds: ["k1"],
  filesCount: 1,
  memberCount: 1,
  createdBy: "uid_secret_1",
  counts: { raw_members: 1, stale_members: 0 },
  bucketStore: { alias: "teamstore:bucket:b1", gemini_store_name: STORE },
};

/** Nothing that names a key, a task, a request, a workspace or the index. */
const INTERNAL =
  /fileSearchStores|operations\/|key_rec_1|api_key|task_1|req_|sha256|team_secret_1|uid_secret_1|teamstore|upload_url|storage\.test|gid_secret_1|sk-|access\.test|media_1|strategy|tokens/;

test("elephant-open-source answers with the source's details and nothing else", async () => {
  stubCalypso(() => json(fileRecord));
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-open-source",
    arguments: { fileId: "k1", verify: true },
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(text(result)), {
    id: "k1",
    title: "Warranty-Terms",
    filename: "Warranty-Terms.pdf",
    content_type: "application/pdf",
    size_bytes: 2017,
    status: "indexed",
    ready: true,
    bucket_ids: ["b1"],
    created_at: "2026-11-19T20:23:37.388000+00:00",
    updated_at: "2026-11-19T20:32:45.686000+00:00",
    index_check: { in_index: true, checked_at: "2026-11-24T15:28:34+00:00" },
  });
});

test("a failed source says why in words, never with an index path", async () => {
  stubCalypso(() =>
    json({
      ...fileRecord,
      status: "failed",
      ready: false,
      gemini: undefined,
      failure_details: {
        code: "unsupported_file",
        message: `Import into ${STORE} failed`,
      },
    }),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const source = JSON.parse(
    text(
      await client.callTool({
        name: "elephant-open-source",
        arguments: { fileId: "k1" },
      }),
    ),
  );
  assert.equal(source.ready, false);
  // The message names the store, so the code stands in for it.
  assert.equal(source.failure, "unsupported_file");
});

test("no tool hands back what only Calypso needs", async () => {
  stubCalypso((url, init) => {
    if (url.endsWith("/knowledge/buckets") && init?.method === "POST") {
      return json(bucketRecord);
    }
    if (url.includes("/knowledge/buckets")) {
      return json({
        team_id: "team_secret_1",
        buckets: [bucketRecord],
        request_id: "req_list_1",
      });
    }
    if (url.includes("/sources:move")) {
      return json({
        bucket_id: "b2",
        from_bucket_id: "b1",
        moved: 1,
        requested: 1,
        sources: [{ id: "k1", status: "moved", detail: `synced to ${STORE}` }],
        request_id: "req_move_1",
      });
    }
    if (url.includes("/sources")) {
      return json({
        sources: [
          { id: "k1", type: "file", title: "Warranty-Terms", ready: true },
        ],
        total: 1,
        has_more: false,
        request_id: "req_sources_1",
      });
    }
    if (url.includes("/buckets/")) return json(bucketRecord);
    if (url.endsWith("/search")) {
      return json({
        object: "search.results",
        query: "warranty",
        agent: "elephant-agent:mcp",
        strategy: "bucket_scope",
        depth: "standard",
        results: [
          {
            source_index: 1,
            type: "file_citation",
            title: "Warranty-Terms",
            text: "The warranty lasts two years.",
            quote: "two years",
            file_id: `${STORE}/documents/d1`,
            filename: "Warranty-Terms.pdf",
            url: null,
            attributes: {
              source_index: 1,
              knowledge_id: "k1",
              page_number: 2,
              page_label: "p. 2",
              media_id: "media_1",
              mime_type: "application/pdf",
              access_url: "https://access.test/signed?token=abc",
            },
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
        request_id: "req_search_1",
      });
    }
    if (url.endsWith("/knowledge/websites")) {
      return json({
        object: "knowledge_website",
        knowledge_id: "k2",
        team_id: "team_secret_1",
        title: "Returns",
        url: "https://example.com/returns",
        summary: "How returns work.",
        tags: ["returns"],
        ingestion_status: "queued",
        bucket_assignment: { assigned: ["b1"], created: [], skipped: [] },
        request_id: "req_site_1",
      });
    }
    if (url.endsWith("/knowledge/files/import-url")) {
      return json({
        knowledge_id: "k3",
        task_id: "task_1",
        title: "Returns-FAQ",
        filename: "Returns-FAQ.pdf",
        mime_type: "application/pdf",
        size_bytes: 10,
        ingestion_status: "queued",
        bucket_assignment: { assigned: ["b1"] },
        request_id: "req_import_1",
      });
    }
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
    if (url.includes("/finalize")) {
      return json({
        batch_id: "batch1",
        status: "accepted",
        finalized: [
          { client_file_id: "c1", knowledge_id: "k4", task_id: "task_1" },
        ],
        request_id: "req_batch_1",
      });
    }
    return json(fileRecord);
  });

  const logs = [];
  const client = await connect(ToolPresetRegistry.elephant, (note) =>
    logs.push(note),
  );
  const calls = [
    ["elephant-list-buckets", {}],
    ["elephant-list-buckets", { includeSources: false }],
    ["elephant-open-source", { fileId: "k1", verify: true }],
    [
      "elephant-search",
      { query: "warranty", buckets: ["b1"], depth: "thorough" },
    ],
    ["elephant-create-bucket", { name: "Product docs" }],
    ["elephant-rename-bucket", { bucket: "b1", name: "Product docs" }],
    [
      "elephant-move-sources",
      { sourceIds: ["k1"], fromBucket: "b1", toBucket: "b2" },
    ],
    [
      "elephant-add-website",
      { url: "https://example.com/returns", bucket: "b1" },
    ],
    [
      "elephant-add-file",
      { sourceUrl: "https://example.com/Returns-FAQ.pdf", bucket: "b1" },
    ],
    [
      "elephant-add-files",
      {
        items: [
          {
            filename: "a.txt",
            mimeType: "text/plain",
            contentBase64: "aGk=",
            clientFileId: "c1",
          },
        ],
        bucket: "b1",
      },
    ],
  ];
  const answers = {};
  for (const [name, args] of calls) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, undefined, `${name}: ${text(result)}`);
    assert.doesNotMatch(text(result), INTERNAL, name);
    if (result.structuredContent) {
      assert.doesNotMatch(
        JSON.stringify(result.structuredContent),
        INTERNAL,
        name,
      );
    }
    answers[name] = JSON.parse(text(result));
  }

  // What each answer does say.
  assert.deepEqual(answers["elephant-search"], {
    query: "warranty",
    depth: "thorough",
    results: [
      {
        source_index: 1,
        type: "file_citation",
        title: "Warranty-Terms",
        text: "The warranty lasts two years.",
        quote: "two years",
        file_id: "k1",
        filename: "Warranty-Terms.pdf",
        page: 2,
        location: "p. 2",
      },
    ],
  });
  assert.deepEqual(answers["elephant-rename-bucket"], {
    id: "b1",
    name: "Product docs",
    slug: "product-docs",
    description: "Guides and warranty terms.",
    status: "active",
  });
  assert.deepEqual(answers["elephant-move-sources"], {
    bucket_id: "b2",
    from_bucket_id: "b1",
    moved: 1,
    requested: 1,
    sources: [{ id: "k1", status: "moved" }],
  });
  assert.deepEqual(answers["elephant-add-website"], {
    id: "k2",
    title: "Returns",
    url: "https://example.com/returns",
    summary: "How returns work.",
    tags: ["returns"],
    status: "queued",
    bucket_ids: ["b1"],
  });
  assert.equal(answers["elephant-add-file"].file.id, "k3");
  assert.deepEqual(answers["elephant-add-files"].files, [
    { client_file_id: "c1", file_id: "k4", status: "queued" },
  ]);
  assert.equal(answers["elephant-add-files"].id, "batch1");

  // The log lines a client receives say what happened, not who the caller is.
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(logs.length > 0, "the client received log lines");
  assert.doesNotMatch(JSON.stringify(logs), /principal|gid_secret_1/);
});

test("a failure keeps its code and its advice, and loses what only Calypso traces", async () => {
  stubCalypso(() =>
    json(
      {
        error: {
          code: "bucket_not_found",
          message: `No bucket "hr" behind ${STORE}/documents/d1.`,
          details: {
            request_id: "req_err_1",
            available: ["policies", "product-docs"],
            task_id: "task_1",
            api_key_id: "key_rec_1",
          },
        },
      },
      404,
    ),
  );
  const client = await connect(ToolPresetRegistry.elephant);
  const result = await client.callTool({
    name: "elephant-open-source",
    arguments: { fileId: "k1" },
  });
  assert.equal(result.isError, true);
  assert.equal(
    text(result),
    'Error: Opening the source failed. Request failed with status 404: bucket_not_found: No bucket "hr" behind the index. details={"available":["policies","product-docs"]}',
  );
  assert.doesNotMatch(text(result), INTERNAL);
});
