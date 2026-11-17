import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ArchiveShapeRule } from "../../tools/plugin/rules/ArchiveShapeRule.js";
import { BrandColorRule } from "../../tools/plugin/rules/BrandColorRule.js";
import { ForbiddenTextRule } from "../../tools/plugin/rules/ForbiddenTextRule.js";
import { ImageRule } from "../../tools/plugin/rules/ImageRule.js";
import { LinkIntegrityRule } from "../../tools/plugin/rules/LinkIntegrityRule.js";
import { ListingTextRule } from "../../tools/plugin/rules/ListingTextRule.js";
import { ManifestShapeRule } from "../../tools/plugin/rules/ManifestShapeRule.js";
import { NamingRule } from "../../tools/plugin/rules/NamingRule.js";
import { ReviewCasesRule } from "../../tools/plugin/rules/ReviewCasesRule.js";
import type { Rule, UrlProbe } from "../../tools/plugin/rules/Rule.js";
import { SecretScanRule } from "../../tools/plugin/rules/SecretScanRule.js";
import { SkillRule } from "../../tools/plugin/rules/SkillRule.js";
import { SkillToolRule } from "../../tools/plugin/rules/SkillToolRule.js";
import { UrlRule } from "../../tools/plugin/rules/UrlRule.js";
import { Validator } from "../../tools/plugin/Validator.js";
import { Fixtures } from "./Fixtures.js";

const { profile, view } = Fixtures.built("elephant");
const builder = Fixtures.built("elephant-builder");

async function messages(rule: Rule, target = view, owner = profile): Promise<string[]> {
  return (await Fixtures.errors(rule, target, owner)).map((finding) => finding.message);
}

describe("Validator.standard", () => {
  it("runs all thirteen rules", () => {
    assert.deepEqual(
      Validator.standard().rules.map((rule) => rule.id),
      [
        "ManifestShapeRule",
        "ArchiveShapeRule",
        "SkillRule",
        "SkillToolRule",
        "NamingRule",
        "ForbiddenTextRule",
        "ReviewCasesRule",
        "ListingTextRule",
        "BrandColorRule",
        "ImageRule",
        "LinkIntegrityRule",
        "UrlRule",
        "SecretScanRule",
      ],
    );
  });
});

describe("ManifestShapeRule", () => {
  const rule = new ManifestShapeRule();

  it("rejects a non-semver version", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => (manifest.version = "1.0"));
    assert.ok((await messages(rule, bad)).some((message) => message.includes("MAJOR.MINOR.PATCH")));
  });

  it("rejects a wrong skills path and a missing interface field", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      manifest.skills = "skills";
      delete manifest.interface.privacyPolicyURL;
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes('"skills"')));
    assert.ok(found.some((message) => message.includes("privacyPolicyURL")));
  });

  it("rejects an icon path that is not in the package", async () => {
    assert.ok((await messages(rule, view.without("assets/icon.png"))).some((message) => message.includes("composerIcon")));
  });

  it("requires the OpenAI extension with onboarding, review and publication", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      manifest.extensions["com.openai"].onboardingSkill = "./skills/nope/SKILL.md";
      delete manifest.extensions["com.openai"].publication;
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("onboardingSkill")));
    assert.ok(found.some((message) => message.includes("publication")));
    const none = Fixtures.withManifest(view, (manifest) => delete manifest.extensions);
    assert.ok((await messages(rule, none)).some((message) => message.includes('"extensions.com.openai" is required')));
  });
});

describe("ArchiveShapeRule", () => {
  const rule = new ArchiveShapeRule();

  it("rejects stray files and OS metadata", async () => {
    const bad = view.with("notes.txt", "x").with("skills/ask-elephant/.DS_Store", "x");
    const found = await Fixtures.errors(rule, bad, profile);
    assert.deepEqual(found.map((finding) => finding.path).sort(), ["notes.txt", "skills/ask-elephant/.DS_Store"]);
  });

  it("requires .mcp.json", async () => {
    assert.ok((await Fixtures.errors(rule, view.without(".mcp.json"), profile)).length > 0);
  });
});

describe("SkillRule", () => {
  const rule = new SkillRule();

  it("rejects a front-matter name that does not match the directory", async () => {
    const path = "skills/ask-elephant/SKILL.md";
    const bad = view.with(path, (view.text(path) ?? "").replace("name: ask-elephant", "name: ask"));
    assert.ok((await messages(rule, bad)).some((message) => message.includes('must equal "ask-elephant"')));
  });

  it("rejects a skill without a routing section or citation guidance", async () => {
    const bad = view.with(
      "skills/ask-elephant/SKILL.md",
      "---\nname: ask-elephant\ndescription: A description that is long enough to pass the lower bound.\n---\n\n# Ask\n\nJust answer.\n",
    );
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("citation")));
    assert.ok(found.some((message) => message.includes("routing section")));
  });

  it("rejects a shipped skill that is not declared", async () => {
    const bad = view.with("skills/extra/SKILL.md", view.text("skills/ask-elephant/SKILL.md") ?? "");
    assert.ok((await messages(rule, bad)).some((message) => message.includes('"extra" ships')));
  });
});

