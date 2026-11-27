import type { ProtectedResource } from "../auth/ProtectedResource.js";

const WELL_KNOWN = "/.well-known/oauth-protected-resource";
const DOCUMENTATION_URL = "https://www.calypso.so/elephant";

/**
 * RFC 9728 protected-resource metadata, one document per OAuth preset.
 *
 * ChatGPT reads the URL from the 401 challenge, fetches this document, and
 * learns which authorization server issues tokens for the preset. A preset
 * missing here would 401 forever, because discovery would have nowhere to go.
 */
export class ProtectedResourceMetadata {
  constructor(
    private readonly publicBaseUrl: string,
    private readonly issuer: string,
  ) {}

  /** Path this preset's document is served on. */
  static pathFor(preset: ProtectedResource): string {
    return `${WELL_KNOWN}${preset.path}`;
  }

  /** Whether the preset is OAuth-protected (and so has a document). */
  static supports(preset: ProtectedResource): boolean {
    return Boolean(preset.scope);
  }

  urlFor(preset: ProtectedResource): string | undefined {
    if (!ProtectedResourceMetadata.supports(preset)) return undefined;
    return `${this.publicBaseUrl}${ProtectedResourceMetadata.pathFor(preset)}`;
  }

  documentFor(preset: ProtectedResource): Record<string, unknown> {
    return {
      resource: preset.resourceUrl(this.publicBaseUrl),
      authorization_servers: [this.issuer],
      scopes_supported: preset.scopes(),
      bearer_methods_supported: ["header"],
      resource_name: preset.displayName,
      resource_documentation: preset.documentationUrl ?? DOCUMENTATION_URL,
    };
  }
}
