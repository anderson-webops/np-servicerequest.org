import { randomBytes, randomUUID } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

const accountIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function normalizeRole(value) {
  return value === 'admin' ? 'admin' : 'member'
}

function normalizeRoleVersion(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}

function safeTerminalText(value, maxLength = 320) {
  return String(value || '(missing)')
    .slice(0, maxLength)
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/gu, character =>
      `\\u${character.codePointAt(0).toString(16).padStart(4, '0')}`)
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`

  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await rename(temporaryPath, filePath)
  }
  catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function revokeAccountSessions(dataRoot, accountId) {
  const sessionDirectory = resolve(dataRoot, '_board', 'sessions')
  let entries

  try {
    entries = await readdir(sessionDirectory, { withFileTypes: true })
  }
  catch (error) {
    if (error.code === 'ENOENT')
      return 0
    throw error
  }

  let revoked = 0
  for (const entry of entries) {
    if (!entry.isFile() || !/^[0-9a-f]{64}\.json$/.test(entry.name))
      continue

    const sessionPath = resolve(sessionDirectory, entry.name)
    let session

    try {
      session = JSON.parse(await readFile(sessionPath, 'utf8'))
    }
    catch {
      continue
    }

    if (session?.userId === accountId) {
      await rm(sessionPath)
      revoked += 1
    }
  }

  return revoked
}

async function withAccountMutationLock(dataRoot, accountId, task) {
  const lockDirectory = resolve(dataRoot, '_board', 'account-locks')
  const lockPath = resolve(lockDirectory, `${accountId}.lock`)
  const deadline = Date.now() + 10_000
  await mkdir(lockDirectory, { mode: 0o700, recursive: true })
  await chmod(lockDirectory, 0o700)

  while (true) {
    try {
      await mkdir(lockPath, { mode: 0o700 })
      break
    }
    catch (error) {
      if (error.code !== 'EEXIST')
        throw error
      if (Date.now() >= deadline) {
        throw new Error(
          `Account mutation lock remained busy: ${lockPath}. Verify that no login or role command is active before removing a stale lock.`,
        )
      }
      await delay(50)
    }
  }

  try {
    return await task()
  }
  finally {
    await rm(lockPath, { force: true, recursive: true })
  }
}

const configuredDataRoot = readArgument('--data-dir') || process.env.SUBMISSIONS_DATA_DIR || ''
const accountId = readArgument('--account-id').toLowerCase()
const confirmAccountId = readArgument('--confirm-account-id').toLowerCase()
const requestedRole = readArgument('--role')
const expectedCurrentRole = readArgument('--from-role')
const expectedCurrentRoleVersionText = readArgument('--from-role-version')
const apply = process.argv.includes('--apply')

if (!configuredDataRoot)
  throw new Error('Set SUBMISSIONS_DATA_DIR or pass --data-dir explicitly.')
if (!isAbsolute(configuredDataRoot))
  throw new Error('The account data directory must be an absolute path.')
if (!accountIdPattern.test(accountId))
  throw new Error('Pass the intended account UUID with --account-id. Email addresses are not verified identities.')
if (!['admin', 'member'].includes(requestedRole))
  throw new Error('Pass --role admin to promote or --role member to demote.')

const dataRoot = resolve(configuredDataRoot)
const accountPath = resolve(dataRoot, '_board', 'accounts', `${accountId}.json`)

async function readSelectedAccount() {
  const account = JSON.parse(await readFile(accountPath, 'utf8'))
  if (account.id !== accountId)
    throw new Error('The selected account file does not match the requested account id.')
  return account
}

const account = await readSelectedAccount()
const previousRole = normalizeRole(account.role)
const currentRoleVersion = normalizeRoleVersion(account.roleVersion)

if (!apply) {
  process.stdout.write([
    `Dry run for account ${accountId}:`,
    `  Display name: ${safeTerminalText(account.displayName, 80)}`,
    `  Created: ${safeTerminalText(account.createdAt, 64)}`,
    `  Claimed email (not identity proof): ${safeTerminalText(account.email)}`,
    `  Role: ${previousRole} (epoch ${currentRoleVersion}) -> ${requestedRole}`,
    `Apply only after confirming the account UUID out of band. Re-run with --apply --confirm-account-id ${accountId} --from-role ${previousRole} --from-role-version ${currentRoleVersion}.`,
    '',
  ].join('\n'))
  process.exit(0)
}

if (confirmAccountId !== accountId)
  throw new Error('--confirm-account-id must exactly match --account-id when applying a role change.')
if (!['admin', 'member'].includes(expectedCurrentRole))
  throw new Error('Pass the dry-run current role with --from-role when applying a role change.')
if (!/^\d+$/.test(expectedCurrentRoleVersionText))
  throw new Error('Pass the dry-run role epoch with --from-role-version when applying a role change.')
const expectedCurrentRoleVersion = Number(expectedCurrentRoleVersionText)
if (!Number.isSafeInteger(expectedCurrentRoleVersion))
  throw new Error('--from-role-version must be a non-negative safe integer.')

await withAccountMutationLock(dataRoot, accountId, async () => {
  const lockedAccount = await readSelectedAccount()
  const lockedPreviousRole = normalizeRole(lockedAccount.role)
  const lockedCurrentRoleVersion = normalizeRoleVersion(lockedAccount.roleVersion)

  if (
    expectedCurrentRole !== lockedPreviousRole
    || expectedCurrentRoleVersion !== lockedCurrentRoleVersion
  ) {
    throw new Error(
      `The account role changed after review; expected ${expectedCurrentRole} epoch ${expectedCurrentRoleVersion}, found ${lockedPreviousRole} epoch ${lockedCurrentRoleVersion}. Run a new dry run.`,
    )
  }

  const changedAt = new Date().toISOString()
  const roleChanged = lockedPreviousRole !== requestedRole
  const nextRoleVersion = roleChanged ? lockedCurrentRoleVersion + 1 : lockedCurrentRoleVersion

  await writeJsonAtomically(accountPath, {
    ...lockedAccount,
    role: requestedRole,
    roleVersion: nextRoleVersion,
    updatedAt: changedAt,
  })

  const revokedSessions = roleChanged
    ? await revokeAccountSessions(dataRoot, accountId)
    : 0
  const auditDirectory = resolve(dataRoot, '_board', 'role-audit')
  await mkdir(auditDirectory, { mode: 0o700, recursive: true })
  await chmod(auditDirectory, 0o700)
  const auditId = randomUUID()
  await writeJsonAtomically(resolve(auditDirectory, `${changedAt.replaceAll(':', '-')}-${auditId}.json`), {
    accountId,
    action: roleChanged ? requestedRole === 'admin' ? 'account_promoted' : 'account_demoted' : 'role_confirmed',
    changedAt,
    id: auditId,
    nextRole: requestedRole,
    nextRoleVersion,
    previousRole: lockedPreviousRole,
    previousRoleVersion: lockedCurrentRoleVersion,
    revokedSessions,
  })

  process.stdout.write(
    `Updated account ${accountId} from ${lockedPreviousRole} to ${requestedRole}; revoked ${revokedSessions} existing session(s).\n`,
  )
})
