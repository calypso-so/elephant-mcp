import { ManifestBuilder } from "../ManifestBuilder.js";
import type { PackageView } from "../PackageView.js";
import type { Profile } from "../Profile.js";
import type { Finding, ReviewCase } from "../types.js";
import { FindingList } from "./FindingList.js";
import type { Rule } from "./Rule.js";

/**
 * OpenAI review needs at least five positive and three negative cases.
 * Positive cases name a shipped tool; negative cases say where the request
 * belongs instead. `listing.smokeTests` mirrors the cases one for one, so
 * the portal form, the demo recording and the automated check agree.
 */
export class ReviewCasesRule implements Rule {
  readonly id = "ReviewCasesRule";

  static readonly MIN_POSITIVE = 5;
  static readonly MIN_NEGATIVE = 3;

  async check(view: PackageView, profile: Profile): Promise<Finding[]> {
    const out = new FindingList(this.id);
    const path = ManifestBuilder.PATH;
    const manifest = view.json<{ review?: { test_cases?: ReviewCase[]; demo_recording_url?: string } }>(path);
    const cases = manifest?.review?.test_cases ?? [];
    const positive = cases.filter((testCase) => testCase.kind === "positive");
    const negative = cases.filter((testCase) => testCase.kind === "negative");

    if (positive.length < ReviewCasesRule.MIN_POSITIVE) {
      out.error(`${positive.length} positive test cases (need ${ReviewCasesRule.MIN_POSITIVE})`, path);
    }
    if (negative.length < ReviewCasesRule.MIN_NEGATIVE) {
      out.error(`${negative.length} negative test cases (need ${ReviewCasesRule.MIN_NEGATIVE})`, path);
    }

    const ids = new Set<string>();
    for (const testCase of cases) {
      const label = `test case "${testCase.id ?? "?"}"`;
      if (!testCase.id || ids.has(testCase.id)) out.error(`${label} needs a unique id`, path);
      ids.add(testCase.id);
      if (testCase.kind !== "positive" && testCase.kind !== "negative") out.error(`${label} has kind "${String(testCase.kind)}"`, path);
      if (!testCase.prompt?.trim()) out.error(`${label} has no prompt`, path);
      if (!testCase.expected_behavior?.trim()) out.error(`${label} has no expected_behavior`, path);
      if (testCase.kind === "positive") {
        if (!testCase.expected_tool || !profile.toolNames.includes(testCase.expected_tool)) {
          out.error(`${label} must expect one of [${profile.toolNames.join(", ")}]`, path);
        }
      }
      if (testCase.kind === "negative") {
        if (testCase.expected_tool) out.error(`${label} is negative but expects a tool`, path);
        if (!testCase.routes_to?.trim()) out.error(`${label} must say where the request belongs (routes_to)`, path);
      }
    }
    const shippedTools = new Set(positive.map((testCase) => testCase.expected_tool));
    for (const tool of profile.toolNames) {
      if (!shippedTools.has(tool)) out.warning(`no positive test case exercises "${tool}"`, path);
    }

    const smoke = profile.config.listing.smokeTests;
    if (smoke.length !== cases.length) {
      out.error(`listing.smokeTests has ${smoke.length} entries, review has ${cases.length}`, "plugin.config.json");
    }
    cases.forEach((testCase, index) => {
      const mirror = smoke[index];
      if (!mirror || mirror.id !== testCase.id || mirror.prompt !== testCase.prompt) {
        out.error(`listing.smokeTests[${index}] does not mirror review case "${testCase.id}"`, "plugin.config.json");
      }
    });

    if (!manifest?.review?.demo_recording_url) {
      out.warning("review.demo_recording_url is not set (needed before submission)", path);
    }
    return out.findings;
  }
}
