import type { Server } from 'node:http'
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { env } from 'node:process'
import { after, before, test } from 'node:test'

const allowedOrigin = 'https://np-security-test.example'
const adminKey = 'test-admin-key-with-at-least-forty-characters'
let baseUrl = ''
let dataDirectory = ''
let server: Server | null = null

function sleep(ms: number) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms))
}

async function fetchJson(path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  })

  return {
    body: await response.json() as Record<string, unknown>,
    response,
  }
}

async function getAgedAntiBotChallenge() {
  const { body, response } = await fetchJson('/api/board/bootstrap', {
    headers: {
      origin: allowedOrigin,
    },
  })
  assert.equal(response.status, 200)
  await sleep(1250)
  return body.antiBot as { issuedAt: number, token: string }
}

before(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'np-sr-security-auth-'))
  env.ALLOWED_ORIGINS = allowedOrigin
  env.BOARD_ADMIN_EMAILS = 'promoted-without-proof@example.com'
  env.BOARD_ADMIN_KEY = adminKey
  env.ENABLE_BOARD_EMAIL_NOTIFICATIONS = 'false'
  env.ENABLE_BOARD_MANAGEMENT_EMAILS = 'false'
  env.ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS = 'false'
  env.NODE_ENV = 'test'
  env.SUBMISSIONS_DATA_DIR = dataDirectory

  const { createApp } = await import('./app.js')
  server = createServer(createApp())

  await new Promise<void>((resolveListen, reject) => {
    server?.listen(0, '127.0.0.1', (error?: Error) => {
      if (error) {
        reject(error)
        return
      }

      resolveListen()
    })
  })

  const address = server.address()

  if (!address || typeof address === 'string')
    throw new Error('Failed to start the security test server.')

  baseUrl = `http://127.0.0.1:${address.port}`
})

after(async () => {
  for (const key of [
    'ALLOWED_ORIGINS',
    'BOARD_ADMIN_EMAILS',
    'BOARD_ADMIN_KEY',
    'ENABLE_BOARD_EMAIL_NOTIFICATIONS',
    'ENABLE_BOARD_MANAGEMENT_EMAILS',
    'ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS',
    'NODE_ENV',
    'SUBMISSIONS_DATA_DIR',
  ]) {
    delete env[key]
  }

  if (server) {
    await new Promise<void>((resolveClose, reject) => {
      server?.close((error?: Error) => {
        if (error) {
          reject(error)
          return
        }

        resolveClose()
      })
    })
  }

  await rm(dataDirectory, { force: true, recursive: true })
})

test('credentialed CORS is limited to configured origins and unsafe cross-site requests are rejected', async () => {
  const disallowedGet = await fetch(`${baseUrl}/api/board/bootstrap`, {
    headers: {
      origin: 'https://attacker.invalid',
    },
  })
  assert.equal(disallowedGet.status, 200)
  assert.equal(disallowedGet.headers.get('access-control-allow-origin'), null)

  const { response: disallowedPost } = await fetchJson('/api/admin/session', {
    body: JSON.stringify({
      adminKey,
    }),
    headers: {
      origin: 'https://attacker.invalid',
      'sec-fetch-site': 'cross-site',
    },
    method: 'POST',
  })
  assert.equal(disallowedPost.status, 403)
  assert.equal(disallowedPost.headers.get('access-control-allow-origin'), null)
})

test('self-registration cannot promote an allowlisted email and passwords are stored as scrypt hashes', async () => {
  const antiBot = await getAgedAntiBotChallenge()
  const email = 'promoted-without-proof@example.com'
  const password = 'a-long-test-password'
  const { body, response } = await fetchJson('/api/board/account/register', {
    body: JSON.stringify({
      challengeIssuedAt: String(antiBot.issuedAt),
      challengeToken: antiBot.token,
      displayName: 'Unverified Admin Claim',
      email,
      password,
    }),
    headers: {
      origin: allowedOrigin,
      'sec-fetch-site': 'same-origin',
    },
    method: 'POST',
  })

  assert.equal(response.status, 201)
  assert.equal((body.viewer as { isAdmin: boolean }).isAdmin, false)
  assert.match(response.headers.get('set-cookie') || '', /HttpOnly/)
  assert.match(response.headers.get('set-cookie') || '', /SameSite=Strict/)

  const accountDirectory = resolve(dataDirectory, '_board', 'accounts')
  const accountFiles = await readdir(accountDirectory)
  assert.equal(accountFiles.length, 1)
  const accountText = await readFile(resolve(accountDirectory, accountFiles[0]), 'utf8')
  const account = JSON.parse(accountText)
  assert.equal(account.role, 'member')
  assert.equal(account.passwordAlgorithm, 'scrypt-v2')
  assert.notEqual(account.passwordHash, password)
  assert.equal(accountText.includes(password), false)

  const loginChallenge = await getAgedAntiBotChallenge()
  const { response: failedLogin } = await fetchJson('/api/board/account/login', {
    body: JSON.stringify({
      challengeIssuedAt: String(loginChallenge.issuedAt),
      challengeToken: loginChallenge.token,
      email,
      password: 'this-password-is-wrong',
    }),
    headers: {
      origin: allowedOrigin,
    },
    method: 'POST',
  })
  assert.equal(failedLogin.status, 401)
})

test('admin keys are exchanged for revocable HttpOnly sessions and are not accepted from browser headers', async () => {
  const { response: browserHeaderResponse } = await fetchJson('/api/admin/submissions', {
    headers: {
      origin: allowedOrigin,
      'x-admin-key': adminKey,
    },
  })
  assert.equal(browserHeaderResponse.status, 401)

  const { response: serverClientResponse } = await fetchJson('/api/admin/submissions', {
    headers: {
      'x-admin-key': adminKey,
    },
  })
  assert.equal(serverClientResponse.status, 200)

  const { response: loginResponse } = await fetchJson('/api/admin/session', {
    body: JSON.stringify({
      adminKey,
    }),
    headers: {
      origin: allowedOrigin,
    },
    method: 'POST',
  })
  assert.equal(loginResponse.status, 200)
  const setCookie = loginResponse.headers.get('set-cookie') || ''
  assert.match(setCookie, /HttpOnly/)
  assert.match(setCookie, /SameSite=Strict/)
  const cookie = setCookie.split(';')[0]

  const { response: sessionResponse } = await fetchJson('/api/admin/session', {
    headers: {
      cookie,
      origin: allowedOrigin,
    },
  })
  assert.equal(sessionResponse.status, 200)

  const { response: logoutResponse } = await fetchJson('/api/admin/session', {
    headers: {
      cookie,
      origin: allowedOrigin,
    },
    method: 'DELETE',
  })
  assert.equal(logoutResponse.status, 200)
  assert.match(logoutResponse.headers.get('set-cookie') || '', /Max-Age=0/)

  const { response: revokedSessionResponse } = await fetchJson('/api/admin/session', {
    headers: {
      cookie,
      origin: allowedOrigin,
    },
  })
  assert.equal(revokedSessionResponse.status, 401)
})
