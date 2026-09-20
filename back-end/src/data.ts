import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { access, chmod, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { env, pid } from 'node:process'

const defaultDataDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')

export function getDataRoot() {
  return resolve(env.SUBMISSIONS_DATA_DIR || defaultDataDirectory)
}

export function resolveDataPath(...segments: string[]) {
  if (segments.some(segment => !segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')))
    throw new Error('Data path segments must be non-empty names without separators or dot components.')

  const dataRoot = getDataRoot()
  const resolvedPath = resolve(dataRoot, ...segments)

  return assertDataPath(resolvedPath)
}

function assertDataPath(filePath: string) {
  if (!isAbsolute(filePath))
    throw new Error('Data paths must be absolute.')

  const dataRoot = getDataRoot()
  const resolvedPath = resolve(filePath)
  const relativePath = relative(dataRoot, resolvedPath)

  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath))
    throw new Error('Refusing to resolve a path outside the configured data directory.')

  return resolvedPath
}

async function readExistingPathType(filePath: string) {
  try {
    return await lstat(filePath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null

    throw error
  }
}

async function assertExistingDataPath(filePath: string, expected: 'directory' | 'file') {
  const trustedPath = assertDataPath(filePath)
  const value = await readExistingPathType(trustedPath)

  if (!value)
    return null
  if (value.isSymbolicLink())
    throw new Error('Refusing to follow a symbolic link inside the configured data directory.')
  if (expected === 'directory' ? !value.isDirectory() : !value.isFile())
    throw new Error(`Expected a regular ${expected} inside the configured data directory.`)

  return value
}

export async function ensurePrivateDirectory(directory: string) {
  const dataRoot = getDataRoot()
  const trustedDirectory = assertDataPath(directory)
  await mkdir(dataRoot, { mode: 0o700, recursive: true })
  await assertExistingDataPath(dataRoot, 'directory')
  await chmod(dataRoot, 0o700)

  const relativeDirectory = relative(dataRoot, trustedDirectory)
  let currentDirectory = dataRoot

  for (const segment of relativeDirectory.split(sep).filter(Boolean)) {
    currentDirectory = resolve(currentDirectory, segment)
    await mkdir(currentDirectory, { mode: 0o700 }).catch((error) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw error
    })
    await assertExistingDataPath(currentDirectory, 'directory')
    await chmod(currentDirectory, 0o700)
  }
}

export async function assertDataDirectoryReady() {
  const dataRoot = getDataRoot()
  await ensurePrivateDirectory(dataRoot)
  await access(dataRoot, constants.R_OK | constants.W_OK | constants.X_OK)
}

export async function writeJsonFile(filePath: string, data: unknown) {
  const trustedFilePath = assertDataPath(filePath)
  const directory = dirname(trustedFilePath)
  const temporaryPath = `${trustedFilePath}.${pid}.${randomBytes(8).toString('hex')}.tmp`
  await ensurePrivateDirectory(directory)
  await assertExistingDataPath(trustedFilePath, 'file')

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
    await rename(temporaryPath, trustedFilePath)
  }
  catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

export async function readJsonFile<T>(filePath: string) {
  const trustedFilePath = assertDataPath(filePath)

  try {
    const value = await assertExistingDataPath(trustedFilePath, 'file')
    if (!value)
      return null

    const contents = await readFile(trustedFilePath, 'utf8')
    return JSON.parse(contents) as T
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null

    throw error
  }
}

export async function listJsonDirectory<T>(directory: string): Promise<T[]> {
  const trustedDirectory = assertDataPath(directory)

  try {
    const value = await assertExistingDataPath(trustedDirectory, 'directory')
    if (!value)
      return []

    const entries = await readdir(trustedDirectory, { withFileTypes: true })
    const files = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .sort((left, right) => left.localeCompare(right))

    const values = await Promise.all(
      files.map(async (fileName) => {
        const value = await readJsonFile<T>(resolve(trustedDirectory, fileName))
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
  const trustedFilePath = assertDataPath(filePath)

  try {
    const value = await assertExistingDataPath(trustedFilePath, 'file')
    if (value)
      await rm(trustedFilePath)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
}

export async function removePathIfExists(filePath: string) {
  const trustedPath = assertDataPath(filePath)
  const value = await readExistingPathType(trustedPath)

  if (value?.isSymbolicLink())
    throw new Error('Refusing to remove a symbolic link inside the configured data directory.')
  if (!value)
    return

  await rm(trustedPath, {
    force: true,
    recursive: true,
  })
}
