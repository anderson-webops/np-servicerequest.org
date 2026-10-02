import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { afterEach, beforeEach, test } from 'node:test'

import { createApp } from './app.js'
import { searchServiceDirectory } from './service-directory.js'
import { readJsonFile, writeJsonFile } from './data.js'

const originalFetch = globalThis.fetch
const originalDataDirectory = env.SUBMISSIONS_DATA_DIR
const originalIdealistApiKey = env.IDEALIST_API_KEY

let dataDirectory = ''

beforeEach(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'np-servicerequest-service-directory-'))
  env.SUBMISSIONS_DATA_DIR = dataDirectory
  delete env.IDEALIST_API_KEY
  globalThis.fetch = originalFetch
})

afterEach(async () => {
  globalThis.fetch = originalFetch

  if (originalDataDirectory)
    env.SUBMISSIONS_DATA_DIR = originalDataDirectory
  else
    delete env.SUBMISSIONS_DATA_DIR

  if (originalIdealistApiKey)
    env.IDEALIST_API_KEY = originalIdealistApiKey
  else
    delete env.IDEALIST_API_KEY

  await rm(dataDirectory, { force: true, recursive: true })
})

test('service directory search reports when Idealist is not configured', async () => {
  const response = await searchServiceDirectory({
    provider: 'idealist',
    query: 'atlanta',
  })

  assert.equal(response.provider.configured, false)
  assert.equal(response.provider.syncState, 'unconfigured')
  assert.equal(response.results.length, 0)
  assert.match(response.provider.message, /not configured/i)
})

