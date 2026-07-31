import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
const declaredVersion = (process.env.NP_RELEASE_VERSION || packageManifest.version).replace(/^v/, '')
const revision = process.env.SOURCE_REVISION || 'development'

if (declaredVersion !== packageManifest.version)
  throw new Error(`Release version ${declaredVersion} does not match package version ${packageManifest.version}.`)

if (revision !== 'development' && !/^[0-9a-f]{40}$/.test(revision))
  throw new Error('SOURCE_REVISION must be a full 40-character Git revision.')

const sourceEpoch = Number(process.env.SOURCE_DATE_EPOCH || '')
const releasedAt = Number.isSafeInteger(sourceEpoch) && sourceEpoch > 0
  ? new Date(sourceEpoch * 1000).toISOString()
  : null
const outputDirectory = path.join(repositoryRoot, 'front-end', '.output', 'public')
await mkdir(outputDirectory, { recursive: true })
await writeFile(
  path.join(outputDirectory, 'release.json'),
  `${JSON.stringify({
    releasedAt,
    revision,
    version: declaredVersion,
  }, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`Wrote release metadata for ${declaredVersion} (${revision}).\n`)
