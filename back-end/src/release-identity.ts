import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

export interface ReleaseIdentity {
  revision: string
  version: string
}

const revisionPattern = /^[0-9a-f]{40}$/
const versionPattern = /^\d+\.\d+\.\d+$/

function readStaticIdentity(staticDirectory: string | undefined): ReleaseIdentity | null {
  if (!staticDirectory)
    return null

  try {
    const parsed = JSON.parse(readFileSync(resolve(staticDirectory, 'release.json'), 'utf8'))
    if (!revisionPattern.test(parsed.revision) || !versionPattern.test(parsed.version))
      throw new Error('Static release metadata is incomplete or invalid.')

    return {
      revision: parsed.revision,
      version: parsed.version,
    }
  }
  catch (error) {
    if (process.env.NODE_ENV === 'production')
      throw new Error('Production startup requires valid static release metadata.', { cause: error })

    return null
  }
}

export function resolveReleaseIdentity(staticDirectory?: string): ReleaseIdentity {
  const staticIdentity = readStaticIdentity(staticDirectory)
  const configuredRevision = process.env.SOURCE_REVISION?.trim().toLowerCase()
  const configuredVersion = process.env.NP_RELEASE_VERSION?.trim().replace(/^v/, '')
  const revision = configuredRevision || staticIdentity?.revision || 'development'
  const version = configuredVersion || staticIdentity?.version || 'development'

  if (revision !== 'development' && !revisionPattern.test(revision))
    throw new Error('SOURCE_REVISION must be a full lowercase Git revision.')
  if (version !== 'development' && !versionPattern.test(version))
    throw new Error('NP_RELEASE_VERSION must be a semantic version.')
  if (staticIdentity && (revision !== staticIdentity.revision || version !== staticIdentity.version))
    throw new Error('Runtime release identity does not match the built static release metadata.')
  if (process.env.NODE_ENV === 'production' && (revision === 'development' || version === 'development'))
    throw new Error('Production startup requires immutable release identity.')

  return { revision, version }
}
