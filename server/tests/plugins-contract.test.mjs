import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ToolPresetRegistry } from "../dist/presets/ToolPresetRegistry.js";

/**
 * The plugin packages in ../plugins describe this server to ChatGPT's
 * reviewers: endpoint, server key and every tool by name and title. A rename
 * on one side only would ship a package that names tools the server does not
 * have, so the two are checked against each other here.
 */
const profiles = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "plugins",
  "profiles",
);
const PUBLIC_BASE_URL = "https://mcp.calypso.so";

for (const preset of ToolPresetRegistry.all()) {
  test(`plugins/${preset.id} matches the ${preset.path} endpoint`, () => {
    const config = JSON.parse(
      readFileSync(join(profiles, preset.id, "plugin.config.json"), "utf8"),
    );
    assert.equal(config.mcp.url, preset.resourceUrl(PUBLIC_BASE_URL));
    assert.equal(config.mcp.serverName, preset.serverName);
    assert.deepEqual(
      config.mcp.tools.map((tool) => [tool.name, tool.title]),
      preset.tools.map((tool) => [tool.name, tool.title]),
    );
  });
}
