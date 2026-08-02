import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveReleasedAt, resolveRevision } from './write-release-metadata.mjs'

const revision = '0123456789abcdef0123456789abcdef01234567'

test('uses deployment-provider revision metadata before Git', () => {
  assert.equal(
    resolveRevision({ COMMIT_REF: revision }, () => {
      throw new Error('Git must not run when provider metadata is available.')
    }),
    revision,
  )
})

test('falls back to the checked-out Git revision', () => {
  assert.equal(resolveRevision({}, () => revision), revision)
})

test('fails closed without production revision evidence', () => {
  assert.throws(
    () => resolveRevision({ NODE_ENV: 'production' }, () => {
      throw new Error('No Git checkout is available.')
    }),
    /requires a source revision/u,
  )
})

test('derives a deterministic release timestamp from Git', () => {
  assert.equal(
    resolveReleasedAt({}, () => '1785600000'),
    '2026-08-01T16:00:00.000Z',
  )
})
