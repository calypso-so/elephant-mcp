import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import * as kit from "@calypsohq/elephant-mcp-server/kit";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// The kit is what another Calypso MCP server builds on. These tests stand one
// up from the kit alone: a group, a tool, a preset and an endpoint that know
// nothing about Elephant.

const {
  ApiKeyStrategy,
  BearerAuthenticator,
  HttpConfig,
  HttpServer,
  McpTool,
  ProtectedResourceMetadata,
  RateLimiter,
  StatelessMcpEndpoint,
  ToolGroup,
  ToolLogger,
  ToolPreset,
  ToolRegistrar,
} = kit;

const look = ToolGroup.define({
  id: "look",
  scope: "toy:read",
  can: "look things up",
  cannot: "",
});

class EchoTool extends McpTool {
  name = "toy-echo";
  title = "Echo";
  description = "Says back what it was told.";
  inputSchema = { text: z.string() };
  group = look;
  annotations = {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  };
  failure = "Could not echo.";

  async run(args, context) {
    if (args.text === "boom") throw new Error("nothing to echo");
    return { json: { said: args.text, by: context.who } };
  }
}

const preset = new ToolPreset({
  id: "toy",
  path: "/mcp",
  serverName: "toy",
  displayName: "Toy by Calypso",
  instructions: "A toy server.",
  scope: look.scope,
  tools: [new EchoTool()],
  documentationUrl: "https://example.test/toy",
  composeInstructions: (about, groups) =>
    `${about} It has ${groups.length} group.`,
});

function toyServer(reports = []) {
  const server = new McpServer(
    { name: preset.serverName, version: "0" },
    { capabilities: { logging: {} } },
  );
  const context = { log: new ToolLogger(server, "key:test"), who: "toy" };
  for (const tool of preset.toolsFor(kit.GrantScopes.everything())) {
    ToolRegistrar.register(server, tool, context, (report) =>
      reports.push(report),
    );
  }
  return server;
}

test("the package exports the kit under its own name, and nothing else", () => {
  assert.deepEqual(Object.keys(kit).sort(), [
    "ApiKeyStrategy",
    "AuthChallenge",
    "BearerAuthenticator",
    "CalypsoApiClient",
    "CalypsoApiError",
    "ErrorView",
    "GrantScopes",
    "HttpConfig",
    "HttpServer",
    "JwtGrantStrategy",
    "McpTool",
    "ProtectedResourceMetadata",
    "RateLimiter",
    "StatelessMcpEndpoint",
    "TokenCipher",
    "ToolGroup",
    "ToolLogger",
    "ToolPreset",
    "ToolRegistrar",
    "asRecord",
    "numberOrUndefined",
    "plainText",
    "present",
    "trimmedString",
  ]);
});

test("a tool from another product is listed and called as it describes itself", async () => {
  const reports = [];
  const server = toyServer(reports);
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "kit-test", version: "0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["toy-echo"],
  );
  assert.equal(tools[0].annotations.readOnlyHint, true);

  const said = await client.callTool({
    name: "toy-echo",
    arguments: { text: "hi" },
  });
  assert.deepEqual(JSON.parse(said.content[0].text), { said: "hi", by: "toy" });

  const failed = await client.callTool({
    name: "toy-echo",
    arguments: { text: "boom" },
  });
  assert.equal(failed.isError, true);
  assert.equal(
    failed.content[0].text,
    "Error: Could not echo. nothing to echo",
  );

  assert.deepEqual(
    reports.map((report) => [report.tool, report.outcome]),
    [
      ["toy-echo", "ok"],
      ["toy-echo", "error"],
    ],
  );
  await client.close();
});

test("a preset words its instructions its own way when it brings a composer", () => {
  assert.equal(
    preset.instructionsFor(kit.GrantScopes.everything()),
    "A toy server. It has 1 group.",
  );
});

test("a preset describes itself as a protected resource, with its own documentation", () => {
  const metadata = new ProtectedResourceMetadata(
    "https://toy.example.test",
    "https://login.example.test",
  );
  assert.equal(
    metadata.urlFor(preset),
    "https://toy.example.test/.well-known/oauth-protected-resource/mcp",
  );
  assert.deepEqual(metadata.documentFor(preset), {
    resource: "https://toy.example.test/mcp",
    authorization_servers: ["https://login.example.test"],
    scopes_supported: ["toy:read"],
    bearer_methods_supported: ["header"],
    resource_name: "Toy by Calypso",
    resource_documentation: "https://example.test/toy",
  });
});

test("the config reads another product's env names, and Elephant's by default", () => {
  const env = {
    TOY_PUBLIC_BASE_URL: "https://toy.example.test/",
    TOY_TOKEN_ENC_KEY: "toy-key",
    TOY_REQUESTS_PER_MINUTE: "7",
    ELEPHANT_PUBLIC_BASE_URL: "https://elephant.example.test",
  };
  const toy = HttpConfig.fromEnv(env, { prefix: "TOY" });
  assert.equal(toy.publicBaseUrl, "https://toy.example.test");
  assert.equal(toy.tokenEncKey, "toy-key");
  assert.equal(toy.requestsPerMinute, 7);
  assert.equal(
    HttpConfig.fromEnv(env).publicBaseUrl,
    "https://elephant.example.test",
  );
  assert.equal(
    HttpConfig.fromEnv({}, { prefix: "TOY", publicBaseUrl: "https://t.test" })
      .publicBaseUrl,
    "https://t.test",
  );
  assert.equal(HttpConfig.fromEnv({}).publicBaseUrl, "https://mcp.calypso.so");
});

test("an endpoint built on the kit refuses, then serves, without any Elephant code", async () => {
  class ToyEndpoint extends StatelessMcpEndpoint {
    async serverFor() {
      return toyServer();
    }
  }
  const metadata = new ProtectedResourceMetadata(
    "https://toy.example.test",
    "https://login.example.test",
  );
  const http = new HttpServer({
    endpoints: [
      new ToyEndpoint({
        preset,
        authenticator: new BearerAuthenticator([new ApiKeyStrategy()], (p) =>
          metadata.urlFor(p),
        ),
        limiter: new RateLimiter(100),
      }),
    ],
    metadata,
    maxBodyBytes: 1024 * 1024,
    version: "0.0.0-test",
  });
  const node = createServer((req, res) => void http.route(req, res));
  await new Promise((resolve) => node.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${node.address().port}`;
  const initialize = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "kit-test", version: "0" },
    },
  };
  const post = (headers) =>
    fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(initialize),
    });
  try {
    const refused = await post({});
    assert.equal(refused.status, 401);
    assert.match(
      refused.headers.get("www-authenticate"),
      /resource_metadata="https:\/\/toy\.example\.test\/\.well-known\/oauth-protected-resource\/mcp"/,
    );
    await refused.text();

    const served = await post({
      authorization: "Bearer sk-0123456789abcdef0123",
    });
    assert.equal(served.status, 200);
    assert.match(await served.text(), /"name":"toy"/);
  } finally {
    await new Promise((resolve) => node.close(resolve));
  }
});
