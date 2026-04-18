import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { env } from 'node:process'
import { afterEach, beforeEach, test } from 'node:test'

import { searchServiceDirectory } from './service-directory.js'

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
