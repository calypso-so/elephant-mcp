/**
 * The parts of this server that are not about Elephant.
 *
 * Bearer authentication against Calypso's authorization server, a stateless
 * Streamable HTTP endpoint, the tool, group and preset base classes, and the
 * small helpers they lean on. Another Calypso MCP server imports these from
 * `@calypsohq/elephant-mcp-server/kit` and adds only its own tools.
 *
 * Nothing here knows about knowledge, buckets or agents; those stay in the
 * Elephant server proper.
 */

export { ApiKeyStrategy } from "./auth/ApiKeyStrategy.js";
export { AuthChallenge } from "./auth/AuthChallenge.js";
export type { AuthStrategy } from "./auth/AuthStrategy.js";
export { BearerAuthenticator } from "./auth/BearerAuthenticator.js";
export type { Credential, GrantFacts } from "./auth/Credential.js";
export { GrantScopes } from "./auth/GrantScopes.js";
export {
  JwtGrantStrategy,
  type JwtGrantStrategyOptions,
} from "./auth/JwtGrantStrategy.js";
export type { ProtectedResource } from "./auth/ProtectedResource.js";
export { TokenCipher } from "./auth/TokenCipher.js";
export {
  CalypsoApiClient,
  CalypsoApiError,
  type CalypsoRequest,
} from "./calypso/CalypsoApiClient.js";
export type { CalypsoApiConfig } from "./calypso/CalypsoApiConfig.js";
export {
  asRecord,
  numberOrUndefined,
  trimmedString,
} from "./calypso/coerce.js";
export { HttpConfig } from "./http/HttpConfig.js";
export { HttpServer, type HttpServerOptions } from "./http/HttpServer.js";
export { ProtectedResourceMetadata } from "./http/ProtectedResourceMetadata.js";
export { RateLimiter } from "./http/RateLimiter.js";
export {
  type EndpointOutcome,
  StatelessMcpEndpoint,
  type StatelessMcpEndpointOptions,
} from "./http/StatelessMcpEndpoint.js";
export { ToolGroup } from "./presets/ToolGroup.js";
export {
  type InstructionComposer,
  type PresetTool,
  ToolPreset,
  type ToolPresetOptions,
} from "./presets/ToolPreset.js";
export {
  type InputShape,
  McpTool,
  type ToolArgs,
  type ToolOutput,
  type ToolRuntime,
} from "./tools/McpTool.js";
export { ToolLogger } from "./tools/ToolLogger.js";
export { type ToolCallReport, ToolRegistrar } from "./tools/ToolRegistrar.js";
export { ErrorView } from "./views/ErrorView.js";
export { plainText, present } from "./views/viewFields.js";
