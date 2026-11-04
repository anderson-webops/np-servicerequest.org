import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

test('one-shot TypeScript commands work with Storage-local temporary paths beyond Unix socket limits', async (context) => {
  const backend = JSON.parse(await readFile(path.join(root, 'back-end/package.json'), 'utf8'))
  assert.match(backend.scripts.test, /^node --import tsx --test /u)
  assert.match(backend.scripts['server:once'], /^node --import tsx -r dotenv\/config /u)
  const scratch = path.join(root, '.ai-work/runs')
  await mkdir(scratch, { recursive: true })
  const directory = await mkdtemp(path.join(scratch, 'typescript-loader-'))
  context.after(() => rm(directory, { recursive: true }))
  const temporaryDirectory = path.join(directory, 'long-temporary-path-'.repeat(8))
  await mkdir(temporaryDirectory)
  const fixture = path.join(directory, 'fixture.ts')
  await writeFile(fixture, 'enum Result { Passed = "passed" }; const result: Result = Result.Passed; console.log(result)\n')
  const output = execFileSync(process.execPath, ['--import', 'tsx', fixture], {
    cwd: path.join(root, 'back-end'),
    env: { ...process.env, TMPDIR: temporaryDirectory },
    encoding: 'utf8',
    timeout: 30_000,
  })
  assert.equal(output.trim(), 'passed')
})
