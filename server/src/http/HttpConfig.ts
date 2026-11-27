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
 * | ELEPHANT_SLACK_WEBHOOK_URL | Slack incoming webhook told about each noticed tool call; unset = no notices |
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
    readonly slackWebhookUrl: string | undefined,
  ) {}

  /**
   * `prefix` names the product in the env keys (`ELEPHANT_PUBLIC_BASE_URL`,
   * `WHATSAPP_PUBLIC_BASE_URL`, …) and `publicBaseUrl` is where that product
   * is served when the env does not say. Both default to Elephant's.
   */
  static fromEnv(
    env: NodeJS.ProcessEnv,
    product: { prefix?: string; publicBaseUrl?: string } = {},
  ): HttpConfig {
    const prefix = product.prefix ?? "ELEPHANT";
    const issuer = stripSlash(env.CALYPSO_OAUTH_ISSUER) ?? DEFAULT_OAUTH_ISSUER;
    const apiBaseUrl =
      stripSlash(env.CALYPSO_API_BASE_URL) ?? DEFAULT_CALYPSO_API_BASE_URL;
    if (!apiBaseUrl.endsWith("/v1")) {
      throw new Error("CALYPSO_API_BASE_URL must end in /v1.");
    }
    return new HttpConfig(
      parsePort(env.PORT),
      stripSlash(env[`${prefix}_PUBLIC_BASE_URL`]) ??
        product.publicBaseUrl ??
        DEFAULT_PUBLIC_BASE_URL,
      issuer,
      stripSlash(env[`${prefix}_JWKS_URL`]) ??
        `${issuer}/.well-known/jwks.json`,
      env[`${prefix}_TOKEN_ENC_KEY`]?.trim() || undefined,
      apiBaseUrl,
      DEFAULT_MAX_BODY_BYTES,
      parsePositive(
        env[`${prefix}_REQUESTS_PER_MINUTE`],
        DEFAULT_REQUESTS_PER_MINUTE,
        `${prefix}_REQUESTS_PER_MINUTE`,
      ),
      env[`${prefix}_OPENAI_CHALLENGE_TOKEN`]?.trim() || undefined,
      env[`${prefix}_SLACK_WEBHOOK_URL`]?.trim() || undefined,
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
