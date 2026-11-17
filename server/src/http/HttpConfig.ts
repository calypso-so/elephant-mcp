import { DEFAULT_CALYPSO_API_BASE_URL } from "../calypso/CalypsoApiConfig.js";

export const DEFAULT_PUBLIC_BASE_URL = "https://mcp.calypso.so";
export const DEFAULT_OAUTH_ISSUER = "https://login.calypso.so";
const DEFAULT_PORT = 8080;
const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024;
const DEFAULT_REQUESTS_PER_MINUTE = 120;

/**
 * Settings for the Elephant server, read once at startup.
 *
 * | Env                        | Meaning                                              |
 * |----------------------------|------------------------------------------------------|
 * | PORT                       | listen port (Render sets it)                         |
 * | ELEPHANT_PUBLIC_BASE_URL   | public origin; `aud` = this + preset path            |
 * | CALYPSO_OAUTH_ISSUER       | authorization server issuer                          |
 * | ELEPHANT_JWKS_URL          | override for the issuer's JWKS URL                   |
 * | ELEPHANT_TOKEN_ENC_KEY     | 32-byte base64 key for the `ek` claim; unset = OAuth off, API keys only |
 * | CALYPSO_API_BASE_URL       | Calypso API base URL (…/v1)                          |
 * | ELEPHANT_REQUESTS_PER_MINUTE | per-caller request budget (default 120)            |
 * | ELEPHANT_OPENAI_CHALLENGE_TOKEN | OpenAI plugin portal domain-verification token (public) |
 */
export class HttpConfig {
  private constructor(
    readonly port: number,
    readonly publicBaseUrl: string,
    readonly issuer: string,
    readonly jwksUrl: string,
    readonly tokenEncKey: string | undefined,
    readonly apiBaseUrl: string,
    readonly maxBodyBytes: number,
    readonly requestsPerMinute: number,
    readonly openaiChallengeToken: string | undefined,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv): HttpConfig {
    const issuer = stripSlash(env.CALYPSO_OAUTH_ISSUER) ?? DEFAULT_OAUTH_ISSUER;
    const apiBaseUrl =
      stripSlash(env.CALYPSO_API_BASE_URL) ?? DEFAULT_CALYPSO_API_BASE_URL;
    if (!apiBaseUrl.endsWith("/v1")) {
      throw new Error("CALYPSO_API_BASE_URL must end in /v1.");
    }
    return new HttpConfig(
      parsePort(env.PORT),
      stripSlash(env.ELEPHANT_PUBLIC_BASE_URL) ?? DEFAULT_PUBLIC_BASE_URL,
      issuer,
      stripSlash(env.ELEPHANT_JWKS_URL) ?? `${issuer}/.well-known/jwks.json`,
      env.ELEPHANT_TOKEN_ENC_KEY?.trim() || undefined,
      apiBaseUrl,
      DEFAULT_MAX_BODY_BYTES,
      parsePositive(
        env.ELEPHANT_REQUESTS_PER_MINUTE,
        DEFAULT_REQUESTS_PER_MINUTE,
        "ELEPHANT_REQUESTS_PER_MINUTE",
      ),
      env.ELEPHANT_OPENAI_CHALLENGE_TOKEN?.trim() || undefined,
    );
  }

  get oauthEnabled(): boolean {
    return Boolean(this.tokenEncKey);
  }
}

function stripSlash(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : undefined;
}

function parsePort(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

function parsePositive(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return parsed;
}
