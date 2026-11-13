# Elephant MCP server

Hosted, stateless MCP server for Elephant by Calypso. One process serves both plugins over Streamable HTTP.

## Endpoints

| Path | Purpose |
|---|---|
| `POST /elephant/mcp` | Elephant (read-only tools) |
| `POST /elephant/builder/mcp` | Elephant Builder (add/create tools) |
| `GET /.well-known/oauth-protected-resource/elephant/mcp` | RFC 9728 metadata for Elephant |
| `GET /.well-known/oauth-protected-resource/elephant/builder/mcp` | RFC 9728 metadata for Elephant Builder |
| `GET /healthz` | `{ ok, version }` |

`GET` and `DELETE` on an MCP path answer 405: there are no server-side sessions and no SSE resumption. Every `POST` builds a fresh server bound to the caller's credential, so any instance can serve any request.

## Authentication

- **OAuth access token** from `login.calypso.so`: ES256 JWT, `aud` = the endpoint URL, `scope` = `elephant:read` or `elephant:write`, and an `ek` claim holding the grant's Calypso API key sealed with AES-256-GCM (`base64url(iv) "." base64url(ciphertext‖tag)`). A token for one endpoint is refused on the other.
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

## Layout

```
src/
  presets/    ToolPreset, ToolPresetRegistry, elephantCopy   what each plugin publishes, in Elephant's words
  catalog/    ToolCatalog, HostedUploadPolicy, InputDescriptions   registers tools through a preset
  auth/       BearerAuthenticator + ApiKeyStrategy, JwtGrantStrategy, TokenCipher, AuthChallenge
  http/       HttpServer, McpEndpoint, ProtectedResourceMetadata, ModelCatalogCache, HttpConfig, HostedServer
  server.ts   tool handlers (ask, search, buckets, sources, uploads, websites)
  buckets.ts files.ts search.ts websites.ts models.ts   Calypso API calls
```

Tools are declared once under a canonical operation id (`calypso-agent`, `calypso-search`, …, matching the Calypso API they call) and published under their Elephant names by the preset. Nothing a client sees carries a canonical id; `tests/presets.test.mjs` checks that.

Uploads take `contentBase64` or a public `sourceUrl`. Reading a path from disk is disabled: on a hosted server it would read the server's own files.

## Commands

```bash
npm ci
npm test          # build + node --test
npm run lint
npm run smoke     # spawns the server locally and probes discovery, challenges, 405s
SMOKE_BASE_URL=https://mcp.calypso.so SMOKE_API_KEY=sk-… npm run smoke   # probe a deployment, including tools/list
npm start         # node dist/index.js
```

Deployment is described by [`../render.yaml`](../render.yaml) (service `elephant-mcp`, manual deploys).
