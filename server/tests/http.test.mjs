import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

import { ApiKeyStrategy } from "../dist/auth/ApiKeyStrategy.js";
import { BearerAuthenticator } from "../dist/auth/BearerAuthenticator.js";
import { JwtGrantStrategy } from "../dist/auth/JwtGrantStrategy.js";
import { TokenCipher } from "../dist/auth/TokenCipher.js";
import { HttpServer } from "../dist/http/HttpServer.js";
import { McpEndpoint } from "../dist/http/McpEndpoint.js";
import { ModelCatalogCache } from "../dist/http/ModelCatalogCache.js";
import { ProtectedResourceMetadata } from "../dist/http/ProtectedResourceMetadata.js";
import { RateLimiter } from "../dist/http/RateLimiter.js";
import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

const ISSUER = "https://login.example.test";
const API_BASE = "https://api.example.test/v1";
const GRANT_KEY = "sk-0123456789abcdef0123456789abcdef";
const encKey = randomBytes(32).toString("base64");
const cipher = new TokenCipher(encKey);

let server;
let baseUrl;
let signingKey;
let otherSigningKey;
let limiter;
// Generous enough for every other test here, small enough to exhaust.
const LIMIT = 200;
const aicoreCalls = [];
const requestLog = [];

const catalogLoader = async () => ({
  models: [{ id: "elephant-agent" }],
  defaultModel: "elephant-agent",
  fetchedAt: null,
  source: "fallback",
});

before(async () => {
  const pair = await generateKeyPair("ES256");
  signingKey = pair.privateKey;
  otherSigningKey = (await generateKeyPair("ES256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256" };

  // Bind first so the public base URL (and so every `aud`) is the real one.
  const node = (await import("node:http")).createServer();
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${node.address().port}`;

  const metadata = new ProtectedResourceMetadata(baseUrl, ISSUER);
  const authenticator = new BearerAuthenticator(
    [
      new ApiKeyStrategy(),
      new JwtGrantStrategy({
        issuer: ISSUER,
        keys: createLocalJWKSet({ keys: [jwk] }),
        cipher,
        publicBaseUrl: baseUrl,
        resourceMetadataUrl: (preset) => metadata.urlFor(preset) ?? "",
      }),
    ],
    (preset) => metadata.urlFor(preset),
  );
  const catalogs = new ModelCatalogCache(60_000, 10, catalogLoader);
  // A frozen clock: the budget never refills, so the 429 test does not
  // depend on how fast the runner sends requests.
  limiter = new RateLimiter(LIMIT, 10_000, () => 0);
  const http = new HttpServer({
    endpoints: ToolPresetRegistry.all().map(
      (preset) =>
        new McpEndpoint({
          preset,
          authenticator,
          catalogs,
          limiter,
          apiBaseUrl: API_BASE,
          packageInfo: {
            name: "@calypsohq/elephant-mcp-server",
            version: "0.0.0-test",
          },
        }),
    ),
    metadata,
    maxBodyBytes: 1024 * 1024,
    version: "0.0.0-test",
    openaiChallengeToken: "challenge-token-test",
    log: (line) => requestLog.push(line),
  });
  node.on("request", (req, res) => void http.route(req, res));
  server = node;

  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith(API_BASE)) {
      aicoreCalls.push({ url: String(url), init });
      return new Response(JSON.stringify({ team_id: "t1", buckets: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return realFetch(url, init);
  };
});

after(() => server?.close());

async function token(
  claims = {},
  { key = signingKey, expiresIn = "15m" } = {},
) {
  const { aud = `${baseUrl}/elephant/mcp`, ...rest } = claims;
  return new SignJWT({
    team: "t1",
    gid: "g1",
    cid: "c1",
    scope: "elephant:read",
    ek: cipher.seal(GRANT_KEY),
    ...rest,
  })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setIssuer(ISSUER)
    .setAudience(aud)
    .setSubject("u1")
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
}

async function post(path, authorization, body = initializeBody()) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

function initializeBody() {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "http-test", version: "0" },
    },
  };
}

async function connect(path, bearer) {
  const client = new Client({ name: "http-test", version: "0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}${path}`), {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

test("unauthenticated POST starts OAuth discovery", async () => {
  const res = await post("/elephant/mcp");
  assert.equal(res.status, 401);
  assert.equal(
    res.headers.get("www-authenticate"),
    `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource/elephant/mcp"`,
  );
});

test("protected-resource metadata names the issuer and scope", async () => {
  const res = await fetch(
    `${baseUrl}/.well-known/oauth-protected-resource/elephant/mcp`,
  );
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    resource: `${baseUrl}/elephant/mcp`,
    authorization_servers: [ISSUER],
    // Reading connects; adding and organising are offered on top, by consent.
    scopes_supported: ["elephant:read", "elephant:write", "elephant:organise"],
    bearer_methods_supported: ["header"],
    resource_name: "Elephant by Calypso",
    resource_documentation: "https://www.calypso.so/elephant",
  });
  const builder = await fetch(
    `${baseUrl}/.well-known/oauth-protected-resource/elephant/builder/mcp`,
  );
  assert.equal((await builder.json()).scopes_supported[0], "elephant:write");
});

test("GET and DELETE on an endpoint are 405", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await fetch(`${baseUrl}/elephant/mcp`, { method });
    assert.equal(res.status, 405, method);
  }
});

