import { PostBudget } from "./PostBudget.js";
import {
  buildUsageMessage,
  type ServerIdentity,
  type SlackMessage,
} from "./UsageMessage.js";
import type { ToolCall, UsageNotices } from "./UsageNotices.js";

export const USAGE_POSTS_PER_MINUTE = 60;
export const USAGE_POST_TIMEOUT_MS = 3000;

export type UsagePost = (
  webhookUrl: string,
  message: SlackMessage,
  timeoutMs: number,
) => Promise<unknown>;

const postWithFetch: UsagePost = async (webhookUrl, message, timeoutMs) => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Slack answered ${response.status}`);
};

/**
 * Posts each noticed tool call to a Slack incoming webhook. The server is a
 * long-lived process, so the post runs after the tool call has returned and
 * nothing waits for it; a failure is one warning line in the server log.
 */
export class SlackUsageNotices implements UsageNotices {
  constructor(
    private readonly webhookUrl: string,
    private readonly server: ServerIdentity,
    private readonly budget: PostBudget = new PostBudget(
      USAGE_POSTS_PER_MINUTE,
    ),
    private readonly post: UsagePost = postWithFetch,
    private readonly warn: (line: string) => void = (line) =>
      console.warn(line),
  ) {}

  toolCalled(call: ToolCall): void {
    void this.send(call);
  }

  /** Resolves once the post settled; tests await it, the server never does. */
  async send(call: ToolCall): Promise<void> {
    const dropped = this.budget.take();
    if (dropped === null) return;
    const message = buildUsageMessage(call, this.server, dropped);
    if (!message) return;
    try {
      await this.post(this.webhookUrl, message, USAGE_POST_TIMEOUT_MS);
    } catch (error) {
      this.warn(
        JSON.stringify({
          level: "warning",
          message: "[usage-notices] slack post failed",
          tool: call.tool,
          principal: call.principal,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
