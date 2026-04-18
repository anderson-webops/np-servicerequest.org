import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { env } from 'node:process'

const defaultDataDirectory = resolve(tmpdir(), 'np-servicerequest', 'submissions')

export function getDataRoot() {
  return env.SUBMISSIONS_DATA_DIR || defaultDataDirectory
}

export function resolveDataPath(...segments: string[]) {
  return resolve(getDataRoot(), ...segments)
}

export async function writeJsonFile(filePath: string, data: unknown) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
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
