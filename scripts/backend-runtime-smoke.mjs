import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const staticDirectory = path.join(repositoryRoot, 'front-end', '.output', 'public')
const serverPath = path.join(repositoryRoot, 'back-end', 'dist', 'server.js')
const release = JSON.parse(await readFile(path.join(staticDirectory, 'release.json'), 'utf8'))
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'np-service-runtime-'))
const adminKey = 'runtime-smoke-admin-key-with-more-than-thirty-two-characters'

async function reservePort() {
  const server = createServer()
  await new Promise((resolveListen, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()))
  return port
}

async function waitForServer(baseUrl, child, diagnostics) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode != null)
      throw new Error(`Production runtime exited early.\n${diagnostics.join('')}`)

    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(500),
      })
      if (response.ok)
        return
    }
    catch {
      // The process may still be starting.
    }

    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }

  throw new Error(`Production runtime did not become ready.\n${diagnostics.join('')}`)
}

async function stopChild(child) {
  if (child.exitCode != null)
    return

  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolveExit => child.once('exit', resolveExit)),
    new Promise(resolveTimeout => setTimeout(resolveTimeout, 5_000)),
  ])
  if (child.exitCode == null)
    child.kill('SIGKILL')
}

const port = await reservePort()
const baseUrl = `http://127.0.0.1:${port}`
const childEnvironment = {
  ...process.env,
  ALLOW_EPHEMERAL_DATA_DIR: 'true',
  ALLOW_PUBLIC_LISTENER: 'false',
  ANTI_BOT_SECRET: 'runtime-smoke-antibot-secret-with-more-than-thirty-two-characters',
  BOARD_ADMIN_KEY: adminKey,
  BOARD_ALLOWED_ORIGINS: 'https://np-servicerequest.org',
  BOARD_PUBLIC_WEB_URL: 'https://np-servicerequest.org',
  ENABLE_BOARD_EMAIL_NOTIFICATIONS: 'false',
  ENABLE_BOARD_MANAGEMENT_EMAILS: 'false',
  ENABLE_BOARD_REPLY_NOTIFICATION_EMAILS: 'false',
  HOST: '127.0.0.1',
  NODE_ENV: 'production',
  PORT: String(port),
  STATIC_SITE_DIR: staticDirectory,
  SUBMISSIONS_DATA_DIR: path.join(temporaryRoot, 'data'),
  TRUST_PROXY_HOPS: '0',
}
delete childEnvironment.NP_RELEASE_VERSION
delete childEnvironment.SOURCE_REVISION

const diagnostics = []
const child = spawn(process.execPath, [serverPath], {
  cwd: repositoryRoot,
  env: childEnvironment,
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', chunk => diagnostics.push(chunk.toString()))
child.stderr.on('data', chunk => diagnostics.push(chunk.toString()))

try {
  await waitForServer(baseUrl, child, diagnostics)
  const result = await execFileAsync(process.execPath, ['scripts/post-deploy-smoke.mjs'], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      EXPECTED_REVISION: release.revision,
      EXPECTED_VERSION: release.version,
      PRODUCTION_BASE_URL: baseUrl,
      PRODUCTION_REQUEST_ORIGIN: 'https://np-servicerequest.org',
      VERIFY_ADMIN_KEY: adminKey,
    },
  })
  process.stdout.write(result.stdout)
  process.stdout.write(`Verified direct production runtime at ${release.revision}.\n`)
}
finally {
  await stopChild(child)
  await rm(temporaryRoot, { force: true, recursive: true })
}
