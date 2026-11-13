import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SlugTable } from "../../tools/plugin/SlugTable.js";
import { Validator } from "../../tools/plugin/Validator.js";
import { Fixtures } from "./Fixtures.js";

/** Every shipped profile, with its expectations from the plan's slug table. */
const PROFILES = [
  {
    name: "elephant",
    displayName: "Elephant by Calypso",
    serverName: "elephant",
    url: "https://mcp.calypso.so/elephant/mcp",
    tools: ["elephant-ask", "elephant-search", "elephant-list-buckets", "elephant-open-source"],
    skills: [
      "ask-elephant",
      "elephant-doesnt-know",
      "elephant-get-started",
      "elephant-status",
      "find-a-bucket",
      "open-a-source",
      "search-elephant",
    ],
    sibling: "Elephant Builder by Calypso",
  },
  {
    name: "elephant-builder",
    displayName: "Elephant Builder by Calypso",
    serverName: "elephant-builder",
    url: "https://mcp.calypso.so/elephant/builder/mcp",
    tools: ["elephant-add-file", "elephant-add-files", "elephant-add-website", "elephant-create-bucket"],
    skills: ["add-a-file", "add-a-website", "create-a-bucket", "elephant-builder-get-started", "elephant-builder-status"],
    sibling: "Elephant by Calypso",
  },
] as const;

describe("profiles", () => {
  it("discovers exactly the two Elephant profiles", () => {
    assert.deepEqual(Fixtures.loader.available(), ["elephant", "elephant-builder"]);
    assert.deepEqual(Fixtures.loader.resolveNames("all"), ["elephant", "elephant-builder"]);
  });

  for (const expected of PROFILES) {
    describe(expected.name, () => {
      const { profile, view } = Fixtures.built(expected.name);
      const manifest = Fixtures.manifest(view);

      it("validates with zero errors", async () => {
        const findings = await Validator.standard().validate(view, profile);
        assert.deepEqual(Validator.errors(findings), []);
      });

      it("matches the slug table", () => {
        const entry = SlugTable.find(expected.name);
        assert.ok(entry);
        assert.equal(entry.displayName, expected.displayName);
        assert.deepEqual(entry.tools, expected.tools);
        assert.equal(Fixtures.target.archiveName(profile), `${expected.name}-openai-1.0.0.zip`);
        assert.equal(SlugTable.archiveName(expected.name, "1.0.0"), Fixtures.target.archiveName(profile));
      });

      it("emits the manifest in the Octagon shape", () => {
        assert.equal(manifest.name, expected.name);
        assert.equal(manifest.version, "1.0.0");
        assert.equal(manifest.skills, "./skills/");
        assert.equal(manifest.author.name, "Calypso");
        assert.equal(manifest.interface.displayName, expected.displayName);
        assert.equal(manifest.interface.websiteURL, "https://www.calypso.so/elephant");
        assert.equal(manifest.interface.privacyPolicyURL, "https://www.calypso.so/privacy");
        assert.equal(manifest.interface.termsOfServiceURL, "https://www.calypso.so/terms");
        assert.equal(manifest.interface.icon, "./assets/icon.png");
        assert.equal(manifest.interface.logo, "./assets/logo.png");
        assert.ok(manifest.publication.releaseNotes.length > 0);
      });

      it("points .mcp.json at the scoped endpoint only", () => {
        assert.deepEqual(view.json(".mcp.json"), { mcpServers: { [expected.serverName]: { url: expected.url } } });
      });

      it("ships exactly its skills and assets", () => {
        assert.deepEqual(profile.skills.names, [...expected.skills]);
        assert.deepEqual(
          view.paths.filter((path) => path.startsWith("assets/")),
          ["assets/icon.png", "assets/logo.png"],
        );
      });

      it("has 5 positive and 3 negative review cases, mirrored as smoke tests", () => {
        const cases = manifest.review.test_cases as Array<Record<string, string>>;
        assert.equal(cases.filter((testCase) => testCase.kind === "positive").length, 5);
        assert.equal(cases.filter((testCase) => testCase.kind === "negative").length, 3);
        assert.deepEqual(
          profile.config.listing.smokeTests.map((test) => [test.id, test.prompt]),
          cases.map((testCase) => [testCase.id, testCase.prompt]),
        );
        assert.ok(cases.some((testCase) => testCase.routes_to === expected.sibling));
      });

      it("never mentions an internal calypso-* tool id", () => {
        for (const [path, text] of view.textFiles()) {
          for (const canonical of profile.config.catalog.canonicalTools) {
            assert.ok(!text.includes(canonical), `${path} mentions ${canonical}`);
          }
        }
      });

      it("routes every skill to a 'does not do' section", () => {
        for (const skill of profile.skills.list()) {
          assert.match(skill.markdown, /^## What Elephant( Builder)? does not do$/m, skill.name);
        }
      });
    });
  }
});
