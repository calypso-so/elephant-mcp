export const DEFAULT_CALYPSO_API_BASE_URL = "https://api.calypso.so/v1";

/**
 * What it takes to call the Calypso API on behalf of one caller.
 *
 * Built per request from the caller's credential: the server holds no key of
 * its own, so two requests never share one of these unless they share a key.
 */
export type CalypsoApiConfig = {
  /** The caller's Calypso API key. */
  readonly apiKey?: string;
  /** Calypso API base URL, ending in /v1. */
  readonly apiBaseUrl: string;
};

/** The caller's key, or a clear failure when a request carried none. */
export function requireApiKey(config: CalypsoApiConfig): string {
  const apiKey = String(config.apiKey || "").trim();
  if (!apiKey) {
    throw new Error(
      "A Calypso API key is required to call Calypso, but the request carried none.",
    );
  }
  return apiKey;
}
