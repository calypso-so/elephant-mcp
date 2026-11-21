import { formatApiError, readResponseBody } from "./apiErrors.js";
import { type CalypsoApiConfig, requireApiKey } from "./CalypsoApiConfig.js";

export type CalypsoRequest = {
  readonly method: "GET" | "POST" | "PATCH";
  /** Sent as JSON when present. */
  readonly body?: unknown;
  /** Extra headers, e.g. `Idempotency-Key`. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
};

/**
 * Authenticated JSON transport to the Calypso API for one caller.
 *
 * Every Calypso call goes through `request`, so the bearer header, the URL
 * rule and the error wording exist once instead of once per resource.
 */
export class CalypsoApiClient {
  constructor(readonly config: CalypsoApiConfig) {}

  /** Absolute URL for a path under the API base, e.g. `/knowledge/buckets`. */
  url(relativePath: string): string {
    const path = relativePath.replace(/^\//, "");
    return new URL(path, `${this.config.apiBaseUrl}/`).toString();
  }

  /** Performs the call and returns the parsed body; throws on a non-2xx. */
  async request<T>(relativePath: string, request: CalypsoRequest): Promise<T> {
    const response = await fetch(this.url(relativePath), {
      method: request.method,
      headers: this.headersFor(request),
      ...(request.body === undefined
        ? {}
        : { body: JSON.stringify(request.body) }),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const body = await readResponseBody(response);
    if (!response.ok) {
      throw new Error(formatApiError(response.status, body));
    }
    return body as T;
  }

  private headersFor(request: CalypsoRequest): Record<string, string> {
    return {
      Authorization: `Bearer ${requireApiKey(this.config)}`,
      ...(request.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
      ...request.headers,
    };
  }
}
