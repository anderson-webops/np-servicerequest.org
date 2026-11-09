import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import process from 'node:process'

const frontend = createRequire(new URL('../front-end/package.json', import.meta.url))
const application = createRequire(new URL('../package.json', import.meta.url))
const preview = createRequire(frontend.resolve('serve/package.json'))
const manifest = frontend('./package.json')
const metadata = JSON.parse(readFileSync(new URL('../front-end/.output/nitro.json', import.meta.url), 'utf8'))
assert.equal(manifest.scripts['preview-https'], 'serve .output/public')
assert.equal(manifest.scripts.preview, 'nuxt preview')
assert.equal(preview('compression/package.json').version, '1.8.2')
assert.equal(preview.resolve('ajv'), application.resolve('ajv'))
assert.equal(preview('ajv/package.json').version, '8.20.0+webops.2')
assert.equal(metadata.commands.preview, 'serve public')
process.stdout.write('Both preview entrypoints select the locked local server without an npx download fallback.\n')
