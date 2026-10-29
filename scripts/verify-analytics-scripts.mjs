import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = path.join(repositoryRoot, 'front-end', '.output', 'public')
const analyticsDisabled = process.env.DISABLE_ANALYTICS === 'true'
const assets = [
  {
    name: 'dedicated-script.js',
    hash: 'OtlpAaPAGbsps9PCG+6V4bw+yXs7LvYsI2LPzOVB1F1d8lHiMWzK+xiSMoAPPahp',
    host: 'https://analytics.np-servicerequest.org',
    websiteId: '352127b8-0c06-43d4-bb24-dd309723660d',
  },
  {
    name: 'central-script.js',
    hash: 'GCqIGuvWYg7O3NiELYWxOf/L6jh0MEUd1RXYXHaLbqZSLt7OY1ZAY8QSonb76YUk',
    host: 'https://analytics.jacobdanderson.net',
    websiteId: '211385a8-e6ee-4fcf-b06e-f669a4487a82',
  },
]

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory())
      return listHtmlFiles(entryPath)
    return entry.isFile() && entry.name.endsWith('.html')
      ? [entryPath]
      : []
  }))
  return nested.flat()
}

for (const asset of assets) {
  const relativePath = path.join('vendor', 'analytics', asset.name)
  const sourcePath = path.join(repositoryRoot, 'front-end', 'public', relativePath)
  const generatedPath = path.join(outputRoot, relativePath)
  for (const filePath of [sourcePath, generatedPath]) {
    const metadata = await lstat(filePath)
    assert.ok(metadata.isFile() && !metadata.isSymbolicLink(), `${relativePath} must be a regular file`)
    const hash = createHash('sha384').update(await readFile(filePath)).digest('base64')
    assert.equal(hash, asset.hash, `${relativePath} differs from its reviewed hash`)
  }
}

const htmlFiles = await listHtmlFiles(outputRoot)
assert.ok(htmlFiles.length > 0, 'Static output contains no HTML pages')

for (const htmlPath of htmlFiles) {
  const html = await readFile(htmlPath, 'utf8')
  const scripts = [
    ...html.matchAll(/<script\b[^>]*>/giu),
  ].map(match => match[0])
  assert.ok(scripts.every(script => !/\bsrc="https:\/\/analytics\./iu.test(script)), `${htmlPath} includes a remote analytics script`)

  for (const asset of assets) {
    const scriptPath = `/vendor/analytics/${asset.name}`
    const matches = scripts.filter(script => script.includes(`src="${scriptPath}"`))
    assert.equal(matches.length, analyticsDisabled ? 0 : 1, `${htmlPath} has an unexpected ${asset.name} count`)
    if (analyticsDisabled)
      continue

    assert.ok(matches[0].includes(`integrity="sha384-${asset.hash}"`), `${htmlPath} lacks reviewed script integrity`)
    assert.ok(matches[0].includes(`data-host-url="${asset.host}"`), `${htmlPath} changes the collection host`)
    assert.ok(matches[0].includes(`data-website-id="${asset.websiteId}"`), `${htmlPath} changes the website identity`)
  }
}

process.stdout.write(`Verified ${assets.length} immutable analytics assets across ${htmlFiles.length} static pages.\n`)
