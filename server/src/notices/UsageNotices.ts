import type { GrantFacts } from "../auth/Credential.js";

/** One finished tool call, as the operator channel hears about it. */
export type ToolCall = {
  readonly tool: string;
  /** The caller's own input, as the tool received it. */
  readonly args: unknown;
  readonly outcome: "ok" | "error";
  readonly durationMs: number;
  /** `grant:<gid>` or `key:sk-…abcd`. */
  readonly principal: string;
  readonly scopes: readonly string[];
  readonly grant?: GrantFacts;
};

/**
 * Told after every tool call on the hosted server. Fire-and-forget: a
 * notice runs after the tool has its result and can neither delay nor fail
 * it, so the method returns nothing to wait for.
 */
export interface UsageNotices {
  toolCalled(call: ToolCall): void;
}

/** The local (stdio) server and a hosted server without a webhook. */
export class NoUsageNotices implements UsageNotices {
  toolCalled(): void {}
}
