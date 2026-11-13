import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Contrast } from "../../tools/plugin/Contrast.js";
import { FrontMatter } from "../../tools/plugin/FrontMatter.js";
import { MarkdownSections } from "../../tools/plugin/MarkdownSections.js";
import { RoutingHeadings } from "../../tools/plugin/RoutingHeadings.js";
import { SkillTemplate } from "../../tools/plugin/SkillTemplate.js";
import { Fixtures } from "./Fixtures.js";

describe("ProfileLoader", () => {
  it("merges the shared parent into each profile", () => {
    const profile = Fixtures.profile("elephant");
    assert.equal(profile.config.author.name, "Calypso");
    assert.equal(profile.config.interface.brandColor, "#3B2622");
    assert.equal(profile.config.interface.displayName, "Elephant by Calypso");
    assert.deepEqual(profile.config.catalog.ownedHosts, [
      "calypso.so",
      "www.calypso.so",
      "mcp.calypso.so",
      "login.calypso.so",
      "docs.calypso.so",
    ]);
  });

  it("accumulates forbidden patterns instead of replacing them", () => {
    const elephant = Fixtures.profile("elephant").config.forbiddenPatterns;
    const builder = Fixtures.profile("elephant-builder").config.forbiddenPatterns;
    assert.equal(elephant.length, builder.length + 1);
    assert.ok(builder.every((pattern) => elephant.some((other) => other.pattern === pattern.pattern)));
  });

  it("renders the shared templates as the profile's overlay skills", () => {
    const skill = Fixtures.profile("elephant").skills.get("elephant-get-started");
    assert.ok(skill);
    assert.equal(skill.frontMatter.get("name"), "elephant-get-started");
    assert.match(skill.markdown, /^- `elephant-ask` \(Ask Elephant\): /m);
    assert.doesNotMatch(skill.markdown, /\{\{/);
  });

  it("rejects unknown profiles", () => {
    assert.throws(() => Fixtures.loader.resolveNames("octagon"), /Unknown profile/);
  });
});

describe("SkillTemplate", () => {
  const template = new SkillTemplate("t", new Map([["SKILL.md", Buffer.from("A {{one}}\n{{list}}\n{{builtin}}")]]));

  it("fills strings and turns lists into bullets", () => {
    const skill = template.render("x", { one: "1", list: ["a", "b"] }, { builtin: "B", unused: "U" });
    assert.equal(skill.markdown, "A 1\n- a\n- b\nB");
  });

  it("fails on a missing value, an unused profile value, or a shadowed built-in", () => {
    assert.throws(() => template.render("x", { one: "1" }, { builtin: "B" }), /needs a value for \{\{list\}\}/);
    assert.throws(() => template.render("x", { one: "1", list: [], extra: "e" }, { builtin: "B" }), /does not use: extra/);
    assert.throws(() => template.render("x", { one: "1", list: [], builtin: "b" }, { builtin: "B" }), /shadow/);
  });
});

describe("FrontMatter", () => {
  it("parses flat keys and quoted values", () => {
    const parsed = FrontMatter.parse("---\nname: a\ndescription: \"b: c\"\n---\n\n# Body\n");
    assert.equal(parsed.get("name"), "a");
    assert.equal(parsed.get("description"), "b: c");
    assert.equal(parsed.body, "\n# Body\n");
  });

  it("reports missing front matter", () => {
    assert.equal(FrontMatter.parse("# No front matter").present, false);
  });
});

describe("MarkdownSections and RoutingHeadings", () => {
  it("tracks nested headings and ignores fenced code", () => {
    const lines = MarkdownSections.lines("# A\n## What Elephant does not do\nx\n```\n# not a heading\n```\n## B\ny");
    assert.ok(RoutingHeadings.within(lines[2]?.headings ?? []));
    assert.ok(RoutingHeadings.within(lines[4]?.headings ?? []));
    assert.ok(!RoutingHeadings.within(lines[7]?.headings ?? []));
    assert.deepEqual(MarkdownSections.headings("# A\n## B\n```\n# C\n```"), ["A", "B"]);
  });

  it("recognises every routing heading style", () => {
    for (const title of ["What Elephant does not do", "What Elephant Builder doesn't do", "Not this plugin", "When not to use", "Related plugins"]) {
      assert.ok(RoutingHeadings.matches(title), title);
    }
    assert.ok(!RoutingHeadings.matches("How to call it"));
  });
});

describe("Contrast", () => {
  it("computes WCAG ratios", () => {
    assert.equal(Contrast.ratio("#000000", "#FFFFFF"), 21);
    assert.equal(Contrast.ratio("#777777", "#777777"), 1);
  });
});