test("a valid access token lists exactly the Elephant tools", async () => {
  const client = await connect("/elephant/mcp", await token());
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "elephant-ask",
    "elephant-list-buckets",
    "elephant-open-source",
    "elephant-search",
  ]);
  await client.close();
});

test("tool calls reach AIcore with the grant's unsealed API key", async () => {
  aicoreCalls.length = 0;
  const client = await connect("/elephant/mcp", await token());
  const result = await client.callTool({
    name: "elephant-list-buckets",
    arguments: {},
  });
  assert.equal(result.isError, undefined);
  assert.equal(
    new Headers(aicoreCalls.at(-1).init.headers).get("Authorization"),
    `Bearer ${GRANT_KEY}`,
  );
  await client.close();
});

test("a token for /elephant/mcp is refused on /elephant/builder/mcp", async () => {
  const res = await post("/elephant/builder/mcp", `Bearer ${await token()}`);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /error="invalid_token"/);
});

test("a token with the wrong scope gets insufficient_scope", async () => {
  const res = await post(
    "/elephant/builder/mcp",
    `Bearer ${await token({ aud: `${baseUrl}/elephant/builder/mcp`, scope: "elephant:read" })}`,
  );
  assert.equal(res.status, 403);
  assert.match(
    res.headers.get("www-authenticate"),
    /error="insufficient_scope"/,
  );
});

test("expired, foreign-signed and tampered tokens are refused", async () => {
  const expired = await token(
    {},
    { expiresIn: Math.floor(Date.now() / 1000) - 60 },
  );
  const foreign = await token({}, { key: otherSigningKey });
  const tampered = await token({ ek: "AAAA.BBBB" });
  for (const bad of [expired, foreign, tampered]) {
    const res = await post("/elephant/mcp", `Bearer ${bad}`);
    assert.equal(res.status, 401);
  }
});

