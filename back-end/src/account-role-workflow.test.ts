import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const execFileAsync = promisify(execFile)
const scriptPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/manage-account-role.mjs',
)

test('account promotion and demotion are explicit, dry-run-first, and audited without raw email', async () => {
  const dataRoot = await mkdtemp(join(tmpdir(), 'np-sr-role-workflow-'))
  const accountDirectory = join(dataRoot, '_board', 'accounts')
  const accountId = randomUUID()
  const email = 'role-workflow@example.com'
  const accountPath = join(accountDirectory, `${accountId}.json`)

  try {
    await mkdir(accountDirectory, { recursive: true })
    await writeFile(accountPath, `${JSON.stringify({
      createdAt: '2026-07-29T00:00:00.000Z',
      displayName: 'Role Workflow',
      email,
      emailNormalized: email,
      id: accountId,
      passwordAlgorithm: 'scrypt-v2',
      passwordHash: 'not-used-by-this-test',
      passwordSalt: 'not-used-by-this-test',
      role: 'member',
      updatedAt: '2026-07-29T00:00:00.000Z',
    }, null, 2)}\n`)

    const dryRun = await execFileAsync(process.execPath, [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--email',
      email,
      '--role',
      'admin',
    ])
    assert.match(dryRun.stdout, /Dry run:/)
    assert.equal(JSON.parse(await readFile(accountPath, 'utf8')).role, 'member')

    await execFileAsync(process.execPath, [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--email',
      email,
      '--role',
      'admin',
      '--apply',
    ])
    assert.equal(JSON.parse(await readFile(accountPath, 'utf8')).role, 'admin')

    await execFileAsync(process.execPath, [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--email',
      email,
      '--role',
      'member',
      '--apply',
    ])
    assert.equal(JSON.parse(await readFile(accountPath, 'utf8')).role, 'member')

    const auditDirectory = join(dataRoot, '_board', 'role-audit')
    const auditFiles = await readdir(auditDirectory)
    assert.equal(auditFiles.length, 2)

    const auditRecords = await Promise.all(
      auditFiles.map(async fileName =>
        readFile(join(auditDirectory, fileName), 'utf8')),
    )
    assert.equal(auditRecords.some(record => record.includes(email)), false)
    assert.equal(auditRecords.some(record => record.includes('account_promoted')), true)
    assert.equal(auditRecords.some(record => record.includes('account_demoted')), true)
  }
  finally {
    await rm(dataRoot, { force: true, recursive: true })
  }
})
