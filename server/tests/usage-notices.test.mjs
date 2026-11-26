import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { afterEach, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { JwtGrantStrategy } from "../dist/auth/JwtGrantStrategy.js";
import { TokenCipher } from "../dist/auth/TokenCipher.js";
import { createElephantMcpServer } from "../dist/ElephantMcpServer.js";
import { PostBudget } from "../dist/notices/PostBudget.js";
import { SlackUsageNotices } from "../dist/notices/SlackUsageNotices.js";
import {
  buildUsageMessage,
  NOTICED_TOOLS,
} from "../dist/notices/UsageMessage.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

const SERVER = { version: "1.4.0", publicBaseUrl: "https://mcp.calypso.so" };
const CALL = {
  tool: "elephant-ask",
  args: {
    prompt: "What does the S-1 say about <Starlink> & launch?",
    depth: "fast",
    buckets: ["filings"],
  },
  outcome: "ok",
  durationMs: 2340,
  principal: "grant:g1",
  scopes: ["elephant:read", "elephant:write"],
  grant: {
    gid: "g1",
    team: "team-abc",
    cid: "client-xyz",
    sub: "user-123456789",
  },
};

const fieldsOf = (message) =>
  Object.fromEntries(
    message.blocks
      .filter((block) => block.type === "section")
      .flatMap((block) => block.fields)
      .map((field) => {
        const [label, ...rest] = field.text.split("\n");
        return [label.replaceAll("*", ""), rest.join("\n")];
      }),
  );

test("an ask posts the question, the caller and the outcome, never a result", () => {
  const message = buildUsageMessage(CALL, SERVER);
  assert.equal(
    message.text,
    "Elephant used · elephant-ask · What does the S-1 say about &lt;Starlink&gt; &amp; launch? · grant:g1 · team team-abc · client client-xyz · person user-123…",
  );
  assert.deepEqual(message.blocks[0], {
    type: "header",
    text: {
      type: "plain_text",
      text: "🐘 Elephant used · elephant-ask",
      emoji: true,
    },
  });
  assert.deepEqual(fieldsOf(message), {
    Question: "“What does the S-1 say about &lt;Starlink&gt; &amp; launch?”",
    Buckets: "filings",
    Depth: "fast",
    Outcome: "ok · 2.3 s",
    Caller: "grant:g1 · team team-abc · client client-xyz · person user-123…",
    Scopes: "elephant:read elephant:write",
    Server: "1.4.0 · mcp.calypso.so",
  });
});

test("the inventory tools post nothing; every knowledge-changing tool does", () => {
  assert.equal(
    buildUsageMessage({ ...CALL, tool: "elephant-list-buckets" }, SERVER),
    null,
  );
  assert.equal(
    buildUsageMessage({ ...CALL, tool: "elephant-open-source" }, SERVER),
    null,
  );
  assert.deepEqual(
    [...NOTICED_TOOLS],
    [
      "elephant-ask",
      "elephant-search",
      "elephant-add-file",
      "elephant-add-files",
      "elephant-add-website",
      "elephant-create-bucket",
      "elephant-rename-bucket",
      "elephant-move-sources",
    ],
  );
});

test("each tool is summarised from the caller's own input keys", () => {
  const of = (tool, args) =>
    fieldsOf(buildUsageMessage({ ...CALL, tool, args }, SERVER));
  assert.equal(
    of("elephant-search", {
      query: "refund policy",
      agent: "elephant-agent:mcp",
      depth: "thorough",
    }).Query,
    "“refund policy”",
  );
  assert.equal(
    of("elephant-search", { query: "x", agent: "elephant-agent:mcp" }).Agent,
    "elephant-agent:mcp",
  );
  assert.equal(
    of("elephant-add-file", {
      sourceUrl: "https://x.test/a.pdf",
      bucket: "contracts",
    }).File,
    "https://x.test/a.pdf",
  );
  assert.equal(
    of("elephant-add-file", {
      file: { filename: "deck.pdf" },
      bucketSlugs: ["a", "b"],
    }).Buckets,
    "a, b",
  );
  assert.equal(
    of("elephant-add-files", {
      items: [{ filename: "a.pdf" }, { filename: "b.pdf" }],
      bucketIds: ["bk1"],
    }).Files,
    "2 files: a.pdf, b.pdf",
  );
  assert.equal(
    of("elephant-add-website", { url: "https://calypso.so", bucket: "web" })
      .Website,
    "https://calypso.so",
  );
  assert.deepEqual(
    of("elephant-create-bucket", { name: "Filings", slug: "filings" }).Bucket,
    "Filings",
  );
  assert.equal(
    of("elephant-rename-bucket", { bucket: "filings", name: "SEC filings" })[
      "New name"
    ],
    "SEC filings",
  );
  const moved = of("elephant-move-sources", {
    sourceIds: ["s1", "s2", "s3"],
    fromBucket: "a",
    toBucket: "b",
  });
  assert.equal(moved.Sources, "3 sources");
  assert.equal(moved["To bucket"], "b");
});

test("a raw API key caller shows the key label and no team", () => {
  const fields = fieldsOf(
    buildUsageMessage(
      {
        ...CALL,
        principal: "key:sk-…abcd",
        scopes: [],
        grant: undefined,
        outcome: "error",
        durationMs: 120,
      },
      SERVER,
    ),
  );
  assert.equal(fields.Caller, "key:sk-…abcd");
  assert.equal(fields.Scopes, "api key (all)");
  assert.equal(fields.Outcome, "error · 120 ms");
});

test("the post budget drops past its per-minute allowance and reports the loss on the next post", () => {
  let now = 0;
  const budget = new PostBudget(2, () => now);
  assert.equal(budget.take(), 0);
  assert.equal(budget.take(), 0);
  assert.equal(budget.take(), null);
  assert.equal(budget.take(), null);
  now = 60_000;
  assert.equal(budget.take(), 2);
  assert.equal(budget.take(), 0);
  const message = buildUsageMessage(CALL, SERVER, 2);
  assert.equal(
    fieldsOf(message).Dropped,
    "2 earlier notices over the post budget",
  );
});

test("SlackUsageNotices posts with a timeout and turns a failure into one warning line", async () => {
  const posts = [];
  const warnings = [];
  const notices = new SlackUsageNotices(
    "https://hooks.slack.test/T/B/x",
    SERVER,
    new PostBudget(60, () => 0),
    async (url, message, timeoutMs) => {
      posts.push({ url, message, timeoutMs });
      if (posts.length === 2) throw new Error("Slack answered 500");
    },
    (line) => warnings.push(JSON.parse(line)),
  );
  await notices.send(CALL);
  await notices.send(CALL);
  await notices.send({ ...CALL, tool: "elephant-list-buckets" });
  assert.equal(posts.length, 2);
  assert.equal(posts[0].url, "https://hooks.slack.test/T/B/x");
  assert.equal(posts[0].timeoutMs, 3000);
  assert.equal(
    posts[0].message.text.startsWith("Elephant used · elephant-ask"),
    true,
  );
  assert.deepEqual(warnings, [
    {
      level: "warning",
      message: "[usage-notices] slack post failed",
      tool: "elephant-ask",
      principal: "grant:g1",
      error: "Slack answered 500",
    },
  ]);
  // toolCalled never throws and never returns a promise to wait on.
  assert.equal(notices.toolCalled(CALL), undefined);
});

test("the JWT credential carries the grant's non-secret facts", async () => {
  const pair = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" };
  const cipher = new TokenCipher(randomBytes(32).toString("base64"));
  const preset = ToolPresetRegistry.all()[0];
  const strategy = new JwtGrantStrategy({
    issuer: "https://login.example.test",
    keys: createLocalJWKSet({ keys: [jwk] }),
    cipher,
    publicBaseUrl: "https://mcp.example.test",
    resourceMetadataUrl: () => "",
  });
  const token = await new SignJWT({
    team: "t1",
    gid: "g1",
    cid: "c1",
    scope: `${preset.scope} elephant:write`,
    ek: cipher.seal("sk-0123456789abcdef0123456789abcdef"),
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer("https://login.example.test")
    .setAudience(preset.resourceUrl("https://mcp.example.test"))
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(pair.privateKey);

  const credential = await strategy.authenticate(token, preset);
  assert.equal(credential.principal, "grant:g1");
  assert.deepEqual(credential.grant, {
    gid: "g1",
    team: "t1",
    cid: "c1",
    sub: "u1",
  });
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("a tool call on the server is reported once it has its result, and a quiet tool is not", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("/knowledge/buckets")) {
      return new Response(
        JSON.stringify({
          team_id: "t1",
          buckets: [{ id: "b1", name: "Filings", slug: "filings" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ error: { message: "nope" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  const calls = [];
  const preset = ToolPresetRegistry.all().find((candidate) =>
    candidate.toolNames().includes("elephant-ask"),
  );
  const server = createElephantMcpServer({
    preset,
    scopes: ["elephant:read"],
    api: { apiKey: "sk-test", apiBaseUrl: "https://api.example.test/v1" },
    agents: {
      models: [{ id: "elephant-agent" }],
      defaultModel: "elephant-agent",
      fetchedAt: null,
      source: "api",
    },
    packageInfo: {
      name: "@calypsohq/elephant-mcp-server",
      version: "0.0.0-test",
    },
    principal: "grant:g1",
    grant: { gid: "g1", team: "t1", cid: "c1", sub: "u1" },
    notices: { toolCalled: (call) => calls.push(call) },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "usage-test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  await client.callTool({ name: "elephant-list-buckets", arguments: {} });
  const failed = await client.callTool({
    name: "elephant-ask",
    arguments: { prompt: "Hello?" },
  });
  assert.equal(failed.isError, true);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].tool, "elephant-list-buckets");
  assert.equal(calls[0].outcome, "ok");
  assert.equal(calls[1].tool, "elephant-ask");
  assert.equal(calls[1].outcome, "error");
  assert.deepEqual(calls[1].args, { prompt: "Hello?" });
  assert.equal(calls[1].principal, "grant:g1");
  assert.deepEqual(calls[1].scopes, ["elephant:read"]);
  assert.deepEqual(calls[1].grant, {
    gid: "g1",
    team: "t1",
    cid: "c1",
    sub: "u1",
  });
  assert.equal(typeof calls[1].durationMs, "number");
  await client.close();
  await server.close();
});

test("an escape-heavy input stays inside Slack's 2,000-character field limit and the fallback text is escaped", () => {
  const message = buildUsageMessage(
    { ...CALL, args: { prompt: "&".repeat(500) } },
    SERVER,
  );
  const question = fieldsOf(message).Question;
  assert.ok(`*Question*\n${question}`.length <= 2000);
  assert.ok(question.endsWith("…"));
  assert.doesNotMatch(question, /&[a-z]*…$/);
  assert.equal(message.text.includes("<"), false);
  assert.ok(message.text.startsWith("Elephant used · elephant-ask · &amp;"));
});
