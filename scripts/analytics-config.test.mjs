import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const canonicalDedicatedDomain = 'analytics.np-servicerequest.org'
const retiredDedicatedDomains = [
  'analytics.np-servicerequests.com',
  'analytics.np-servicerequests.org',
]
const centralDomain = 'analytics.jacobdanderson.net'
const dedicatedWebsiteId = '352127b8-0c06-43d4-bb24-dd309723660d'
const centralWebsiteId = '211385a8-e6ee-4fcf-b06e-f669a4487a82'

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('analytics sends to the requested dedicated and central instances', async () => {
  const [constants, api, netlifyHeaders, readme] = await Promise.all([
    read('front-end/src/constants/index.ts'),
    read('back-end/src/app.ts'),
    read('scripts/write-netlify-headers.mjs'),
    read('README.md'),
  ])

  assert.match(constants, new RegExp(`dedicatedAnalyticsDomain = '${canonicalDedicatedDomain}'`))
  assert.match(constants, new RegExp(`dedicatedAnalyticsWebsiteId = '${dedicatedWebsiteId}'`))
  assert.match(constants, new RegExp(`centralAnalyticsDomain = '${centralDomain.replaceAll('.', '[.]')}'`))
  assert.match(constants, new RegExp(`centralAnalyticsWebsiteId = '${centralWebsiteId}'`))
  assert.match(api, new RegExp(`https://${canonicalDedicatedDomain.replaceAll('.', '[.]')}`))
  assert.match(api, new RegExp(`https://${centralDomain.replaceAll('.', '[.]')}`))
  assert.match(netlifyHeaders, new RegExp(`https://${canonicalDedicatedDomain.replaceAll('.', '[.]')}`))
  assert.match(netlifyHeaders, new RegExp(`https://${centralDomain.replaceAll('.', '[.]')}`))
  assert.match(readme, new RegExp(canonicalDedicatedDomain.replaceAll('.', '[.]')))

  for (const contents of [constants, api, netlifyHeaders, readme]) {
    for (const retiredDedicatedDomain of retiredDedicatedDomains) {
      assert.doesNotMatch(contents, new RegExp(retiredDedicatedDomain.replaceAll('.', '[.]')))
    }
  }
})
