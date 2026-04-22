import { createReadStream } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { argv, cwd, env, exit, once } from 'node:process'

const rootDirectory = resolve(cwd(), env.STATIC_ROOT || argv[2] || 'front-end/.output/public')
const port = Number(env.PORT || argv[3] || 3333)

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
])

async function canRead(path) {
  try {
    await access(path)
    return true
  }
  catch {
    return false
  }
}

async function resolveStaticPath(urlPathname) {
  const normalizedPath = decodeURIComponent(urlPathname.split('?')[0] || '/')
  const safeRelativePath = normalize(normalizedPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const candidatePath = resolve(rootDirectory, `.${safeRelativePath}`)

  if (!candidatePath.startsWith(rootDirectory))
    return null

  if (await canRead(candidatePath)) {
    const candidateStat = await stat(candidatePath)

    if (candidateStat.isDirectory()) {
      const indexPath = join(candidatePath, 'index.html')
      if (await canRead(indexPath))
        return indexPath
    }
    else {
      return candidatePath
    }
  }

  const nestedIndexPath = resolve(rootDirectory, `.${safeRelativePath}`, 'index.html')
  if (nestedIndexPath.startsWith(rootDirectory) && await canRead(nestedIndexPath))
    return nestedIndexPath

  const spaFallback = await canRead(resolve(rootDirectory, '200.html'))
    ? resolve(rootDirectory, '200.html')
    : resolve(rootDirectory, 'index.html')

  return await canRead(spaFallback) ? spaFallback : null
}

const server = createServer(async (request, response) => {
  const requestPath = request.url || '/'
  const filePath = await resolveStaticPath(requestPath)

  if (!filePath) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Not found')
    return
  }

  const extension = extname(filePath)
  response.writeHead(200, {
    'cache-control': extension === '.html' ? 'no-store' : 'public, max-age=3600',
    'content-type': contentTypes.get(extension) || 'application/octet-stream',
  })
  createReadStream(filePath).pipe(response)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Static server listening on http://127.0.0.1:${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  once(signal, () => {
    server.close(() => exit(0))
  })
}
