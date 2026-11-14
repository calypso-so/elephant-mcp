import assert from "node:assert/strict";
import { test } from "node:test";

import { RateLimiter } from "../dist/http/RateLimiter.js";

test("allows a burst up to capacity, then refuses with a wait time", () => {
  const now = 0;
  const limiter = new RateLimiter(3, 100, () => now);
  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(limiter.take("a"), { allowed: true });
  }
  assert.deepEqual(limiter.take("a"), {
    allowed: false,
    retryAfterSeconds: 20,
  });
});

test("refills evenly over a minute and never above capacity", () => {
  let now = 0;
  const limiter = new RateLimiter(60, 100, () => now);
  for (let i = 0; i < 60; i += 1) limiter.take("a");
  assert.equal(limiter.take("a").allowed, false);

  now = 1_000;
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("a").allowed, false);

  now = 10 * 60_000;
  let allowed = 0;
  while (limiter.take("a").allowed) allowed += 1;
  assert.equal(allowed, 60);
});

test("callers are limited independently", () => {
  const limiter = new RateLimiter(1, 100, () => 0);
  assert.equal(limiter.take("a").allowed, true);
  assert.equal(limiter.take("a").allowed, false);
  assert.equal(limiter.take("b").allowed, true);
});

test("forgets the least recently seen caller beyond maxKeys", () => {
  const limiter = new RateLimiter(1, 2, () => 0);
  limiter.take("a");
  limiter.take("b");
  limiter.take("c");
  // "a" was evicted, so it starts with a full bucket again.
  assert.equal(limiter.take("a").allowed, true);
});

test("rejects a non-positive capacity", () => {
  assert.throws(() => new RateLimiter(0));
});
