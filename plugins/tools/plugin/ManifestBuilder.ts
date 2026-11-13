import type { Profile } from "./Profile.js";

/**
 * Profile → `.codex-plugin/plugin.json`, in the shape Octagon ships to the
 * ChatGPT plugin directory. Key order is fixed here, so serialisation is
 * stable and the archive stays byte-identical across rebuilds.
 */
export class ManifestBuilder {
  static readonly PATH = ".codex-plugin/plugin.json";
  static readonly SKILLS_PATH = "./skills/";

  build(profile: Profile): Record<string, unknown> {
    const config = profile.config;
    const ui = config.interface;
    return {
      name: config.name,
      version: config.version,
      description: config.description,
      author: { ...config.author },
      homepage: config.homepage,
      skills: ManifestBuilder.SKILLS_PATH,
      interface: {
        displayName: ui.displayName,
        shortDescription: ui.shortDescription,
        longDescription: ui.longDescription,
        developerName: ui.developerName,
        category: ui.category,
        capabilities: [...ui.capabilities],
        defaultPrompts: [...ui.defaultPrompts],
        brandColor: ui.brandColor,
        brandColorDark: ui.brandColorDark,
        icon: ui.icon,
        logo: ui.logo,
        websiteURL: ui.websiteURL,
        privacyPolicyURL: ui.privacyPolicyURL,
        termsOfServiceURL: ui.termsOfServiceURL,
      },
      review: {
        test_cases: config.review.test_cases.map((testCase) => ({ ...testCase })),
        ...(config.review.demo_recording_url ? { demo_recording_url: config.review.demo_recording_url } : {}),
      },
      publication: {
        countries: [...config.publication.countries],
        releaseNotes: config.publication.releaseNotes,
      },
    };
  }

  serialize(profile: Profile): string {
    return `${JSON.stringify(this.build(profile), null, 2)}\n`;
  }
}
