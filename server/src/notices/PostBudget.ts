/**
 * How many notices one process may post per minute. Slack webhooks accept
 * about one message a second; past the budget a notice is dropped and
 * counted, and the next one that gets through says how many were lost.
 */
export class PostBudget {
  private windowStart = 0;
  private posted = 0;
  private dropped = 0;

  constructor(
    private readonly perMinute: number,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  /** Null when this post must be dropped; otherwise how many were dropped since the last one that got through. */
  take(): number | null {
    const now = this.clock();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.posted = 0;
    }
    if (this.posted >= this.perMinute) {
      this.dropped += 1;
      return null;
    }
    this.posted += 1;
    const dropped = this.dropped;
    this.dropped = 0;
    return dropped;
  }
}
