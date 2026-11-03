import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { Linter } from 'eslint'
import importX from 'eslint-plugin-import-x'

const moduleUrl = new URL('../node_modules/eslint-plugin-import-x/lib/rules/no-internal-modules.js', import.meta.url)

test('the maintained import rule loads with patched minimatch', async () => {
  const source = await readFile(moduleUrl, 'utf8')
  assert.match(source, /const makeRe = pattern => \(\{ test: value => minimatch\(value, pattern\) \}\)/)

  const linter = new Linter()
  const config = [
    {
      plugins: { 'import-x': importX },
      rules: {
        'import-x/no-internal-modules': [
          'error',
          {
            forbid: ['pkg/internal/**'],
          },
        ],
      },
    },
  ]
  const forbidden = linter.verify('import value from \'pkg/internal/item.js\'', config, { filename: 'example.js' })
  const allowed = linter.verify('import value from \'pkg/public.js\'', config, { filename: 'example.js' })
  assert.equal(forbidden.length, 1)
  assert.equal(forbidden[0].ruleId, 'import-x/no-internal-modules')
  assert.equal(allowed.length, 0)
})
