import assert from 'node:assert/strict'
import test from 'node:test'

import { consumeRateLimit, RateLimitError, resetRateLimitStateForTests } from './security.js'

test('rate-limit churn cannot evict an active identity quota', () => {
  resetRateLimitStateForTests()

  try {
    const policy = { limit: 1, windowMs: 60_000 }

    for (let index = 0; index < 10_000; index += 1)
      consumeRateLimit(`identity:${index}`, policy)

    consumeRateLimit('overflow:first', policy)
    assert.throws(() => consumeRateLimit('identity:0', policy), RateLimitError)
    assert.throws(() => consumeRateLimit('overflow:second', policy), RateLimitError)
  }
  finally {
    resetRateLimitStateForTests()
  }
})

test('rate-limit policies reject invalid bounds and per-key window changes', () => {
  resetRateLimitStateForTests()

  try {
    assert.throws(() => consumeRateLimit('invalid', { limit: 0, windowMs: 1 }), TypeError)
    consumeRateLimit('stable-policy', { limit: 2, windowMs: 1_000 })
    assert.throws(
      () => consumeRateLimit('stable-policy', { limit: 2, windowMs: 2_000 }),
      /cannot change/u,
    )
  }
  finally {
    resetRateLimitStateForTests()
  }
})
