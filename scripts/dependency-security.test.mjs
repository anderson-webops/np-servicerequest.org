import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import Tinypool from 'tinypool'

const requireBackend = createRequire(new URL('../back-end/package.json', import.meta.url))

test('release audits include root tooling as well as application workspaces', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  for (const name of ['audit', 'audit:production']) {
    assert.match(manifest.scripts[name], /--workspaces\b/)
    assert.match(manifest.scripts[name], /--include-workspace-root\b/)
    assert.match(manifest.scripts[name], /--audit-level=low\b/)
  }
})

test('mail generation preserves recipient domains across nested comments and quoted angle brackets', async () => {
  const nodemailer = requireBackend('nodemailer')
  const transporter = nodemailer.createTransport({ jsonTransport: true })
  for (const [recipient, expected] of [
    ['Recipient <recipient@approved.test>', 'recipient@approved.test'],
    ['Recipient (x(y) <intruder@attacker.test>) <recipient@approved.test>', 'recipient@approved.test'],
    ['<"name@attacker.test>"@approved.test>', /@approved\.test$/],
  ]) {
    const result = await transporter.sendMail({
      disableFileAccess: true,
      disableUrlAccess: true,
      from: 'board@example.test',
      to: recipient,
      subject: 'Board notification',
      text: 'A synthetic board notification.',
    })
    assert.equal(result.envelope.to.length, 1)
    if (expected instanceof RegExp)
      assert.match(result.envelope.to[0], expected)
    else
      assert.equal(result.envelope.to[0], expected)
    const message = JSON.parse(result.message)
    assert.equal(message.text, 'A synthetic board notification.')
    assert.equal(message.subject, 'Board notification')
  }
})

for (const runtime of ['worker_threads', 'child_process']) {
  test(`formatter pool preserves ${runtime} jobs and ignores inherited run filenames`, async () => {
    const pool = new Tinypool({
      filename: fileURLToPath(new URL('./fixtures/dependency-worker.mjs', import.meta.url)),
      minThreads: 1,
      maxThreads: 1,
      execArgv: [],
      runtime,
    })
    try {
      assert.equal(await pool.run(21), 42)
      const options = Object.create({ filename: '/nonexistent-inherited-worker.mjs' })
      options.signal = new AbortController().signal
      assert.equal(await pool.run(22, options), 44)
    }
    finally {
      await pool.destroy()
    }
  })
}