describe("SkillToolRule", () => {
  const rule = new SkillToolRule();

  it("rejects an internal calypso-* tool id anywhere", async () => {
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\n## What Elephant does not do\n\nIt is calypso-agent underneath.\n");
    assert.ok((await messages(rule, bad)).some((message) => message.includes("calypso-agent")));
  });

  it("rejects a Builder tool in an Elephant skill outside a routing heading", async () => {
    const bad = Fixtures.withSkillText(view, "elephant-status", "\n## Tips\n\nUse `elephant-add-file` to add files.\n");
    assert.ok((await messages(rule, bad)).some((message) => message.includes('"elephant-add-file"')));
  });

  it("allows a Builder tool under a routing heading", async () => {
    const ok = Fixtures.withSkillText(view, "elephant-status", "\n## Not this plugin\n\n`elephant-add-file` belongs to Elephant Builder by Calypso.\n");
    assert.deepEqual(await messages(rule, ok), []);
  });

  it("rejects a sibling tool in the manifest, where no routing exemption exists", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => manifest.interface.defaultPrompt.push("Run elephant-create-bucket"));
    assert.ok((await messages(rule, bad)).length > 0);
  });

  it("rejects a shipped tool that no skill teaches", async () => {
    const bad = profile.withConfig((config) => ({
      ...config,
      mcp: { ...config.mcp, tools: [...config.mcp.tools, { name: "elephant-forget", title: "Forget", summary: "x" }] },
    }));
    const found = await messages(rule, view, bad);
    assert.ok(found.some((message) => message.includes("not in the Elephant catalog")));
    assert.ok(found.some((message) => message.includes("not described by any skill")));
  });

  it("applies to the Builder profile in the other direction", async () => {
    const bad = Fixtures.withSkillText(builder.view, "add-a-file", "\n## Tips\n\nThen call `elephant-ask`.\n");
    assert.ok((await messages(rule, bad, builder.profile)).some((message) => message.includes('"elephant-ask"')));
  });
});

describe("NamingRule", () => {
  const rule = new NamingRule();

  it("rejects a display name other than the slug table's", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => (manifest.interface.displayName = "Elephant"));
    assert.ok((await messages(rule, bad)).some((message) => message.includes("interface.displayName")));
  });

  it("rejects a wrong .mcp.json server key or URL", async () => {
    const bad = view.with(".mcp.json", JSON.stringify({ mcpServers: { calypso: { url: "https://mcp.calypso.so/mcp" } } }));
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes('exactly one server "elephant"')));
    assert.ok(found.some((message) => message.includes("MCP url")));
  });

  it("rejects product-name misspellings", async () => {
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\nElephant By Calypso and Calypso Elephant.\n");
    assert.equal((await messages(rule, bad)).length, 2);
  });

  it("rejects a tool list that differs from the plan", async () => {
    const bad = profile.withConfig((config) => ({ ...config, mcp: { ...config.mcp, tools: config.mcp.tools.slice(1) } }));
    assert.ok((await messages(rule, view, bad)).some((message) => message.includes("mcp.tools")));
  });
});

describe("ForbiddenTextRule", () => {
  const rule = new ForbiddenTextRule();

  it("rejects local-install leftovers and guessing", async () => {
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\nRun npx calypso.\nFeel free to guess.\nSet CALYPSO_API_KEY.\n");
    assert.equal((await messages(rule, bad)).length, 3);
  });

  it("applies profile fences on top of the shared ones", async () => {
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\nI uploaded the file.\n");
    assert.ok((await messages(rule, bad)).some((message) => message.includes("read-only")));
    assert.deepEqual(await messages(rule, Fixtures.withSkillText(builder.view, "add-a-file", "\nI uploaded the file.\n"), builder.profile), []);
  });
});

describe("ReviewCasesRule", () => {
  const rule = new ReviewCasesRule();

  it("requires exactly five positive and three negative cases", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      const cases = manifest.extensions["com.openai"].review.test_cases;
      cases.positive.shift();
      cases.negative.pop();
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("4 positive")));
    assert.ok(found.some((message) => message.includes("2 negative")));
  });

  it("requires positive cases to trigger a shipped tool and negatives none", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      const cases = manifest.extensions["com.openai"].review.test_cases;
      cases.positive[0].tools_triggered = "elephant-add-file";
      cases.negative[0].tools_triggered = "elephant-ask";
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("must trigger only")));
    assert.ok(found.some((message) => message.includes("negative but triggers")));
  });

  it("requires negative profile cases to say where the request belongs", async () => {
    const bad = profile.withConfig((config) => ({
      ...config,
      review: {
        ...config.review,
        test_cases: config.review.test_cases.map((testCase) =>
          testCase.kind === "negative" ? { ...testCase, routes_to: "" } : testCase,
        ),
      },
    }));
    assert.ok((await messages(rule, view, bad)).some((message) => message.includes("routes_to")));
  });

  it("requires smoke tests to mirror the review cases", async () => {
    const bad = profile.withConfig((config) => ({
      ...config,
      listing: { ...config.listing, smokeTests: config.listing.smokeTests.slice().reverse() },
    }));
    assert.ok((await messages(rule, view, bad)).some((message) => message.includes("does not mirror")));
  });

  it("warns, without failing, while the demo recording is missing", async () => {
    const findings = await rule.check(view, profile);
    assert.ok(findings.some((finding) => finding.severity === "warning" && finding.message.includes("demo_recording_url")));
  });
});

