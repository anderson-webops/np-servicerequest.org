import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const frontendManifest = JSON.parse(await readFile(path.join(repositoryRoot, 'front-end/package.json'), 'utf8'))
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : path.join(path.dirname(process.execPath), 'npm')

function run(command, args, cwd, cacheDirectory) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        npm_config_cache: cacheDirectory,
        PUPPETEER_SKIP_DOWNLOAD: 'true',
      },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', code => code === 0
      ? resolveRun()
      : reject(new Error(`${command} exited with code ${code}.`)))
  })
}

async function packageInstalled(temporaryRoot, dependency) {
  for (const prefix of ['node_modules', 'front-end/node_modules']) {
    try {
      await readFile(path.join(temporaryRoot, prefix, dependency, 'package.json'), 'utf8')
      return true
    }
    catch {
      // npm may place workspace dependencies at either valid location.
    }
  }

  return false
}

async function verifyTarget(libc) {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `np-service-linux-arm64-${libc}-`))
  const cacheDirectory = path.join(temporaryRoot, '.npm-cache')

  try {
    await Promise.all([
      mkdir(path.join(temporaryRoot, 'front-end'), { recursive: true }),
      mkdir(path.join(temporaryRoot, 'back-end'), { recursive: true }),
    ])
    await Promise.all([
      cp(path.join(repositoryRoot, 'package.json'), path.join(temporaryRoot, 'package.json')),
      cp(path.join(repositoryRoot, 'package-lock.json'), path.join(temporaryRoot, 'package-lock.json')),
      cp(path.join(repositoryRoot, '.npmrc'), path.join(temporaryRoot, '.npmrc')),
      cp(path.join(repositoryRoot, 'front-end/package.json'), path.join(temporaryRoot, 'front-end/package.json')),
      cp(path.join(repositoryRoot, 'back-end/package.json'), path.join(temporaryRoot, 'back-end/package.json')),
    ])
    await run(
      npmCommand,
      [
        'ci',
        '--ignore-scripts',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        '--os=linux',
        '--cpu=arm64',
        `--libc=${libc}`,
      ],
      temporaryRoot,
      cacheDirectory,
    )

    const expected = Object.keys(frontendManifest.optionalDependencies || {}).filter((dependency) => {
      if (dependency === '@esbuild/linux-arm64')
        return true

      return dependency.includes('linux-arm64') && dependency.endsWith(libc === 'musl' ? '-musl' : '-gnu')
    })
    const missing = []

    for (const dependency of expected) {
      if (!(await packageInstalled(temporaryRoot, dependency)))
        missing.push(dependency)
    }

    if (missing.length)
      throw new Error(`Linux ARM64 ${libc} install omitted native packages: ${missing.join(', ')}`)

    process.stdout.write(`Verified Linux ARM64 ${libc} clean install (${expected.length} native packages).\n`)
  }
  finally {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
}

await verifyTarget('glibc')
await verifyTarget('musl')
