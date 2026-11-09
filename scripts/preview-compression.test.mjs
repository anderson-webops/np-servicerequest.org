import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import http from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import { Socket } from 'node:net'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import zlib from 'node:zlib'
import { listen as listenSecure } from 'listhen'

const frontend = createRequire(new URL('../front-end/package.json', import.meta.url))
const preview = createRequire(frontend.resolve('serve/package.json'))
const compression = preview('compression')
const body = 'controlled static preview content\n'.repeat(4096)

test('the actual preview schema uses the qualified current validator and URI provider', async () => {
  const application = createRequire(new URL('../package.json', import.meta.url))
  assert.equal(preview.resolve('ajv'), application.resolve('ajv'))
  assert.equal(preview('ajv/package.json').version, '8.20.0+webops.2')
  const validator = createRequire(preview.resolve('ajv'))
  assert.equal(validator.resolve('fast-uri'), application.resolve('fast-uri'))
  assert.equal(validator('fast-uri/package.json').version, '4.2.3')
  const { default: schema } = await import(pathToFileURL(preview.resolve('@zeit/schemas/deployment/config-static.js')))
  const Ajv = preview('ajv')
  const validate = new Ajv({ allowUnionTypes: true }).compile(schema)
  assert.equal(validate({ cleanUrls: true, directoryListing: false }), true)
  assert.equal(validate({
    headers: [
      {
        source: '/fixture',
        headers: [
          { key: 'X-Fixture', value: 'synthetic' },
        ],
      },
    ],
  }), true)
  assert.equal(validate({ cleanUrls: 'invalid' }), false)
  assert.equal(validate({
    headers: [
      {
        source: '/fixture',
        headers: [
          { key: 42, value: 'synthetic' },
        ],
      },
    ],
  }), false)
  assert.equal(validate({ unexpected: true }), false)
})

function captureCompressors() {
  const factories = ['createGzip', 'createDeflate', 'createBrotliCompress']
  const descriptors = new Map(factories.map(name => [
    name,
    Object.getOwnPropertyDescriptor(zlib, name),
  ]))
  const created = []
  for (const [name, descriptor] of descriptors) {
    Object.defineProperty(zlib, name, {
      ...descriptor,
      value(...argumentsList) {
        const stream = Reflect.apply(descriptor.value, zlib, argumentsList)
        created.push(stream)
        return stream
      },
    })
  }
  return {
    created,
    restore() {
      for (const [name, descriptor] of descriptors) Object.defineProperty(zlib, name, descriptor)
      for (const stream of created) stream.destroy()
    },
  }
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${server.address().port}/fixture.txt`
}

async function close(server) {
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close(error => error
    ? reject(error)
    : resolve()))
}

test('the actual preview compressor preserves ordinary gzip, deflate, Brotli and identity responses', { timeout: 10_000 }, async () => {
  const middleware = compression()
  const server = http.createServer((request, response) => {
    middleware(request, response, () => {
      response.setHeader('Content-Type', 'text/plain')
      response.end(body)
    })
  })
  try {
    const address = await listen(server)
    for (const [encoding, decode] of [
      ['gzip', zlib.gunzipSync],
      ['deflate', zlib.inflateSync],
      ['br', zlib.brotliDecompressSync],
      [
        'identity',
        value => value,
      ],
    ]) {
      const result = await new Promise((resolve, reject) => {
        const request = http.get(address, {
          headers: { 'Accept-Encoding': encoding },
        }, (response) => {
          const chunks = []
          response.on('data', chunk => chunks.push(chunk))
          response.once('error', reject)
          response.once('end', () => resolve({
            status: response.statusCode,
            headers: response.headers,
            bytes: Buffer.concat(chunks),
          }))
        })
        request.once('error', reject)
      })
      assert.equal(result.status, 200)
      assert.equal(result.headers['content-encoding'], encoding === 'identity'
        ? undefined
        : encoding)
      assert.equal(decode(result.bytes).toString(), body)
    }
  }
  finally {
    await close(server)
  }
})

test('premature preview disconnects destroy native compression resources for every encoding', { timeout: 10_000 }, async () => {
  const { created, restore } = captureCompressors()
  try {
    for (const encoding of ['gzip', 'deflate', 'br']) {
      const observedClose = Promise.withResolvers()
      const middleware = compression()
      const server = http.createServer((request, response) => {
        response.once('close', observedClose.resolve)
        middleware(request, response, () => {
          response.setHeader('Content-Type', 'text/plain')
          response.write(body)
          response.flush()
        })
      })
      try {
        const before = created.length
        const address = await listen(server)
        await new Promise((resolve, reject) => {
          const request = http.get(address, {
            headers: { 'Accept-Encoding': encoding },
          }, (response) => {
            assert.equal(response.headers['content-encoding'], encoding)
            response.once('error', reject)
            response.once('data', () => {
              response.destroy()
              resolve()
            })
          })
          request.once('error', reject)
        })
        await observedClose.promise
        assert.equal(created.length, before + 1)
        assert.equal(created.at(-1).destroyed, true, `${encoding} resources must be destroyed after the response closes`)
      }
      finally {
        for (const stream of created) stream.destroy()
        await close(server)
      }
    }
  }
  finally {
    restore()
  }
})

test('a response closed before header generation cannot retain a subsequently created compressor', () => {
  const { created, restore } = captureCompressors()
  try {
    for (const encoding of ['gzip', 'deflate', 'br']) {
      const socket = new Socket()
      const request = new http.IncomingMessage(socket)
      request.method = 'GET'
      request.headers['accept-encoding'] = encoding
      const response = new http.ServerResponse(request)
      try {
        compression()(request, response, () => {})
        response.setHeader('Content-Type', 'text/plain')
        response.emit('close')
        response.writeHead(200)
        assert.equal(created.at(-1).destroyed, true, `${encoding} resources created after closure must be destroyed`)
      }
      finally {
        response.destroy()
        socket.destroy()
      }
    }
    assert.equal(created.length, 3)
  }
  finally {
    restore()
  }
})

test('the patched preview compressor preserves certificate-verified HTTPS responses', { timeout: 10_000 }, async () => {
  const middleware = compression()
  const listener = await listenSecure((request, response) => {
    middleware(request, response, () => {
      response.setHeader('Content-Type', 'text/plain')
      response.end(body)
    })
  }, {
    hostname: '127.0.0.1',
    port: 0,
    https: {
      domains: ['127.0.0.1'],
      validityDays: 1,
    },
    autoClose: false,
    isTest: true,
  })
  try {
    const received = await new Promise((resolve, reject) => {
      const request = https.get(listener.url, {
        ca: listener.https.cert,
        headers: { 'Accept-Encoding': 'gzip' },
      }, (response) => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.once('error', reject)
        response.once('end', () => resolve({
          encoding: response.headers['content-encoding'],
          bytes: Buffer.concat(chunks),
        }))
      })
      request.once('error', reject)
    })
    assert.equal(received.encoding, 'gzip')
    assert.equal(zlib.gunzipSync(received.bytes).toString(), body)
  }
  finally {
    await listener.close()
  }
})
