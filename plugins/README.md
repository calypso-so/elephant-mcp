# Elephant plugin packaging

Packages **Elephant by Calypso** for the ChatGPT plugin directory. Elephant is the public name for Calypso's knowledge layer inside chat assistants: cited answers from a team's own files and websites.

The repository holds the profiles (one per package), their skills and assets, and a small TypeScript tool that builds each package, validates it against the review rules, and writes a reproducible ZIP.

| Package | Display name | Tools | Endpoint | Ships |
|---|---|---|---|---|
| `elephant` | Elephant by Calypso | `elephant-ask`, `elephant-search`, `elephant-list-buckets`, `elephant-open-source` | `https://mcp.calypso.so/elephant/mcp` | First listing (read-only) |
| `elephant-builder` | Elephant Builder by Calypso | `elephant-add-file`, `elephant-add-files`, `elephant-add-website`, `elephant-create-bucket` | `https://mcp.calypso.so/elephant/builder/mcp` | After `elephant` is approved |

Both packages are at version 1.0.0. `elephant-builder` is built and validated with every change, but it is submitted only once `elephant` is approved in the directory.

## Commands

Node 20 or later.

```bash
npm ci
npm run build -- --profile all            # validate + write out/<p>/openai/ and out/<p>-openai-<ver>.zip, print sha256
npm run build -- --profile elephant
npm run validate -- --profile all          # validate only, writes nothing
npm run validate -- --online --profile all # also fetches every external URL in manifests and skills
npm test                                   # node --test over tests/plugin
npm run lint                               # strict tsc, no emit
```

A build exits non-zero if any rule reports an error. Warnings (today: the missing `demo_recording_url`) do not fail the build. `--profile all` also writes `out/SHA256SUMS.txt`.

## Layout

```
profiles/
  elephant/            plugin.config.json, skills/<name>/SKILL.md (assets come from shared/assets)
  elephant-builder/    same shape
shared/
  plugin.config.json   parent config: author, URLs, brand colours, tool catalog, owned hosts, forbidden patterns
  assets/              the Elephant logo (logo.png 1024) and icon (icon.png 512), shipped in every package
  skills/              templates rendered into <p>-get-started and <p>-status
tools/plugin/          the packaging tool (one class per file)
tests/plugin/          node:test suites
```

### How a package is built

1. `ProfileLoader` reads `profiles/<p>/plugin.config.json`, resolves `extends` (the shared parent), and merges them: objects merge, the profile wins on scalars and arrays, and `forbiddenPatterns` accumulate so a profile can add fences but never drop the shared ones.
2. Skills are the profile's own `skills/` directories plus the shared templates listed under `skillTemplates`. Template rendering is strict: a missing value or an unused value is an error.
3. A `Target` turns the `Profile` into a `PackageView`. `OpenAITarget` emits the Codex plugin layout:

   ```
   .codex-plugin/plugin.json   ManifestBuilder, in the portal's Codex layout: name, version, description, author,
                               homepage, license, skills "./skills/", mcpServers "./.mcp.json", interface {...}
                               (displayName and shortDescription ≤ 30 chars; website, support, privacy and terms
                               URLs; defaultPrompt; composerIcon, logo), and extensions["com.openai"]
                               { onboardingSkill, review { test_cases { positive[5], negative[3] },
                               demo_recording_url, commerce }, publication { countries, release_notes } }
   .mcp.json                   {"mcpServers": {"<serverName>": {"url": "https://mcp.calypso.so/..."}}}
   assets/icon.png, logo.png
   skills/<name>/SKILL.md
   ```

   The profile keeps its own case model (`id`, `kind`, `description`, `expected_tool`, `routes_to`); the builder
   translates it into the portal's positive/negative lists (`tools_triggered`, `expected_behavior`).

   `.mcp.json` carries only the URL. ChatGPT finds the OAuth server from the endpoint's protected-resource metadata, so no key or secret is ever packaged.
