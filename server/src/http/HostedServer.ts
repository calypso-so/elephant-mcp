import { createRemoteJWKSet } from "jose";

import { ApiKeyStrategy } from "../auth/ApiKeyStrategy.js";
import type { AuthStrategy } from "../auth/AuthStrategy.js";
import { BearerAuthenticator } from "../auth/BearerAuthenticator.js";
import { JwtGrantStrategy } from "../auth/JwtGrantStrategy.js";
import { TokenCipher } from "../auth/TokenCipher.js";
import type { PackageInfo } from "../ElephantMcpServer.js";
import { SlackUsageNotices } from "../notices/SlackUsageNotices.js";
import { NoUsageNotices, type UsageNotices } from "../notices/UsageNotices.js";
import { ToolPresetRegistry } from "../presets/ToolPresetRegistry.js";
import type { HttpConfig } from "./HttpConfig.js";
import { HttpServer } from "./HttpServer.js";
import { KnowledgeInventoryCache } from "./KnowledgeInventoryCache.js";
import { McpEndpoint } from "./McpEndpoint.js";
import { ModelCatalogCache } from "./ModelCatalogCache.js";
import { ProtectedResourceMetadata } from "./ProtectedResourceMetadata.js";
import { RateLimiter } from "./RateLimiter.js";

/**
 * Composition root for the hosted server: wires config into strategies,
 * endpoints and the HTTP router. The only place that knows every piece.
 */
export function composeHostedServer(
  config: HttpConfig,
  packageInfo: PackageInfo,
): HttpServer {
  const metadata = new ProtectedResourceMetadata(
    config.publicBaseUrl,
    config.issuer,
  );
  const metadataUrl = (preset: Parameters<typeof metadata.urlFor>[0]) =>
    config.oauthEnabled ? metadata.urlFor(preset) : undefined;

  const strategies: AuthStrategy[] = [new ApiKeyStrategy()];
  if (config.tokenEncKey) {
    strategies.push(
      new JwtGrantStrategy({
        issuer: config.issuer,
        keys: createRemoteJWKSet(new URL(config.jwksUrl)),
        cipher: new TokenCipher(config.tokenEncKey),
        publicBaseUrl: config.publicBaseUrl,
        resourceMetadataUrl: (preset) => metadata.urlFor(preset) ?? "",
      }),
    );
  }

  const authenticator = new BearerAuthenticator(strategies, metadataUrl);
  const catalogs = new ModelCatalogCache();
  const inventories = new KnowledgeInventoryCache();
  const limiter = new RateLimiter(config.requestsPerMinute);
  // One channel hears every noticed tool call; without a webhook nobody does.
  const notices: UsageNotices = config.slackWebhookUrl
    ? new SlackUsageNotices(config.slackWebhookUrl, {
        version: packageInfo.version,
        publicBaseUrl: config.publicBaseUrl,
      })
    : new NoUsageNotices();
  const endpoints = ToolPresetRegistry.all().map(
    (preset) =>
      new McpEndpoint({
        preset,
        authenticator,
        catalogs,
        inventories,
        limiter,
        apiBaseUrl: config.apiBaseUrl,
        packageInfo,
        notices,
      }),
  );

  return new HttpServer({
    endpoints,
    metadata,
    maxBodyBytes: config.maxBodyBytes,
    version: packageInfo.version,
    openaiChallengeToken: config.openaiChallengeToken,
    log: (line) => console.log(JSON.stringify(line)),
  });
}
