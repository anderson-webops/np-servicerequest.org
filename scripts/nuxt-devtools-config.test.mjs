import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

test('Nuxt DevTools respects explicit fixture opt-out and remains development-only', async () => {
  const source = await readFile(new URL('../front-end/nuxt.config.ts', import.meta.url), 'utf8')
  const section = source.split('devtools: {')[1]?.split('}')[0]
  const declaration = section?.split('\n').find(line => line.trimStart().startsWith('enabled:'))
  const expression = declaration?.slice(declaration.indexOf(':') + 1).trim().replace(/,$/u, '')
  assert.ok(expression)
  for (const isDev of [true, false]) {
    for (const enabled of [undefined, 'true', 'false']) {
      const actual = runInNewContext(expression, {
        isDev,
        process: {
          env: { NUXT_DEVTOOLS_ENABLED: enabled },
        },
      })
      assert.equal(actual, isDev && enabled !== 'false')
    }
  }
})
