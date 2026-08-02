import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveRuntimeConfiguration } from './runtime-config.js'

const productionBase = {
  NODE_ENV: 'production',
  STATIC_SITE_DIR: '/srv/np-servicerequest.org/current/front-end/.output/public',
  SUBMISSIONS_DATA_DIR: '/var/lib/np-servicerequest/data',
}

test('production runtime defaults to a loopback listener and durable storage', () => {
  assert.deepEqual(resolveRuntimeConfiguration(productionBase), {
    dataDirectory: '/var/lib/np-servicerequest/data',
    host: '127.0.0.1',
    port: 3006,
    staticDirectory: '/srv/np-servicerequest.org/current/front-end/.output/public',
  })
})

test('production runtime rejects public listeners and temporary or missing data by default', () => {
  assert.throws(
    () => resolveRuntimeConfiguration({ ...productionBase, HOST: '0.0.0.0' }),
    /HOST must be loopback/u,
  )
  assert.throws(
    () => resolveRuntimeConfiguration({ ...productionBase, SUBMISSIONS_DATA_DIR: '' }),
    /required in production/u,
  )
  assert.throws(
    () => resolveRuntimeConfiguration({ ...productionBase, SUBMISSIONS_DATA_DIR: '/tmp/np-data' }),
    /temporary directory/u,
  )
})

test('explicit test-only escape hatches remain bounded and syntactically strict', () => {
  assert.equal(resolveRuntimeConfiguration({
    ...productionBase,
    ALLOW_EPHEMERAL_DATA_DIR: 'true',
    ALLOW_PUBLIC_LISTENER: 'true',
    HOST: '0.0.0.0',
    SUBMISSIONS_DATA_DIR: '/tmp/np-data',
  }).host, '0.0.0.0')
  assert.throws(
    () => resolveRuntimeConfiguration({ ...productionBase, ALLOW_PUBLIC_LISTENER: 'yes' }),
    /exactly true or false/u,
  )
})
