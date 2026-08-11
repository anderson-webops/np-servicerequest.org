import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import { after, before, describe, it } from 'node:test'

import { createApp } from './app.js'

async function startApp(readinessCheck: () => Promise<void>) {
  const server = createApp({ readinessCheck }).listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { baseUrl: `http://127.0.0.1:${address.port}`, server }
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
  })
}

describe('monitor probes', () => {
  let baseUrl = ''
  let server: Server

  before(async () => {
    const started = await startApp(async () => undefined)
    baseUrl = started.baseUrl
    server = started.server
  })

  after(async () => closeServer(server))

  it('serves minimal GET and bodyless HEAD probes without credentials', async () => {
    for (const path of ['/healthz', '/readyz']) {
      const response = await fetch(`${baseUrl}${path}`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { ok: true })
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.equal(response.headers.get('set-cookie'), null)
      assert.equal(response.headers.get('location'), null)
      assert.equal(response.headers.get('www-authenticate'), null)

      const head = await fetch(`${baseUrl}${path}`, { method: 'HEAD' })
      assert.equal(head.status, 200)
      assert.equal(await head.text(), '')
      assert.equal(head.headers.get('cache-control'), 'no-store')
    }
  })

  it('returns only a generic readiness failure', async () => {
    const failed = await startApp(async () => {
      throw new Error('private data directory and host')
    })

    try {
      const response = await fetch(`${failed.baseUrl}/readyz`)
      assert.equal(response.status, 503)
      assert.deepEqual(await response.json(), { ok: false })
      const head = await fetch(`${failed.baseUrl}/readyz`, { method: 'HEAD' })
      assert.equal(head.status, 503)
      assert.equal(await head.text(), '')
    }
    finally {
      await closeServer(failed.server)
    }
  })
})
