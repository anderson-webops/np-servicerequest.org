import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const packageUrl = new URL('../node_modules/eslint-plugin-import-x/package.json', import.meta.url)
const moduleUrl = new URL('../node_modules/eslint-plugin-import-x/lib/rules/no-internal-modules.js', import.meta.url)
const originalHash = 'e8e65c1449e1ade45229001595b08f33fc879c4673e0c9be9013dd1df87acd21'
const originalImport = 'import { makeRe } from \'minimatch\';'
const compatibleImport = 'import { minimatch } from \'minimatch\';\nconst makeRe = pattern => ({ test: value => minimatch(value, pattern) });'

const packageMetadata = JSON.parse(await readFile(packageUrl, 'utf8'))
if (packageMetadata.version !== '4.17.1')
  throw new Error(`Review eslint-plugin-import-x ${packageMetadata.version} before applying its minimatch compatibility patch`)

const source = await readFile(moduleUrl, 'utf8')
const hash = createHash('sha256').update(source).digest('hex')
const patchedSource = source.replace(originalImport, compatibleImport)
const patchedHash = createHash('sha256').update(patchedSource).digest('hex')

if (hash === patchedHash && source.includes(compatibleImport)) {
  console.log('eslint-plugin-import-x minimatch compatibility patch already applied')
}
else if (hash === originalHash && patchedSource !== source) {
  await writeFile(moduleUrl, patchedSource)
  console.log('Applied eslint-plugin-import-x minimatch compatibility patch')
}
else {
  throw new Error('Unexpected eslint-plugin-import-x source; review before updating the minimatch compatibility patch')
}
