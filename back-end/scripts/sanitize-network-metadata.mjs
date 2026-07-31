import { randomBytes } from 'node:crypto'
import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] || '' : ''
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

const configuredDataDirectory = readArgument('--data-dir') || process.env.SUBMISSIONS_DATA_DIR || ''
const apply = process.argv.includes('--apply')

if (!configuredDataDirectory)
  throw new Error('Set SUBMISSIONS_DATA_DIR or pass --data-dir explicitly.')

const dataRoot = resolve(configuredDataDirectory)
const kinds = ['service-request', 'item-request', 'item-lending']
const pendingChanges = []

for (const kind of kinds) {
  const directory = resolve(dataRoot, kind)
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT')
      return []
    throw error
  })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json'))
      continue

    const filePath = resolve(directory, entry.name)
    const record = JSON.parse(await readFile(filePath, 'utf8'))

    if (!record.meta || (!record.meta.ip && !record.meta.userAgent))
      continue

    const nextMeta = { ...record.meta }
    delete nextMeta.ip
    delete nextMeta.userAgent
    const nextRecord = { ...record }

    if (Object.keys(nextMeta).length)
      nextRecord.meta = nextMeta
    else
      delete nextRecord.meta

    pendingChanges.push({ filePath, nextRecord })
  }
}

if (!apply) {
  process.stdout.write(
    `Dry run: ${pendingChanges.length} stored submission file(s) contain legacy IP or user-agent metadata. Re-run with --apply to remove it.\n`,
  )
  process.exit(0)
}

for (const change of pendingChanges)
  await writeJsonAtomically(change.filePath, change.nextRecord)

process.stdout.write(`Removed legacy IP and user-agent metadata from ${pendingChanges.length} submission file(s).\n`)
