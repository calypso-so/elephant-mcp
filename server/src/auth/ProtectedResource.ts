/**
 * What authentication and discovery need to know about one MCP endpoint.
 *
 * A preset is the usual implementation. Naming only these members keeps the
 * bearer checks and the protected-resource metadata free of any one product's
 * tools, so another Calypso server can be protected by the same classes.
 */
export interface ProtectedResource {
  /** HTTP path the endpoint is served on, e.g. `/elephant/mcp`. */
  readonly path: string;
  /** OAuth scope a bearer token must carry to connect at all. */
  readonly scope: string;
  /** Human name shown on consent and in protected-resource metadata. */
  readonly displayName: string;
  /** Where the product is documented; the metadata links to it. */
  readonly documentationUrl?: string;
  /** Every OAuth scope a grant for this endpoint may carry. */
  scopes(): string[];
  /** Absolute resource URL (`aud`) under a public base URL. */
  resourceUrl(publicBaseUrl: string): string;
}
