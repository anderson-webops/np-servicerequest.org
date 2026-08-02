import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { resolveReleaseIdentity } from './release-identity.js'

const revision = '0123456789abcdef0123456789abcdef01234567'

function withEnvironment(values: Record<string, string | undefined>, callback: () => void) {
  const original = new Map(Object.keys(values).map(key => [key, process.env[key]]))
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value
    }
    callback()
  }
  finally {
    for (const [key, value] of original) {
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value
    }
  }
}

test('uses built release metadata for production health identity', () => {
  const directory = mkdtempSync(join(tmpdir(), 'np-release-'))
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'release.json'), JSON.stringify({ revision, version: '1.2.38' }))

  try {
    withEnvironment({
      NODE_ENV: 'production',
      NP_RELEASE_VERSION: undefined,
      SOURCE_REVISION: undefined,
    }, () => {
      assert.deepEqual(resolveReleaseIdentity(directory), { revision, version: '1.2.38' })
    })
  }
  finally {
    rmSync(directory, { recursive: true })
  }
})

test('rejects runtime identity that disagrees with the built site', () => {
  const directory = mkdtempSync(join(tmpdir(), 'np-release-'))
  writeFileSync(join(directory, 'release.json'), JSON.stringify({ revision, version: '1.2.38' }))

  try {
    withEnvironment({
      NODE_ENV: 'production',
      NP_RELEASE_VERSION: '1.2.38',
      SOURCE_REVISION: 'fedcba9876543210fedcba9876543210fedcba98',
    }, () => {
      assert.throws(() => resolveReleaseIdentity(directory), /does not match/u)
    })
  }
  finally {
    rmSync(directory, { recursive: true })
  }
})
