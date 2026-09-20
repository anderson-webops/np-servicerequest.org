import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { env } from 'node:process'
import test from 'node:test'

import { createApp } from './app.js'

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

test('the immutable page fallback is loaded once instead of read for every request', async () => {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), 'np-static-fallback-'))
  const staticDirectory = resolve(temporaryRoot, 'public')
  const fallbackPath = resolve(staticDirectory, '200.html')
  const revision = 'a'.repeat(40)
  const version = '1.2.43'
  const originalRevision = env.SOURCE_REVISION
  const originalVersion = env.NP_RELEASE_VERSION
  const html = '<!doctype html><html><body><main>Preloaded fallback</main><script>window.__npFallback = true</script></body></html>'
  let server: Server | undefined

  try {
    await mkdir(staticDirectory)
    await writeFile(fallbackPath, html, { encoding: 'utf8', flag: 'wx' })
    await writeFile(
      resolve(staticDirectory, 'release.json'),
      `${JSON.stringify({ revision, version })}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    env.SOURCE_REVISION = revision
    env.NP_RELEASE_VERSION = version

    server = createApp({
      readinessCheck: async () => undefined,
      staticDirectory,
    }).listen(0, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      server?.once('listening', resolve)
      server?.once('error', reject)
    })

    await rm(fallbackPath)
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${address.port}/posts/not-on-disk`
    const response = await fetch(url)
    assert.equal(response.status, 200)
    assert.equal(await response.text(), html)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match(response.headers.get('content-type') || '', /^text\/html/u)

    const head = await fetch(url, { method: 'HEAD' })
    assert.equal(head.status, 200)
    assert.equal(await head.text(), '')
    assert.equal(head.headers.get('cache-control'), 'no-store')
  }
  finally {
    if (server)
      await closeServer(server)
    if (originalRevision == null)
      delete env.SOURCE_REVISION
    else
      env.SOURCE_REVISION = originalRevision
    if (originalVersion == null)
      delete env.NP_RELEASE_VERSION
    else
      env.NP_RELEASE_VERSION = originalVersion
    await rm(temporaryRoot, { force: true, recursive: true })
  }
})
