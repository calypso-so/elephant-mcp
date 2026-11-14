/**
 * Reads a Calypso API response body without assuming it is JSON.
 *
 * Errors from proxies in front of the API arrive as text or HTML; reading them
 * as text keeps the failure message useful instead of a JSON parse error.
 */
export async function readResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Turns a failed response into the one-line message a tool result carries.
 *
 * The API's typed error (`code: message`) is passed through verbatim because
 * the code is what tells the model whether a retry or a different input helps.
 */
export function formatApiError(status: number, body: unknown): string {
  const detail = describeErrorBody(body);
  return detail
    ? `Request failed with status ${status}: ${detail}`
    : `Request failed with status ${status}`;
}

function describeErrorBody(body: unknown): string | null {
  if (typeof body === "string") {
    return body.trim() || null;
  }
  if (!body || typeof body !== "object") {
    return null;
  }
  const { error, message } = body as { error?: unknown; message?: unknown };
  if (error && typeof error === "object") {
    return describeTypedError(error as Record<string, unknown>);
  }
  if (typeof error === "string") return error;
  if (typeof message === "string") return message;
  return null;
}

function describeTypedError(error: Record<string, unknown>): string {
  const code = typeof error.code === "string" ? error.code : "api_error";
  const message =
    typeof error.message === "string" ? error.message : "Request failed.";
  const details =
    error.details && typeof error.details === "object"
      ? ` details=${JSON.stringify(error.details)}`
      : "";
  return `${code}: ${message}${details}`;
}
