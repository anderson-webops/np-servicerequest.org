import assert from 'node:assert/strict'
import process from 'node:process'

const baseUrl = new URL(process.env.PRODUCTION_BASE_URL || 'https://np-servicerequest.org')
const expectedVersion = process.env.EXPECTED_VERSION?.replace(/^v/, '') || ''
const expectedRevision = process.env.EXPECTED_REVISION || ''
const verifyAdminKey = process.env.VERIFY_ADMIN_KEY || ''
const requestOrigin = process.env.PRODUCTION_REQUEST_ORIGIN || baseUrl.origin

assert.match(expectedVersion, /^\d+\.\d+\.\d+$/, 'EXPECTED_VERSION is required.')
assert.match(expectedRevision, /^[0-9a-f]{40}$/, 'EXPECTED_REVISION must be a full Git revision.')

async function fetchWithTimeout(path, init) {
  return fetch(new URL(path, baseUrl), {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
}

const [homeResponse, healthResponse, readinessResponse, releaseResponse] = await Promise.all([
  fetchWithTimeout('/'),
  fetchWithTimeout('/api/health'),
  fetchWithTimeout('/api/readyz'),
  fetchWithTimeout('/release.json'),
])

assert.equal(homeResponse.status, 200)
assert.equal(healthResponse.status, 200)
assert.equal(readinessResponse.status, 200)
assert.equal(releaseResponse.status, 200)

const health = await healthResponse.json()
const readiness = await readinessResponse.json()
const release = await releaseResponse.json()
for (const identity of [health, readiness, release]) {
  assert.equal(identity.version, expectedVersion)
  assert.equal(identity.revision, expectedRevision)
}
assert.equal(readiness.status, 'ready')
assert.deepEqual(readiness.dependencies, [{ name: 'submissions-data', status: 'ready' }])

const csp = homeResponse.headers.get('content-security-policy') || ''
assert.match(csp, /default-src 'self'/)
assert.match(csp, /frame-ancestors 'none'/)
assert.doesNotMatch(csp, /unsafe-eval/)
const scriptSourceDirective = csp
  .split(';')
  .map(directive => directive.trim())
  .find(directive => directive.startsWith('script-src ')) || ''
assert.match(scriptSourceDirective, /'sha256-/)
assert.doesNotMatch(scriptSourceDirective, /'unsafe-inline'/)
assert.match(homeResponse.headers.get('strict-transport-security') || '', /max-age=/)
assert.equal(homeResponse.headers.get('x-content-type-options'), 'nosniff')
assert.equal(homeResponse.headers.get('x-frame-options'), 'DENY')

const disallowedOriginResponse = await fetchWithTimeout('/api/board/bootstrap', {
  headers: {
    origin: 'https://attacker.invalid',
  },
})
assert.equal(disallowedOriginResponse.status, 200)
assert.equal(disallowedOriginResponse.headers.get('access-control-allow-origin'), null)

const disallowedWriteResponse = await fetchWithTimeout('/api/admin/session', {
  body: JSON.stringify({
    adminKey: 'not-a-real-key',
  }),
  headers: {
    'content-type': 'application/json',
    'origin': 'https://attacker.invalid',
    'sec-fetch-site': 'cross-site',
  },
  method: 'POST',
})
assert.equal(disallowedWriteResponse.status, 403)

const pathStyleResponse = await fetchWithTimeout(
  '/posts/00000000-0000-4000-8000-000000000000',
)
assert.equal(pathStyleResponse.status, 200)
for (const hiddenPath of ['/.env', '/%2eenv', '/.git/config', '/%2egit/config']) {
  const hiddenPathResponse = await fetchWithTimeout(hiddenPath)
  assert.equal(hiddenPathResponse.status, 404)
  assert.doesNotMatch(await hiddenPathResponse.text(), /ANTI_BOT|BOARD_ADMIN|SMTP_/u)
}

if (verifyAdminKey) {
  assert.ok(verifyAdminKey.length >= 32, 'VERIFY_ADMIN_KEY must contain at least 32 characters.')

  const adminLoginResponse = await fetchWithTimeout('/api/admin/session', {
    body: JSON.stringify({
      adminKey: verifyAdminKey,
    }),
    headers: {
      'content-type': 'application/json',
      'origin': requestOrigin,
      'sec-fetch-site': 'same-origin',
    },
    method: 'POST',
  })
  assert.equal(adminLoginResponse.status, 200)

  const setCookie = adminLoginResponse.headers.get('set-cookie') || ''
  assert.match(setCookie, /^__Host-np_sr_admin_session=/)
  assert.match(setCookie, /; HttpOnly(?:;|$)/i)
  assert.match(setCookie, /; SameSite=Strict(?:;|$)/i)
  assert.match(setCookie, /; Secure(?:;|$)/i)
  const adminCookie = setCookie.split(';')[0]

  const activeSessionResponse = await fetchWithTimeout('/api/admin/session', {
    headers: {
      cookie: adminCookie,
    },
  })
  assert.equal(activeSessionResponse.status, 200)

  const logoutResponse = await fetchWithTimeout('/api/admin/session', {
    headers: {
      'cookie': adminCookie,
      'origin': requestOrigin,
      'sec-fetch-site': 'same-origin',
    },
    method: 'DELETE',
  })
  assert.equal(logoutResponse.status, 200)
  assert.match(logoutResponse.headers.get('set-cookie') || '', /Max-Age=0/)

  const revokedSessionResponse = await fetchWithTimeout('/api/admin/session', {
    headers: {
      cookie: adminCookie,
    },
  })
  assert.equal(revokedSessionResponse.status, 401)
}

process.stdout.write(`Verified public release ${expectedVersion} at ${baseUrl.origin} (${expectedRevision}).\n`)
