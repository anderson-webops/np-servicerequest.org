import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function normalizeEmail(value) {
  return value.trim().toLowerCase()
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

const dataRoot = resolve(readArgument('--data-dir') || process.env.SUBMISSIONS_DATA_DIR || '')
const email = normalizeEmail(readArgument('--email'))
const role = readArgument('--role')
const apply = process.argv.includes('--apply')

if (!readArgument('--data-dir') && !process.env.SUBMISSIONS_DATA_DIR)
  throw new Error('Set SUBMISSIONS_DATA_DIR or pass --data-dir explicitly.')

if (!email || !/^[^@]+@[^@]+\.[^@]+$/.test(email))
  throw new Error('Pass a valid account email with --email.')

if (!['admin', 'member'].includes(role))
  throw new Error('Pass --role admin to promote or --role member to demote.')

const accountDirectory = resolve(dataRoot, '_board', 'accounts')
const accountFiles = (await readdir(accountDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  .map(entry => resolve(accountDirectory, entry.name))
const matches = []

for (const filePath of accountFiles) {
  const account = JSON.parse(await readFile(filePath, 'utf8'))

  if (normalizeEmail(account.emailNormalized || account.email || '') === email)
    matches.push({ account, filePath })
}

if (matches.length !== 1)
  throw new Error(`Expected exactly one account for that email; found ${matches.length}.`)

const [{ account, filePath }] = matches
const previousRole = account.role === 'admin' ? 'admin' : 'member'

if (!apply) {
  process.stdout.write(
    `Dry run: ${email} would change from ${previousRole} to ${role}. Re-run with --apply after verifying the account owner.\n`,
  )
  process.exit(0)
}

const changedAt = new Date().toISOString()
await writeJsonAtomically(filePath, {
  ...account,
  role,
  updatedAt: changedAt,
})

const auditDirectory = resolve(dataRoot, '_board', 'role-audit')
await mkdir(auditDirectory, { mode: 0o700, recursive: true })
const auditId = randomUUID()
await writeJsonAtomically(resolve(auditDirectory, `${changedAt.replaceAll(':', '-')}-${auditId}.json`), {
  accountId: account.id,
  action: previousRole === role ? 'role_confirmed' : role === 'admin' ? 'account_promoted' : 'account_demoted',
  changedAt,
  emailHash: createHash('sha256').update(email).digest('hex'),
  id: auditId,
  nextRole: role,
  previousRole,
})

process.stdout.write(`Updated ${email} from ${previousRole} to ${role}. Existing sessions observe the change immediately.\n`)
