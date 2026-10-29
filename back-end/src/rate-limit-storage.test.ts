import assert from 'node:assert/strict'
import test from 'node:test'

import { consumeRateLimit, RateLimitError, resetRateLimitStateForTests } from './security.js'

test('rate-limit churn cannot evict an active identity quota', () => {
  resetRateLimitStateForTests()

  try {
    const policy = { limit: 1, windowMs: 60_000 }

    for (let index = 0; index < 10_000; index += 1)
      consumeRateLimit(`identity:${index}`, policy)

    consumeRateLimit('overflow:first', { ...policy, overflowIdentity: 'client:first' })
    assert.throws(() => consumeRateLimit('identity:0', policy), RateLimitError)
    assert.throws(
      () => consumeRateLimit('overflow:second', { ...policy, overflowIdentity: 'client:first' }),
      RateLimitError,
    )
    consumeRateLimit('overflow:third', { ...policy, overflowIdentity: 'client:second' })
    assert.throws(
      () => consumeRateLimit('overflow:fourth', { ...policy, overflowIdentity: 'client:second' }),
      RateLimitError,
    )
  }
  finally {
    resetRateLimitStateForTests()
  }
})

test('rate-limit policies reject invalid bounds and per-key window changes', () => {
  resetRateLimitStateForTests()

  try {
    assert.throws(() => consumeRateLimit('invalid', { limit: 0, windowMs: 1 }), TypeError)
    assert.throws(() => consumeRateLimit('invalid', { limit: 1, windowMs: 1, overflowIdentity: '' }), TypeError)
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
