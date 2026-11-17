<div align="center">

<img src="plugins/shared/assets/logo.png" alt="Elephant by Calypso" width="200">

# an elephant never forgets

**Elephant gives ChatGPT your team's memory. Answers come from your own files and websites, with the source attached.**

<a href="https://github.com/calypso-so/elephant/actions/workflows/ci.yml"><img src="https://github.com/calypso-so/elephant/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://modelcontextprotocol.io"><img src="https://img.shields.io/badge/MCP-Streamable_HTTP-3B2622?style=flat-square" alt="MCP Streamable HTTP"></a>
<a href="#how-it-works"><img src="https://img.shields.io/badge/auth-OAuth_2.1_%2B_PKCE-E9C4A8?style=flat-square" alt="OAuth 2.1 + PKCE"></a>
<a href="#license"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License: MIT"></a>

<table>
<tr>
<td align="center" width="25%"><h3>8 tools</h3>in two plugins<br><sub><a href="#pick-your-plugin">4 to read, 4 to write</a></sub></td>
<td align="center" width="25%"><h3>0 databases</h3>on this server<br><sub><a href="#how-it-works">every request stands alone</a></sub></td>
<td align="center" width="25%"><h3>15 minutes</h3>per access token<br><sub><a href="#how-it-works">bound to one endpoint</a></sub></td>
<td align="center" width="25%"><h3>1 click</h3>to disconnect<br><sub><a href="#privacy">key revoked, access ends</a></sub></td>
</tr>
</table>

