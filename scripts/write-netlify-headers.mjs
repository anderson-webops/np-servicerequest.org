import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(repositoryRoot, 'front-end', '.output', 'public')

async function listHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory())
        return listHtmlFiles(entryPath)

      return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : []
    }),
  )
  return files.flat()
}

const scriptHashes = new Set()
for (const htmlFile of await listHtmlFiles(outputDirectory)) {
  const html = await readFile(htmlFile, 'utf8')

  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1]
    const contents = match[2]

    if (
      /\bsrc\s*=/i.test(attributes)
      || /\btype\s*=\s*["']application\/json["']/i.test(attributes)
      || !contents
    ) {
      continue
    }

    scriptHashes.add(`'sha256-${createHash('sha256').update(contents).digest('base64')}'`)
  }
}

if (!scriptHashes.size)
  throw new Error('No executable inline scripts were found in the generated site.')

const contentSecurityPolicy = [
  'default-src \'self\'',
  'base-uri \'self\'',
  'object-src \'none\'',
  'frame-ancestors \'none\'',
  'form-action \'self\'',
  'img-src \'self\' data: blob: https:',
  'font-src \'self\' data:',
  'style-src \'self\' \'unsafe-inline\'',
  `script-src 'self' ${[...scriptHashes].join(' ')} https://analytics.np-servicerequest.org https://analytics.jacobdanderson.net`,
  'connect-src \'self\' https://analytics.np-servicerequest.org https://analytics.jacobdanderson.net',
  'frame-src \'none\'',
  'media-src \'self\' blob:',
  'worker-src \'self\' blob:',
].join('; ')

await writeFile(
  path.join(outputDirectory, '_headers'),
  `/*\n  Content-Security-Policy: ${contentSecurityPolicy}\n`,
  'utf8',
)
process.stdout.write(`Wrote Netlify CSP with ${scriptHashes.size} inline script hashes.\n`)
