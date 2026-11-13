<img src="plugins/shared/assets/icon.png" alt="Elephant by Calypso" width="160">

# Elephant by Calypso

Elephant brings a team's Calypso knowledge into ChatGPT: cited answers from the files and websites the team keeps in Calypso. This repository holds everything Elephant-specific.

| Folder | What it is |
|---|---|
| [`server/`](server/) | The hosted MCP server (stateless Streamable HTTP, OAuth). Deployed at `https://mcp.calypso.so`. |
| [`plugins/`](plugins/) | The packaging tool and profiles that build the ChatGPT plugin ZIPs. |

## The two plugins

| Plugin | Endpoint | Tools | Scope |
|---|---|---|---|
| **Elephant by Calypso** (`elephant`) | `/elephant/mcp` | `elephant-ask`, `elephant-search`, `elephant-list-buckets`, `elephant-open-source` — all read-only | `elephant:read` |
| **Elephant Builder by Calypso** (`elephant-builder`) | `/elephant/builder/mcp` | `elephant-add-file`, `elephant-add-files`, `elephant-add-website`, `elephant-create-bucket` | `elephant:write` |

Elephant ships first. Elephant Builder follows once Elephant is approved.

## How the pieces fit

```
ChatGPT ──POST──▶ mcp.calypso.so/elephant/mcp        server/ (this repo)
   │                 401 + WWW-Authenticate → /.well-known/oauth-protected-resource/elephant/mcp
   └──OAuth (PKCE, dynamic registration)──▶ login.calypso.so/oauth/*   (Calypso web app)
                                              consent mints a scoped Calypso API key for the grant
server verifies the access token, unseals the grant's key ──▶ api.calypso.so/v1   (Calypso API)
```

- The **authorization server** lives in the Calypso web app (`login.calypso.so`), not here.
- The server here keeps **no state and no database**. An access token is a short-lived ES256 JWT whose audience is the endpoint URL; it carries the grant's Calypso API key sealed with AES-256-GCM. Revoking the key in Calypso ends access.
- The tool handlers started as a copy of [`calypso-mcp-server`](https://github.com/calypso-so/calypso-mcp-server) 3.0.0 and are maintained here independently. That project stays the local (npx) server for Claude Desktop, Cursor and other MCP clients.

## Working here

```bash
cd server  && npm ci && npm test && npm run smoke
cd plugins && npm ci && npm test && npm run build -- --profile all
```

CI runs both on every pull request. See each folder's README for details.