4. `Validator` runs every rule over the package. Errors stop the build.
5. `Archiver` writes the ZIP: entries sorted by path, all timestamps 1980-01-01, mode 0644, no extra fields, every entry stored. The same tree always gives the same bytes, so a SHA-256 alone shows whether a package changed.

### Rules

| Rule | Fails the build when |
|---|---|
| `ManifestShapeRule` | a manifest field is missing or malformed, the version is not `MAJOR.MINOR.PATCH`, `skills` is not `./skills/`, icon/logo paths do not resolve |
| `ArchiveShapeRule` | a file sits outside the allowed layout, OS metadata is present, or entry/size limits are exceeded |
| `SkillRule` | front matter is missing, `name` differs from the directory, the description is outside 40–500 chars, the skill gives no citation guidance or has no routing section, or the shipped skills differ from the declared list |
| `SkillToolRule` | a skill names another profile's Elephant tool outside a routing heading ("What Elephant does not do", "Not this plugin", "When not to use", "Related plugins"); the manifest names one at all; any `calypso-*` tool id appears anywhere; a shipped tool is not taught by any skill |
| `NamingRule` | package name, display name, `.mcp.json` key and URL, OAuth scope, tool list, author or website differ from the plan's slug table, or the product name is misspelled |
| `ForbiddenTextRule` | shared or profile patterns match: local-install leftovers (`npx`, other clients' setup, API-key variables, `filePath`), internal names, guessing language; `elephant` also forbids claiming it added anything |
| `ReviewCasesRule` | not exactly 5 positive / 3 negative cases, a positive case does not trigger a shipped tool, a negative case triggers one or does not say where it routes, or `listing.smokeTests` does not mirror the cases (warns without `demo_recording_url`) |
| `ListingTextRule` | display name or short description over 30 chars (the directory's limit), short description ending in punctuation, long description outside 120–2000 chars, capability count out of range, more than 3 starter prompts |
| `BrandColorRule` | `brandColor` is below 4.5:1 on light surfaces or `brandColorDark` below 4.5:1 on dark surfaces |
| `ImageRule` | icon or logo is not a square PNG of the allowed size |
| `LinkIntegrityRule` | a relative link in a skill does not resolve; with `--online`, an external URL does not answer 2xx/3xx |
| `UrlRule` | a URL is not https or not on `calypso.so`, `www.calypso.so`, `mcp.calypso.so`, `login.calypso.so`, `docs.calypso.so` |
| `SecretScanRule` | a key-shaped string (`sk-…`, cloud keys, tokens, private keys, JWTs) appears anywhere |

### Assets

`shared/assets/` holds the Elephant mascot: `logo.png` (1024×1024) and `icon.png` (512×512), both transparent PNGs scaled from the supplied artwork. Every profile ships these two files; a profile can replace one by placing a file of the same name in its own `assets/` folder. `ImageRule` checks size and shape, and a test checks that each package carries the shared files. To change the logo, replace both PNGs (keep them square and under 1 MB) and rebuild; the package hashes change with them.

## Changing a package

1. Edit `profiles/<p>/…` or `shared/…`. Never edit `out/`.
2. Bump `version` in the profile's `plugin.config.json`. The directory keys updates on version and rejects a same-version resubmission.
3. `npm test` and `npm run build -- --profile all` with 0 errors.
4. Upload the ZIP at https://platform.openai.com/plugins ("Upload new or existing plugin", then "With MCP"); the review cases, demo URL and release notes import from the manifest. Reviewer access to the demo team goes into the portal's secure form, never into the package.
5. After approval, tag the commit `openai-<package>-v<version>`.

## Before the first submission

- `https://www.calypso.so/elephant` and the support page `https://docs.calypso.so/elephant` must be live; `validate --online` fails until they are.
- `review.demo_recording_url` for each package (a recording of the eight review prompts).
- The review team with a demo bucket that the review cases are asked against.
- The MCP endpoints and OAuth server must be deployed (built in `calypso-mcp-server` and `web-app-new`).

## License

MIT, see [LICENSE](LICENSE).
