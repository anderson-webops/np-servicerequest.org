import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const revisionPattern = /^[0-9a-f]{40}$/

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

export function resolveRevision(environment = process.env, git = runGit) {
  const configuredRevision = [
    environment.SOURCE_REVISION,
    environment.COMMIT_REF,
    environment.GITHUB_SHA,
    environment.VERCEL_GIT_COMMIT_SHA,
    environment.CF_PAGES_COMMIT_SHA,
  ].find(value => value?.trim())?.trim().toLowerCase()

  if (configuredRevision) {
    if (!revisionPattern.test(configuredRevision))
      throw new Error('The configured source revision must be a full lowercase Git revision.')

    return configuredRevision
  }

  try {
    const gitRevision = git(['rev-parse', 'HEAD']).toLowerCase()
    if (!revisionPattern.test(gitRevision))
      throw new Error('Git did not return a full lowercase source revision.')

    return gitRevision
  }
  catch (error) {
    if (environment.NODE_ENV === 'production')
      throw new Error('Production release metadata requires a source revision.', { cause: error })

    return 'development'
  }
}

export function resolveReleasedAt(environment = process.env, git = runGit) {
  let rawEpoch = environment.SOURCE_DATE_EPOCH?.trim()

  if (!rawEpoch) {
    try {
      rawEpoch = git(['show', '-s', '--format=%ct', 'HEAD'])
    }
    catch {
      return null
    }
  }

  const sourceEpoch = Number(rawEpoch)
  return Number.isSafeInteger(sourceEpoch) && sourceEpoch > 0
    ? new Date(sourceEpoch * 1000).toISOString()
    : null
}

export async function writeReleaseMetadata(environment = process.env, git = runGit) {
  const packageManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
  const declaredVersion = (environment.NP_RELEASE_VERSION || packageManifest.version).replace(/^v/, '')
  const revision = resolveRevision(environment, git)

  if (declaredVersion !== packageManifest.version)
    throw new Error(`Release version ${declaredVersion} does not match package version ${packageManifest.version}.`)

  const metadata = `${JSON.stringify({
    releasedAt: resolveReleasedAt(environment, git),
    revision,
    version: declaredVersion,
  }, null, 2)}\n`
  const outputDirectories = [
    path.join(repositoryRoot, 'front-end', '.output', 'public'),
    path.join(repositoryRoot, 'back-end', 'dist'),
  ]

  for (const outputDirectory of outputDirectories) {
    await mkdir(outputDirectory, { recursive: true })
    await writeFile(path.join(outputDirectory, 'release.json'), metadata, 'utf8')
  }

  process.stdout.write(`Wrote release metadata for ${declaredVersion} (${revision}).\n`)
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (import.meta.url === invokedPath)
  await writeReleaseMetadata()
