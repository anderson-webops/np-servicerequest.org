import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'))
const frontendManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'front-end/package.json'), 'utf8'))
const packages = lock.packages || {}
const expected = Object.entries(frontendManifest.optionalDependencies || {}).filter(([dependency]) =>
  dependency.includes('linux-'),
)

assert.ok(lock.lockfileVersion >= 3, 'package-lock.json must use lockfile version 3 or newer.')
assert.deepEqual(packages['']?.workspaces, ['front-end', 'back-end'], 'The lockfile must contain both workspaces.')
await assert.rejects(
  access(path.join(repositoryRoot, 'back-end/package-lock.json')),
  'The backend must not contain a second deployment lockfile.',
)
assert.ok(expected.length >= 20, 'Expected explicit Linux native package coverage.')

const missing = []
for (const [dependency, expectedVersion] of expected) {
  const match = Object.entries(packages).find(
    ([packagePath]) =>
      packagePath === `node_modules/${dependency}` || packagePath.endsWith(`/node_modules/${dependency}`),
  )

  if (!match || match[1].version !== expectedVersion)
    missing.push(`${dependency}@${expectedVersion}`)
}

assert.deepEqual(missing, [], `Missing or mismatched deploy-target native packages: ${missing.join(', ')}`)
process.stdout.write(`Verified ${expected.length} explicit Linux native lockfile entries.\n`)