test('location-bearing public search accepts a same-origin POST without URL coordinates', async () => {
  const server = createApp().listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const endpoint = `http://127.0.0.1:${address.port}/api/service-directory/search`
    const response = await originalFetch(endpoint, {
      body: JSON.stringify({ lat: '33.749', lng: '-84.388', provider: 'idealist', query: 'food' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const body = await response.json() as { query: { lat: number, lng: number, query: string } }
    assert.equal(body.query.lat, 33.749)
    assert.equal(body.query.lng, -84.388)
    assert.equal(body.query.query, 'food')

    const rejectedResponse = await originalFetch(endpoint, {
      body: JSON.stringify({ lat: '33.749', lng: '-84.388' }),
      headers: { 'content-type': 'application/json', origin: 'https://untrusted.example' },
      method: 'POST',
    })
    assert.equal(rejectedResponse.status, 403)
  }
  finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
})

test('service directory search syncs live Idealist listings into a local index', async () => {
  env.IDEALIST_API_KEY = 'test-idealist-key'

  const updatedAt = new Date().toISOString()
  let requestCount = 0

  globalThis.fetch = async (input) => {
    requestCount += 1
    const url = String(input)

    if (url.includes('/api/v1/listings/volops?')) {
      return new Response(JSON.stringify({
        hasMore: false,
        volops: [
          {
            id: 'idealist-opp-1',
            isPublished: true,
            name: 'Food pantry support',
            updated: updatedAt,
            url: {
              en: 'https://www.idealist.org/en/volunteer-opportunity/idealist-opp-1',
            },
          },
        ],
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }

    if (url.endsWith('/api/v1/listings/volops/idealist-opp-1')) {
      return new Response(JSON.stringify({
        volop: {
          address: {
            city: 'Atlanta',
            country: 'US',
            full: '123 Peachtree St NE, Atlanta, GA, United States',
            latitude: 33.749,
            longitude: -84.388,
            state: 'Georgia',
            stateCode: 'GA',
            zipcode: '30303',
          },
          applyUrl: 'https://example.org/apply',
          areasOfFocus: ['POVERTY', 'FOOD_SECURITY'],
          description: '<p>Help sort food and support pantry operations.</p>',
          functions: ['SUPPORT', 'LOGISTICS'],
          id: 'idealist-opp-1',
          image: {
            medium: 'https://example.org/image.jpg',
          },
          isRecurring: true,
          locationType: 'ONSITE',
          name: 'Food pantry support',
          org: {
            name: 'Atlanta Food Organization',
            url: {
              en: 'https://example.org/org',
            },
          },
          updated: updatedAt,
          url: {
            en: 'https://www.idealist.org/en/volunteer-opportunity/idealist-opp-1',
          },
        },
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }

    throw new Error(`Unexpected fetch URL: ${url}`)
  }

  const response = await searchServiceDirectory({
    lat: 33.749,
    lng: -84.388,
    provider: 'idealist',
    query: 'food pantry',
    radiusMiles: 25,
  })

  assert.equal(response.provider.configured, true)
  assert.equal(response.provider.listingCount, 1)
  assert.equal(response.results.length, 1)
  assert.equal(response.results[0]?.title, 'Food pantry support')
  assert.equal(response.results[0]?.organizationName, 'Atlanta Food Organization')
  assert.equal(response.results[0]?.locationType, 'ONSITE')
  assert.equal(response.results[0]?.isRecurring, true)
  assert.match(response.results[0]?.matchReason || '', /Idealist/i)
  assert.ok(requestCount >= 2)
})

test('empty provider results honor the minimum attempt interval for ordinary and forced searches', async () => {
  env.IDEALIST_API_KEY = 'synthetic-provider-key'
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return new Response(JSON.stringify({ hasMore: false, volops: [] }), { status: 200 })
  }

  const search = () => searchServiceDirectory({ provider: 'idealist', query: 'food' })
  const first = await search()
  assert.equal(first.provider.listingCount, 0)
  await search()
  await searchServiceDirectory({ provider: 'idealist', refresh: true })
  assert.equal(requestCount, 1)

  await writeJsonFile(join(dataDirectory, '_service-directory', 'idealist', 'state.json'), {
    cursorSince: null,
    lastAttemptedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
    lastError: null,
    lastSyncedAt: new Date().toISOString(),
  })
  await Promise.all([search(), search()])
  assert.equal(requestCount, 2)
})

test('failed provider sync backs off and never returns private diagnostics', async () => {
  env.IDEALIST_API_KEY = 'synthetic-provider-key'
  let requestCount = 0
  let failureTime = 0
  const originalConsoleError = console.error
  console.error = () => {}
  globalThis.fetch = async () => {
    requestCount += 1
    await new Promise(resolve => setTimeout(resolve, 20))
    failureTime = Date.now()
    throw new Error('SYNTHETIC_PRIVATE_PROVIDER_DETAIL')
  }

  try {
    const search = () => searchServiceDirectory({ provider: 'idealist' })
    const first = await search()
    assert.equal(first.provider.lastError, 'Live service listings are temporarily unavailable.')
    const statePath = join(dataDirectory, '_service-directory', 'idealist', 'state.json')
    const storedState = await readJsonFile<{ lastAttemptedAt: string, lastError: string }>(statePath)
    assert.ok(Date.parse(storedState?.lastAttemptedAt || '') >= failureTime)
    assert.equal(storedState?.lastError, 'Live service listings are temporarily unavailable.')
    await search()
    await searchServiceDirectory({ provider: 'idealist', refresh: true })
    assert.equal(requestCount, 1)

    await writeJsonFile(join(dataDirectory, '_service-directory', 'idealist', 'state.json'), {
      cursorSince: null,
      lastAttemptedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
      lastError: 'SYNTHETIC_LEGACY_PRIVATE_DETAIL',
      lastSyncedAt: null,
    })
    const backedOff = await search()
    assert.equal(backedOff.provider.lastError, 'Live service listings are temporarily unavailable.')
    assert.equal(requestCount, 1)

    await writeJsonFile(join(dataDirectory, '_service-directory', 'idealist', 'state.json'), {
      cursorSince: null,
      lastAttemptedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      lastError: 'SYNTHETIC_LEGACY_PRIVATE_DETAIL',
      lastSyncedAt: null,
    })
    await search()
    assert.equal(requestCount, 2)
  }
  finally {
    console.error = originalConsoleError
  }
})

test('future-dated provider attempts do not prevent an empty cache from recovering', async () => {
  env.IDEALIST_API_KEY = 'synthetic-provider-key'
  let requestCount = 0
  globalThis.fetch = async () => {
    requestCount += 1
    return new Response(JSON.stringify({ hasMore: false, volops: [] }), { status: 200 })
  }

  await writeJsonFile(join(dataDirectory, '_service-directory', 'idealist', 'state.json'), {
    cursorSince: null,
    lastAttemptedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    lastError: null,
    lastSyncedAt: null,
  })
  await searchServiceDirectory({ provider: 'idealist' })
  assert.equal(requestCount, 1)
})

test('public search route redacts a legacy stored provider error', async () => {
  env.IDEALIST_API_KEY = 'synthetic-provider-key'
  await writeJsonFile(join(dataDirectory, '_service-directory', 'idealist', 'state.json'), {
    cursorSince: null,
    lastAttemptedAt: new Date().toISOString(),
    lastError: 'SYNTHETIC_LEGACY_PRIVATE_DETAIL',
    lastSyncedAt: null,
  })
  globalThis.fetch = async () => {
    throw new Error('Provider request should remain in cooldown')
  }

  const server = createApp().listen(0, '127.0.0.1')
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve)
      server.once('error', reject)
    })
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await originalFetch(`http://127.0.0.1:${address.port}/api/service-directory/search`)
    assert.equal(response.status, 200)
    const body = await response.json() as { provider: { lastError: string } }
    assert.equal(body.provider.lastError, 'Live service listings are temporarily unavailable.')
    assert.equal(JSON.stringify(body).includes('SYNTHETIC_LEGACY_PRIVATE_DETAIL'), false)
  }
  finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve())
    })
  }
})
