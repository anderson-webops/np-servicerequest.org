import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { env, pid } from 'node:process'

const defaultDataDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')

export function getDataRoot() {
  return resolve(env.SUBMISSIONS_DATA_DIR || defaultDataDirectory)
}

export function resolveDataPath(...segments: string[]) {
  const dataRoot = getDataRoot()
  const resolvedPath = resolve(dataRoot, ...segments)

  if (resolvedPath !== dataRoot && !resolvedPath.startsWith(`${dataRoot}${sep}`))
    throw new Error('Refusing to resolve a path outside the configured data directory.')

  return resolvedPath
}

export async function ensurePrivateDirectory(directory: string) {
  await mkdir(directory, { mode: 0o700, recursive: true })
  await chmod(directory, 0o700)
}

export async function writeJsonFile(filePath: string, data: unknown) {
  const directory = dirname(filePath)
  const temporaryPath = `${filePath}.${pid}.${randomBytes(8).toString('hex')}.tmp`
  await ensurePrivateDirectory(directory)

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(data, null, 2)}\n`,
      {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      },
    )
    await rename(temporaryPath, filePath)
  }
  catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function readJsonFile<T>(filePath: string) {
  try {
    const contents = await readFile(filePath, 'utf8')
    return JSON.parse(contents) as T
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null

    throw error
  }
}

export async function listJsonDirectory<T>(directory: string): Promise<T[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))

    const values = await Promise.all(
      files.map(async (fileName) => {
        const value = await readJsonFile<T>(resolve(directory, fileName))
        return value
      }),
    )

    return values.filter(value => value != null) as T[]
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return []

    throw error
  }
}

export async function removeFileIfExists(filePath: string) {
  try {
    await rm(filePath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
}

export async function removePathIfExists(path: string) {
  await rm(path, {
    force: true,
    recursive: true,
  })
}
