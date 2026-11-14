const MAX_ATTEMPTS = 40;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 4000;
const BACKOFF_MULTIPLIER = 1.5;

export type PollOutcome<T> = {
  /** The last state read. */
  readonly last: T;
  /** False when attempts ran out before `isSettled` said yes. */
  readonly settled: boolean;
};

/**
 * Reads a state repeatedly, backing off, until it settles or attempts run out.
 *
 * Indexing takes seconds to minutes; the budget here (about two and a half
 * minutes) is what a tool call can reasonably hold open. Running out is an
 * outcome, not an exception, because callers describe it differently.
 */
export async function pollUntilSettled<T>(
  read: () => Promise<T>,
  isSettled: (state: T) => boolean,
): Promise<PollOutcome<T>> {
  let delayMs = INITIAL_DELAY_MS;
  let last = await read();
  for (let attempt = 1; !isSettled(last); attempt += 1) {
    if (attempt >= MAX_ATTEMPTS) return { last, settled: false };
    await sleep(delayMs);
    delayMs = Math.min(MAX_DELAY_MS, Math.round(delayMs * BACKOFF_MULTIPLIER));
    last = await read();
  }
  return { last, settled: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
