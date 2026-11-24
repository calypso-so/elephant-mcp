# Elephant MCP server: PDF AI & docs Q&A for Claude, ChatGPT and Cursor

Chat with your PDFs, documents and web pages from any MCP client, and get every answer with the file and page it came from. Save a file once at [elephant.calypso.so](https://elephant.calypso.so), then ask it from Claude, Claude Code, ChatGPT, Cursor or Windsurf.

- **Ask** your lecture notes, research papers, contracts, manuals, invoices and reports a question, and get an answer that cites its source.
- **Search** for the exact passage, returned in full with its file and page.
- **Save** PDFs, file links and web pages into buckets (folders) without leaving the chat.
- **No guessing**: when your sources do not cover a question, Elephant says so.

It is retrieval-augmented generation (RAG) over your own documents with nothing to run: no vector database, no embeddings to manage. See the [full readme](https://github.com/calypso-so/elephant-mcp#readme) for use cases and the hosted, no-key install.

One codebase, two shapes:

- **Hosted**: stateless, one process serves both plugins over Streamable HTTP with OAuth (`dist/index.js`, deployed at `mcp.calypso.so`).
- **Local**: `elephant-mcp` on stdio for one API key, published to npm as `@calypsohq/elephant-mcp-server` (`dist/stdio.js`).

## Local (stdio)

```bash
CALYPSO_API_KEY=sk-… npx -y @calypsohq/elephant-mcp-server [--preset all|elephant|elephant-builder]
```

| Env | Default | Purpose |
|---|---|---|
| `CALYPSO_API_KEY` | — | the caller's Calypso API key (required; env only, never a flag) |
| `CALYPSO_API_BASE_URL` | `https://api.calypso.so/v1` | Calypso API |
| `ELEPHANT_PRESET` | `all` | default for `--preset` |

`all` publishes every tool under the `elephant` server name; `elephant` keeps the four reading tools only, as it always has locally. Both hatch, and neither is served over HTTP. Discovery and the knowledge inventory load once at startup. Nothing of ours writes to stdout, which belongs to the protocol; `--help` and `--version` answer on stderr.

## Endpoints

| Path | Purpose |
|---|---|
| `POST /elephant/mcp` | Elephant: every tool, offered by the scopes the caller's grant carries |
| `POST /elephant/builder/mcp` | Elephant Builder (the four add tools; kept for existing connections) |
| `GET /.well-known/oauth-protected-resource/elephant/mcp` | RFC 9728 metadata for Elephant |
| `GET /.well-known/oauth-protected-resource/elephant/builder/mcp` | RFC 9728 metadata for Elephant Builder |
| `GET /healthz` | `{ ok, version }` |

`GET` and `DELETE` on an MCP path answer 405: there are no server-side sessions and no SSE resumption. Every `POST` builds a fresh server bound to the caller's credential, so any instance can serve any request.

## Authentication

- **OAuth access token** from `login.calypso.so`: ES256 JWT, `aud` = the endpoint URL, `scope` = the scopes the user allowed (`elephant:read`, and on `/elephant/mcp` optionally `elephant:write` and `elephant:organise`), and an `ek` claim holding the grant's Calypso API key sealed with AES-256-GCM (`base64url(iv) "." base64url(ciphertext‖tag)`). A token for one endpoint is refused on the other.
- **Calypso API key** (`Authorization: Bearer sk-…`), for testing and clients that cannot do OAuth. Header only, never in the URL.

An unauthenticated request gets `401` with `WWW-Authenticate: Bearer resource_metadata="…"`, which is how ChatGPT discovers sign-in.

## Configuration

| Env | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | listen port |
| `ELEPHANT_PUBLIC_BASE_URL` | `https://mcp.calypso.so` | public origin; each endpoint's OAuth audience |
| `CALYPSO_OAUTH_ISSUER` | `https://login.calypso.so` | authorization server |
| `ELEPHANT_JWKS_URL` | `<issuer>/.well-known/jwks.json` | token signing keys |
| `ELEPHANT_TOKEN_ENC_KEY` | — | 32-byte base64 key shared with the authorization server; unset turns OAuth off (API keys only) |
| `CALYPSO_API_BASE_URL` | `https://api.calypso.so/v1` | Calypso API |
| `ELEPHANT_REQUESTS_PER_MINUTE` | `120` | per-caller request budget |
| `ELEPHANT_OPENAI_CHALLENGE_TOKEN` | — | OpenAI plugin portal domain-verification token, served as plain text at `/.well-known/openai-apps-challenge`; unset answers 404 |

## Layout

```
src/
  index.ts               hosted entry point: reads HttpConfig, composes and starts the HTTP server
  stdio.ts               local entry point (`elephant-mcp`): one server over stdio for the key in the env
  stdio/                 StdioOptions (flags + env) and LocalPresets (`all`, the local-only preset)
  ElephantMcpServer.ts   builds one MCP server for one preset and one caller
  tools/                 one class per tool, each owning its name, wording and inputs
    ElephantTool.ts        base class: call() turns failures into readable tool errors
    AskTool, SearchTool, ListBucketsTool, OpenSourceTool            (Elephant)
    AddFileTool, AddFilesTool, AddWebsiteTool, CreateBucketTool     (add)
    RenameBucketTool, MoveSourcesTool                               (organise)
    ToolContext.ts, ToolLogger.ts, schemaParts.ts
  views/                 what a tool answers: one view per kind of record (SourceView, BucketView,
                         BatchView, WebsiteView, SearchView, MoveView), each naming the fields it
                         returns. No API record is handed to a client as it is. ErrorView
                         clears a failure of ids and index paths
  presets/               ToolPreset + ToolPresetRegistry: each endpoint's path, scope and tools;
                         ToolGroup (read, add, organise) and PresetInstructions, which decide
                         what one caller is offered and told
  calypso/               the Calypso API as one caller sees it (CalypsoApi groups the resources:
                         AgentResponses, KnowledgeSearch, KnowledgeBuckets, KnowledgeFiles,
                         KnowledgeBatches, KnowledgeWebsites) plus agent discovery
  auth/                  BearerAuthenticator + ApiKeyStrategy, JwtGrantStrategy, TokenCipher, AuthChallenge
  http/                  HttpServer, McpEndpoint, ProtectedResourceMetadata, ModelCatalogCache,
                         RateLimiter, HttpConfig, HostedServer (composition root)
```

Each request builds a fresh `ElephantMcpServer` bound to the caller's key, so tools hold no state between calls. `elephant-ask` is stateless too: every question is its own conversation, and a follow-up must carry its subject in the prompt.

Uploads take a ChatGPT attachment (`file`, declared in `_meta["openai/fileParams"]`), a public `sourceUrl`, or `contentBase64`. An attachment's temporary download link is handed to Calypso to import, so the bytes never pass through this server. Nothing reads from the server's disk.

Tools answer with views, not API records. The Calypso API's records also carry what only Calypso needs: which key added a file, index store and operation names, task and request ids, the workspace id. A view names each field it returns, so none of that reaches a client, including fields the API adds later. Error messages keep their code and advice and lose the same things; the server's own log keeps them whole.

Each caller (grant or API key) gets `ELEPHANT_REQUESTS_PER_MINUTE` requests per minute across both endpoints (default 120); over that, `429` with `Retry-After`.

## Commands

```bash
npm ci
npm test          # build + node --test
npm run lint
npm run smoke     # spawns the HTTP server locally and probes discovery, challenges, 405s
npm run smoke:stdio                        # spawns elephant-mcp per preset and checks tools/list
SMOKE_API_KEY=sk-… npm run smoke:stdio     # same, plus a real elephant-list-buckets call
SMOKE_BASE_URL=https://mcp.calypso.so SMOKE_API_KEY=sk-… npm run smoke   # probe a deployment, including tools/list
npm start         # node dist/index.js
```

Deployment is described by [`../render.yaml`](../render.yaml) (service `elephant-mcp`, manual deploys). The npm package publishes from [`../.github/workflows/publish.yml`](../.github/workflows/publish.yml) on push to `main` when the version is new; `prepublishOnly` runs lint, typecheck, tests and the stdio smoke first.
