import { ManifestBuilder } from "../ManifestBuilder.js";
import type { PackageView } from "../PackageView.js";
import type { Profile } from "../Profile.js";
import type { Finding } from "../types.js";
import { FindingList } from "./FindingList.js";
import type { Rule } from "./Rule.js";

type Manifest = Record<string, unknown> & { interface?: Record<string, unknown> };

/** `.codex-plugin/plugin.json` exists, parses and carries every required field. */
export class ManifestShapeRule implements Rule {
  readonly id = "ManifestShapeRule";

  private static readonly SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  private static readonly SLUG = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
  private static readonly TOP_STRINGS = ["name", "version", "description", "homepage", "skills"];
  private static readonly INTERFACE_STRINGS = [
    "displayName",
    "shortDescription",
    "longDescription",
    "developerName",
    "category",
    "brandColor",
    "brandColorDark",
    "icon",
    "logo",
    "websiteURL",
    "privacyPolicyURL",
    "termsOfServiceURL",
  ];
  private static readonly INTERFACE_LISTS = ["capabilities", "defaultPrompts"];
  private static readonly URL_FIELDS = ["websiteURL", "privacyPolicyURL", "termsOfServiceURL"];

  async check(view: PackageView, profile: Profile): Promise<Finding[]> {
    const out = new FindingList(this.id);
    const path = ManifestBuilder.PATH;
    if (!view.has(path)) {
      out.error("manifest is missing", path);
      return out.findings;
    }
    const manifest = view.json<Manifest>(path);
    if (!manifest || typeof manifest !== "object") {
      out.error("manifest is not valid JSON", path);
      return out.findings;
    }

    for (const field of ManifestShapeRule.TOP_STRINGS) {
      if (!ManifestShapeRule.nonEmpty(manifest[field])) out.error(`"${field}" must be a non-empty string`, path);
    }
    if (typeof manifest.name === "string" && !ManifestShapeRule.SLUG.test(manifest.name)) {
      out.error(`"name" must be a lowercase slug, got "${manifest.name}"`, path);
    }
    if (typeof manifest.version === "string" && !ManifestShapeRule.SEMVER.test(manifest.version)) {
      out.error(`"version" must be MAJOR.MINOR.PATCH, got "${manifest.version}"`, path);
    }
    if (manifest.version !== profile.version) {
      out.error(`"version" ${String(manifest.version)} does not match the profile (${profile.version})`, path);
    }
    if (manifest.skills !== ManifestBuilder.SKILLS_PATH) {
      out.error(`"skills" must be "${ManifestBuilder.SKILLS_PATH}"`, path);
    }
    const author = manifest.author as Record<string, unknown> | undefined;
    if (!author || !ManifestShapeRule.nonEmpty(author.name)) out.error(`"author.name" is required`, path);

    const ui = manifest.interface;
    if (!ui || typeof ui !== "object") {
      out.error(`"interface" is required`, path);
    } else {
      for (const field of ManifestShapeRule.INTERFACE_STRINGS) {
        if (!ManifestShapeRule.nonEmpty(ui[field])) out.error(`"interface.${field}" must be a non-empty string`, path);
      }
      for (const field of ManifestShapeRule.INTERFACE_LISTS) {
        const list = ui[field];
        if (!Array.isArray(list) || list.length === 0 || !list.every(ManifestShapeRule.nonEmpty)) {
          out.error(`"interface.${field}" must be a non-empty list of strings`, path);
        }
      }
      for (const field of ManifestShapeRule.URL_FIELDS) {
        const value = ui[field];
        if (typeof value === "string" && !value.startsWith("https://")) {
          out.error(`"interface.${field}" must be an https URL`, path);
        }
      }
      for (const field of ["icon", "logo"]) {
        const value = ui[field];
        if (typeof value === "string") {
          const relative = value.replace(/^\.\//, "");
          if (!view.has(relative)) out.error(`"interface.${field}" points at missing ${relative}`, path);
        }
      }
    }

    const review = manifest.review as Record<string, unknown> | undefined;
    if (!review || !Array.isArray(review.test_cases)) out.error(`"review.test_cases" is required`, path);
    const publication = manifest.publication as Record<string, unknown> | undefined;
    if (!publication || !Array.isArray(publication.countries) || !ManifestShapeRule.nonEmpty(publication.releaseNotes)) {
      out.error(`"publication" needs countries and releaseNotes`, path);
    }
    return out.findings;
  }

  private static nonEmpty(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
  }
}
