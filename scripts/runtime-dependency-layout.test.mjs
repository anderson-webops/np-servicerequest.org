import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'

const root = createRequire(new URL('../package.json', import.meta.url))
const backend = createRequire(new URL('../back-end/package.json', import.meta.url))
const c12 = createRequire(root.resolve('c12'))
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const backendManifest = JSON.parse(readFileSync(new URL('../back-end/package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'))

test('the root-only runtime keeps the API dotenv version at its declared artifact path', () => {
  assert.equal(manifest.dependencies?.dotenv, backendManifest.dependencies.dotenv)
  assert.equal(backend.resolve('dotenv/config'), root.resolve('dotenv/config'))
  assert.equal(lock.packages['node_modules/dotenv'].version, backend('dotenv/package.json').version)
  assert.notEqual(lock.packages['node_modules/dotenv'].dev, true)
  assert.equal(lock.packages['back-end/node_modules/dotenv'], undefined)
})

test('the build configuration retains its separate supported dotenv major', () => {
  assert.match(c12('dotenv/package.json').version, /^17\./u)
  assert.match(backend('dotenv/package.json').version, /^18\./u)
  assert.notEqual(c12.resolve('dotenv/config'), backend.resolve('dotenv/config'))
})