describe("ListingTextRule", () => {
  const rule = new ListingTextRule();

  it("rejects a long or punctuated short description", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => (manifest.interface.shortDescription = `${"x".repeat(31)}.`));
    assert.equal((await messages(rule, bad)).length, 2);
  });

  it("caps the display name and the starter prompts at the directory limits", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      manifest.interface.displayName = "Elephant by Calypso for Everyone!";
      manifest.interface.defaultPrompt.push("One more prompt");
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("displayName is 33")));
    assert.ok(found.some((message) => message.includes("defaultPrompt has 4")));
  });

  it("bounds the capability list", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => (manifest.interface.capabilities = ["One"]));
    assert.ok((await messages(rule, bad)).some((message) => message.includes("capabilities has 1")));
  });
});

describe("BrandColorRule", () => {
  const rule = new BrandColorRule();

  it("passes the shipped colours", async () => {
    assert.deepEqual(await messages(rule), []);
  });

  it("rejects low contrast and malformed colours", async () => {
    const bad = Fixtures.withManifest(view, (manifest) => {
      manifest.interface.brandColor = "#DDDDDD";
      manifest.interface.brandColorDark = "teal";
    });
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes("brandColor #DDDDDD")));
    assert.ok(found.some((message) => message.includes("brandColorDark must be")));
  });
});

describe("ImageRule", () => {
  const rule = new ImageRule();

  it("rejects non-PNG and non-square images", async () => {
    const notPng = view.with("assets/icon.png", "not a png");
    assert.ok((await messages(rule, notPng)).some((message) => message.includes("not a PNG")));
    const header = Buffer.from(view.read("assets/logo.png") ?? Buffer.alloc(0));
    header.writeUInt32BE(600, 20);
    assert.ok((await messages(rule, view.with("assets/logo.png", header))).some((message) => message.includes("square")));
  });
});

describe("LinkIntegrityRule", () => {
  const rule = new LinkIntegrityRule();

  it("rejects a broken relative link", async () => {
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\nSee [the guide](references/guide.md).\n");
    assert.ok((await messages(rule, bad)).some((message) => message.includes("references/guide.md")));
    const ok = bad.with("skills/ask-elephant/references/guide.md", "# Guide\n");
    assert.deepEqual(await messages(rule, ok), []);
  });

  it("probes external URLs only when online, skipping .mcp.json", async () => {
    const probed: string[] = [];
    const probe: UrlProbe = {
      probe: async (url) => {
        probed.push(url);
        return url.endsWith("/terms") ? { ok: false, status: 404 } : { ok: true, status: 200 };
      },
    };
    assert.deepEqual(await messages(rule), []);
    const found = (await Fixtures.errors(rule, view, profile, { urlProbe: probe })).map((finding) => finding.message);
    assert.ok(found.some((message) => message.includes("/terms answered 404")));
    assert.ok(probed.includes("https://www.calypso.so/privacy"));
    assert.ok(!probed.includes("https://mcp.calypso.so/elephant/mcp"));
  });
});

describe("UrlRule", () => {
  const rule = new UrlRule();

  it("accepts every owned host and rejects others and plain http", async () => {
    const owned = Fixtures.withSkillText(
      view,
      "ask-elephant",
      "\nhttps://calypso.so https://docs.calypso.so/x https://login.calypso.so https://mcp.calypso.so/elephant/mcp\n",
    );
    assert.deepEqual(await messages(rule, owned), []);
    const bad = Fixtures.withSkillText(view, "ask-elephant", "\nhttps://example.com/a and http://www.calypso.so/b\n");
    const found = await messages(rule, bad);
    assert.ok(found.some((message) => message.includes('"example.com"')));
    assert.ok(found.some((message) => message.includes("not https")));
  });
});

describe("SecretScanRule", () => {
  const rule = new SecretScanRule();

  it("catches sk- shaped keys and other credentials", async () => {
    const key = ["sk", "0123456789abcdef0123456789abcdef0123456789abcdef"].join("-");
    const bad = Fixtures.withSkillText(view, "ask-elephant", `\nkey ${key}\n`);
    assert.ok((await messages(rule, bad)).some((message) => message.includes("sk- API key")));
    const pem = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    assert.ok((await messages(rule, view.with(".mcp.json", pem))).some((message) => message.includes("private key")));
  });

  it("does not flag ordinary words", async () => {
    const ok = Fixtures.withSkillText(view, "ask-elephant", "\nask-elephant, task-based, desk-top\n");
    assert.deepEqual(await messages(rule, ok), []);
  });
});
