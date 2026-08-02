import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
  const sessionDirectory = join(dataRoot, '_board', 'sessions')
  const sessionToken = 'role-workflow-session'
  const sessionPath = join(sessionDirectory, `${createHash('sha256').update(sessionToken).digest('hex')}.json`)

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
      roleVersion: 0,
      updatedAt: '2026-07-29T00:00:00.000Z',
    }, null, 2)}\n`)
    await mkdir(sessionDirectory, { recursive: true })
    await writeFile(sessionPath, `${JSON.stringify({
      createdAt: '2026-07-29T00:00:00.000Z',
      expiresAt: '2099-07-29T00:00:00.000Z',
      roleVersion: 0,
      tokenHash: createHash('sha256').update(sessionToken).digest('hex'),
      userId: accountId,
    }, null, 2)}\n`)

    const dryRun = await execFileAsync(process.execPath, [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--account-id',
      accountId,
      '--role',
      'admin',
    ])
    assert.match(dryRun.stdout, /Dry run for account/u)
    assert.match(dryRun.stdout, /Role: member \(epoch 0\) -> admin/u)
    assert.equal(JSON.parse(await readFile(accountPath, 'utf8')).role, 'member')

    const promotionArguments = [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--account-id',
      accountId,
      '--role',
      'admin',
      '--apply',
      '--confirm-account-id',
      accountId,
      '--from-role',
      'member',
      '--from-role-version',
      '0',
    ]
    const promotionAttempts = await Promise.allSettled([
      execFileAsync(process.execPath, promotionArguments),
      execFileAsync(process.execPath, promotionArguments),
    ])
    assert.equal(promotionAttempts.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal(promotionAttempts.filter(result => result.status === 'rejected').length, 1)
    const promotedAccount = JSON.parse(await readFile(accountPath, 'utf8'))
    assert.equal(promotedAccount.role, 'admin')
    assert.equal(promotedAccount.roleVersion, 1)
    await assert.rejects(readFile(sessionPath, 'utf8'), /ENOENT/u)

    await execFileAsync(process.execPath, [
      scriptPath,
      '--data-dir',
      dataRoot,
      '--account-id',
      accountId,
      '--role',
      'member',
      '--apply',
      '--confirm-account-id',
      accountId,
      '--from-role',
      'admin',
      '--from-role-version',
      '1',
    ])
    const demotedAccount = JSON.parse(await readFile(accountPath, 'utf8'))
    assert.equal(demotedAccount.role, 'member')
    assert.equal(demotedAccount.roleVersion, 2)

    const auditDirectory = join(dataRoot, '_board', 'role-audit')
    const auditFiles = await readdir(auditDirectory)
    assert.equal(auditFiles.length, 2)

    const auditRecords = await Promise.all(
      auditFiles.map(async fileName =>
        readFile(join(auditDirectory, fileName), 'utf8')),
    )
    assert.equal(auditRecords.some(record => record.includes(email)), false)
    assert.equal(auditRecords.every(record => record.includes(accountId)), true)
    assert.equal(auditRecords.some(record => record.includes('emailHash')), false)
    assert.equal(auditRecords.some(record => record.includes('account_promoted')), true)
    assert.equal(auditRecords.some(record => record.includes('account_demoted')), true)
  }
  finally {
    await rm(dataRoot, { force: true, recursive: true })
  }
})