test("the request log says why a call was refused, and never holds the token", async () => {
  const expired = await token(
    {},
    { expiresIn: Math.floor(Date.now() / 1000) - 60 },
  );
  const wrongAudience = await token({ aud: "https://other.example.test/mcp" });
  const wrongScope = await token({
    aud: `${baseUrl}/elephant/builder/mcp`,
    scope: "elephant:read",
  });
  const cases = [
    ["/elephant/mcp", undefined, "missing"],
    ["/elephant/mcp", "Basic dXNlcjpwYXNz", "missing"],
    [
      "/elephant/mcp",
      "Bearer not-a-token",
      "invalid_token: Unrecognized bearer token.",
    ],
    [
      "/elephant/mcp",
      `Bearer ${expired}`,
      "invalid_token: The access token expired.",
    ],
    [
      "/elephant/mcp",
      `Bearer ${wrongAudience}`,
      "invalid_token: The access token is not valid here (aud).",
    ],
    ["/elephant/builder/mcp", `Bearer ${wrongScope}`, "insufficient_scope"],
  ];
  for (const [path, authorization, reason] of cases) {
    requestLog.length = 0;
    await post(path, authorization);
    assert.equal(requestLog.length, 1);
    assert.equal(requestLog[0].auth, reason);
    assert.equal(requestLog[0].principal, undefined);
    const line = JSON.stringify(requestLog[0]);
    for (const secret of [expired, wrongAudience, wrongScope, "dXNlcjpwYXNz"]) {
      assert.ok(!line.includes(secret));
    }
  }

  requestLog.length = 0;
  await post("/elephant/mcp", `Bearer ${await token()}`);
  assert.equal(requestLog[0].principal, "grant:g1");
  assert.equal(requestLog[0].auth, undefined);
});

test("a raw Calypso API key works on the Elephant endpoints", async () => {
  const client = await connect("/elephant/builder/mcp", GRANT_KEY);
  const { tools } = await client.listTools();
  assert.ok(tools.some((tool) => tool.name === "elephant-add-file"));
  await client.close();
});

test("there is no Calypso-wide /mcp endpoint", async () => {
  const res = await post("/mcp", `Bearer ${GRANT_KEY}`);
  assert.equal(res.status, 404);
});

test("serves the OpenAI domain challenge as the bare token", async () => {
  const res = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/plain/);
  assert.equal(await res.text(), "challenge-token-test");
  const posted = await fetch(`${baseUrl}/.well-known/openai-apps-challenge`, {
    method: "POST",
  });
  assert.equal(posted.status, 405);
});

test("without a challenge token the path is not found", async () => {
  const bare = new HttpServer({
    endpoints: [],
    metadata: new ProtectedResourceMetadata(baseUrl, ISSUER),
    maxBodyBytes: 1024,
    version: "0.0.0-test",
  }).createNodeServer();
  await new Promise((resolve) => bare.listen(0, "127.0.0.1", resolve));
  try {
    const res = await fetch(
      `http://127.0.0.1:${bare.address().port}/.well-known/openai-apps-challenge`,
    );
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => bare.close(resolve));
  }
});

test("health check answers", async () => {
  const res = await fetch(`${baseUrl}/healthz`);
  assert.deepEqual(await res.json(), { ok: true, version: "0.0.0-test" });
});

test("TokenCipher round-trips and rejects tampering", () => {
  const sealed = cipher.seal("sk-secret");
  assert.equal(cipher.open(sealed), "sk-secret");
  const [iv, body] = sealed.split(".");
  const flipped = Buffer.from(body, "base64url");
  flipped[0] ^= 1;
  assert.throws(() => cipher.open(`${iv}.${flipped.toString("base64url")}`));
  assert.throws(() => new TokenCipher(randomBytes(16).toString("base64")));
});

test("ModelCatalogCache loads once per key within the TTL", async () => {
  let loads = 0;
  let now = 0;
  const cache = new ModelCatalogCache(
    1000,
    10,
    async () => {
      loads += 1;
      return catalogLoader();
    },
    () => now,
  );
  const config = { apiKey: "sk-a", apiBaseUrl: API_BASE };
  await cache.get(config);
  await cache.get(config);
  assert.equal(loads, 1);
  now = 2000;
  await cache.get(config);
  assert.equal(loads, 2);
});

test("a caller over its request budget gets 429 with Retry-After", async () => {
  // A fresh grant id gives this test its own budget.
  const bearer = `Bearer ${await token({ gid: "g-throttled" })}`;
  let last;
  for (let i = 0; i <= LIMIT; i += 1) {
    last = await post("/elephant/mcp", bearer);
    if (last.status === 429) break;
    await last.body?.cancel();
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get("retry-after")) >= 1);
  assert.match((await last.json()).error.message, /Too many requests/);
});
