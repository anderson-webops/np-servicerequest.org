import { isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

export interface RuntimeConfiguration {
  dataDirectory: string
  host: string
  port: number
  staticDirectory: string | undefined
}

function parseBoolean(value: string | undefined, name: string) {
  if (value == null || value.trim() === '')
    return false

  if (value === 'true')
    return true
  if (value === 'false')
    return false

  throw new Error(`${name} must be exactly true or false.`)
}

function isWithin(parent: string, candidate: string) {
  const relativePath = relative(resolve(parent), resolve(candidate))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

export function resolveRuntimeConfiguration(environment: NodeJS.ProcessEnv): RuntimeConfiguration {
  const production = environment.NODE_ENV === 'production'
  const allowPublicListener = parseBoolean(environment.ALLOW_PUBLIC_LISTENER, 'ALLOW_PUBLIC_LISTENER')
  const allowEphemeralData = parseBoolean(environment.ALLOW_EPHEMERAL_DATA_DIR, 'ALLOW_EPHEMERAL_DATA_DIR')
  const host = environment.HOST?.trim() || '127.0.0.1'
  const port = Number(environment.PORT || 3006)
  const configuredStaticDirectory = environment.STATIC_SITE_DIR?.trim() || ''
  const configuredDataDirectory = environment.SUBMISSIONS_DATA_DIR?.trim() || ''

  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error('PORT must be an integer from 1 through 65535.')

  if (!['127.0.0.1', '::1', 'localhost'].includes(host) && !allowPublicListener)
    throw new Error('HOST must be loopback unless ALLOW_PUBLIC_LISTENER=true is explicitly set.')

  if (production && !configuredStaticDirectory)
    throw new Error('STATIC_SITE_DIR is required in production.')
  if (configuredStaticDirectory && !isAbsolute(configuredStaticDirectory))
    throw new Error('STATIC_SITE_DIR must be an absolute path.')

  if (production && !configuredDataDirectory)
    throw new Error('SUBMISSIONS_DATA_DIR is required in production; temporary storage is not durable.')
  if (configuredDataDirectory && !isAbsolute(configuredDataDirectory))
    throw new Error('SUBMISSIONS_DATA_DIR must be an absolute path.')

  const staticDirectory = configuredStaticDirectory ? resolve(configuredStaticDirectory) : undefined
  const dataDirectory = configuredDataDirectory
    ? resolve(configuredDataDirectory)
    : resolve(tmpdir(), 'np-servicerequest', 'submissions')

  if (staticDirectory && isWithin(staticDirectory, dataDirectory))
    throw new Error('SUBMISSIONS_DATA_DIR must not be stored inside the generated static artifact.')
  const temporaryRoots = [...new Set([tmpdir(), '/tmp', '/private/tmp'])]
  if (production && !allowEphemeralData && temporaryRoots.some(root => isWithin(root, dataDirectory)))
    throw new Error('Production data must not be stored beneath the operating-system temporary directory.')

  return {
    dataDirectory,
    host,
    port,
    staticDirectory,
  }
}
