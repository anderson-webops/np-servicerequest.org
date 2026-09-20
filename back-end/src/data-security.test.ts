import assert from 'node:assert/strict'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { env } from 'node:process'
import test from 'node:test'

import { readJsonFile, resolveDataPath, writeJsonFile } from './data.js'

test('data helpers confine files to private non-symlinked storage', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'np-data-security-'))
  const originalDataDirectory = env.SUBMISSIONS_DATA_DIR
  const dataDirectory = resolve(temporaryRoot, 'data')

  env.SUBMISSIONS_DATA_DIR = dataDirectory

  try {
    assert.throws(() => resolveDataPath('..'), /segments/u)
    assert.throws(() => resolveDataPath('../escape'), /segments/u)
    assert.throws(() => resolveDataPath('nested/file.json'), /segments/u)
    await assert.rejects(
      writeJsonFile(resolve(temporaryRoot, 'outside.json'), { unsafe: true }),
      /outside/u,
    )

    const recordPath = resolveDataPath('records', 'one.json')
    await writeJsonFile(recordPath, { ok: true })
    assert.deepEqual(await readJsonFile(recordPath), { ok: true })
    assert.equal((await lstat(dataDirectory)).mode & 0o777, 0o700)
    assert.equal((await lstat(resolve(dataDirectory, 'records'))).mode & 0o777, 0o700)
    assert.equal((await lstat(recordPath)).mode & 0o777, 0o600)

    const outsideDirectory = resolve(temporaryRoot, 'outside')
    await mkdir(outsideDirectory)
    await symlink(outsideDirectory, resolve(dataDirectory, 'linked'))
    await assert.rejects(
      writeJsonFile(resolve(dataDirectory, 'linked', 'escape.json'), { unsafe: true }),
      /symbolic link/u,
    )
    await assert.rejects(readFile(resolve(outsideDirectory, 'escape.json')), { code: 'ENOENT' })
  }
  finally {
    if (originalDataDirectory == null)
      delete env.SUBMISSIONS_DATA_DIR
    else
      env.SUBMISSIONS_DATA_DIR = originalDataDirectory
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