**[Install](#install) · [Pick your plugin](#pick-your-plugin) · [How it works](#how-it-works) · [Privacy](#privacy) · [Build](#build) · [Deploy](#deploy) · [License](#license)**

</div>

---

<table>
<tr>
<th width="50%">ChatGPT alone</th>
<th width="50%"><img src="plugins/shared/assets/icon.png" width="18" height="18" alt=""> ChatGPT with Elephant</th>
</tr>
<tr>
<td valign="top">

> I don't have access to your company's internal policies, so I can't say what your refund window is. Refund windows are commonly 14 or 30 days; check your terms of service or ask your support team.

</td>
<td valign="top">

> 30 days from purchase, prorated after the first month.
>
> **Source:** *Refund policy.pdf* · Billing bucket

</td>
</tr>
</table>

**Same question. One guess, one answer with its source.** <sub>Illustrative example.</sub>

## Install

Elephant connects to ChatGPT over OAuth. Nothing to download, no key to paste.

1. In ChatGPT's settings, turn on developer mode for apps.
2. Create an app with the endpoint for the plugin you want:

   ```text
   https://mcp.calypso.so/elephant/mcp
   ```

3. Sign in to Calypso, pick a team, and allow access. Done.

Disconnect any time from **API Keys** in Calypso. The connection ends with the key.

<sub>Directory listing pending review. Until then, developer mode is the way in. Needs a Calypso workspace with knowledge in it.</sub>

## Pick your plugin

| Plugin | Endpoint | Scope | Tools |
|---|---|---|---|
| **Elephant by Calypso** · `elephant` | `/elephant/mcp` | `elephant:read` | Ask Elephant · Search Elephant · List buckets · Open a source |
| **Elephant Builder by Calypso** · `elephant-builder` | `/elephant/builder/mcp` | `elephant:write` | Add a file · Add files · Add a website · Create a bucket |

Elephant only reads. Builder adds to your knowledge and never deletes. Elephant ships first; Builder follows once Elephant is approved.

| Tool | What it does |
|---|---|
| `elephant-ask` | Answers from the team's knowledge, with sources. Each question stands alone |
| `elephant-search` | Matching passages and where they live, no answer written |
| `elephant-list-buckets` | The team's knowledge buckets, to aim a search |
| `elephant-open-source` | One source's details: name, type, size, and whether it is ready |
| `elephant-add-file` | Adds a file attached in ChatGPT, a public URL, or base64 bytes |
| `elephant-add-files` | Up to 100 files in one request |
| `elephant-add-website` | Adds a web page; Calypso reads it and writes its title, summary and tags |
| `elephant-create-bucket` | A new bucket to hold sources |

## How it works

```text
ChatGPT ──POST──▶ mcp.calypso.so/elephant/mcp                 server/  (this repo)
   │                401 + WWW-Authenticate ─▶ /.well-known/oauth-protected-resource/elephant/mcp
   └──OAuth 2.1 (PKCE, dynamic registration)──▶ login.calypso.so/oauth/*      Calypso web app
                                                 consent mints a scoped Calypso API key
server verifies the token, unseals the grant's key ──▶ api.calypso.so/v1     Calypso API
```

| Rule | What it means |
|---|---|
| **No state** | No database, no sessions. Every `POST` builds a fresh server for its caller, so any instance serves any request |
| **One key per grant** | Allowing access mints a Calypso API key scoped to the plugin: read for Elephant, add and create for Builder |
| **Short, bound tokens** | ES256 JWT, 15 minutes, audience = the endpoint URL. A token for one plugin is refused on the other |
| **Key travels sealed** | The grant's key rides inside the token, sealed with AES-256-GCM. Only this server and the authorization server hold the key to open it |
| **Revocation is real** | Disconnect revokes the key. Calls fail within a minute, whatever token the client still holds |
| **Fair use** | 120 requests per minute per caller across both plugins. Over that: `429` with `Retry-After` |
| **Empty team says so** | A team with no ready source gets the first-minute card instead of an answer, and never a guess |

## First minute

The hatch lives in the protocol, not on a page. Right after Allow, the next thing a person sees is
their assistant's reply — so that is where Elephant introduces itself, and only while it has to:

- **Session instructions** change with the team: empty → *greet briefly, offer the three steps,
  never answer from general knowledge*; with knowledge → the normal text plus *cite, and open the
  source on request*.
- **One prompt, `elephant-get-started`** — `/elephant:get-started` in Claude Code, a starter in
  ChatGPT. Empty team: add a first source → wait for *ready* → ask something only your files know.
  Team with knowledge: *"2 buckets, 41 sources ready"* and three questions drawn from its bucket names.
- **The first answer on an empty team is the hatch**: `elephant-ask` and `elephant-search` return
  the card instead of calling the agent. It stops the moment a source is ready — the only state is
  the team's knowledge, read fresh (cached 20 s per caller, re-read once when it says empty).

The authorization server lives in the Calypso web app at `login.calypso.so`, not here. This repo is the MCP server and the plugin packaging.

## Privacy

- **Your files stay in Calypso.** A ChatGPT attachment reaches Calypso through its temporary download link. The bytes never pass through this server, and nothing is written to its disk.
- **No prompts stored here.** The server keeps no database. It logs tool names, ids, counts and errors, never question text, answers or file contents.
- **Your team decides.** Access needs a team member's consent. It ends within 15 minutes of that person leaving the team, and within a minute of Disconnect.
- **No secret in a package.** The plugin ZIPs carry only the endpoint URL. ChatGPT finds sign-in from the server's protected-resource metadata.

## Build

Node 20 or later. CI runs both on every pull request and every push to `main`, on Node 20 and 22.

```bash
cd server  && npm ci && npm test && npm run lint && npm run smoke   # MCP server
cd plugins && npm ci && npm test && npm run build -- --profile all  # plugin ZIPs + SHA256SUMS
```

| Folder | What it is | Read more |
|---|---|---|
| [`server/`](server/) | The hosted MCP server: one class per tool, presets, OAuth bearer auth, rate limit | [server/README.md](server/README.md) |
| [`plugins/`](plugins/) | Profiles, skills and the packaging tool. Same tree, same bytes: builds are reproducible | [plugins/README.md](plugins/README.md) |

Probe a live deployment, `tools/list` included:

```bash
SMOKE_BASE_URL=https://mcp.calypso.so SMOKE_API_KEY=sk-… npm run smoke
```

## Deploy

[`render.yaml`](render.yaml) describes the service: `elephant-mcp`, root `server/`, health check `/healthz`, manual deploys.

| Env | Default | Purpose |
|---|---|---|
| `ELEPHANT_PUBLIC_BASE_URL` | `https://mcp.calypso.so` | Public origin; each endpoint's token audience |
| `CALYPSO_OAUTH_ISSUER` | `https://login.calypso.so` | Authorization server |
| `CALYPSO_API_BASE_URL` | `https://api.calypso.so/v1` | Calypso API |
| `ELEPHANT_TOKEN_ENC_KEY` | none | 32-byte base64 key, shared with the authorization server. Unset: OAuth off, API keys only |
| `ELEPHANT_JWKS_URL` | `<issuer>/.well-known/jwks.json` | Token signing keys |
| `ELEPHANT_REQUESTS_PER_MINUTE` | `120` | Per-caller request budget |
| `PORT` | `8080` | Listen port |

## License

[MIT](LICENSE). The tool handlers started as a copy of [`calypso-mcp-server`](https://github.com/calypso-so/calypso-mcp-server) 3.0.0 and are maintained here on their own. That project stays the local `npx` server for Claude Desktop, Cursor and other MCP clients.

---

<div align="center">

🐘 **Your team already wrote it down. Elephant remembers where.**

<sub>
<a href="server/README.md">Server</a> ·
<a href="plugins/README.md">Packaging</a> ·
<a href="render.yaml">Deploy</a> ·
<a href="https://calypso.so">Calypso</a> ·
<a href="https://github.com/calypso-so/elephant/issues">Issues</a>
</sub>

</div>
