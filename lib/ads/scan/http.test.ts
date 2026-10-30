import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGuardedLookup } from '@/lib/whois/ip-guard'
import { HTML_CONTENT_TYPE } from './config'
import { createNodeScanGet, type ScanGetOptions } from './http'

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void

let server: http.Server
let port = 0
let handler: Handler
let hits = 0
let lastHeaders: http.IncomingHttpHeaders = {}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    hits++
    lastHeaders = req.headers
    handler(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

beforeEach(() => {
  hits = 0
  lastHeaders = {}
})

/** Test-only lookup that skips the SSRF guard so the transport can talk to the local server. */
const toLocalhost = ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
  if (options?.all) cb(null, [{ address: '127.0.0.1', family: 4 }])
  else cb(null, '127.0.0.1', 4)
}) as unknown as ReturnType<typeof createGuardedLookup>

const get = createNodeScanGet(toLocalhost)
const url = (path = '/') => new URL(`http://example.com:${port}${path}`)
const options = (overrides: Partial<ScanGetOptions> = {}): ScanGetOptions => ({
  timeoutMs: 2000,
  maxBytes: 1_000_000,
  contentType: HTML_CONTENT_TYPE,
  onOverflow: 'truncate',
  ...overrides,
})

describe('transport behaviour', () => {
  it('returns a 2xx HTML body as bytes', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' })
      res.end('<p>merhaba</p>')
    }
    const response = await get(url('/a?b=1'), options())
    expect(response.status).toBe(200)
    expect(response.bytes.toString()).toBe('<p>merhaba</p>')
    expect(response.truncated).toBe(false)
    expect(response.xRobotsTag).toBe('noindex')
  })

  it('sends no cookies or credentials, identity encoding and the bot user agent', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('x')
    }
    await get(url(), options())
    expect(lastHeaders['accept-encoding']).toBe('identity')
    expect(lastHeaders['user-agent']).toMatch(/^GlovalAdsBot\//)
    expect(lastHeaders.cookie).toBeUndefined()
    expect(lastHeaders.authorization).toBeUndefined()
    expect(lastHeaders.host).toBe(`example.com:${port}`)
  })

  it('does not follow redirects, it reports them', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { location: 'http://127.0.0.1/admin' })
      res.end()
    }
    const response = await get(url(), options())
    expect(response).toMatchObject({ status: 302, location: 'http://127.0.0.1/admin' })
    expect(hits).toBe(1)
  })

  it('does not read the body of a non-2xx answer', async () => {
    handler = (_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' })
      res.end('<h1>not found</h1>'.repeat(1000))
    }
    const response = await get(url(), options())
    expect(response.status).toBe(404)
    expect(response.bytes.length).toBe(0)
  })

  it('truncates an oversized body when asked to, and flags it', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('a'.repeat(50_000))
    }
    const response = await get(url(), options({ maxBytes: 1000 }))
    expect(response.bytes.length).toBe(1000)
    expect(response.truncated).toBe(true)
  })

  it('rejects an oversized body when asked to', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('a'.repeat(50_000))
    }
    await expect(get(url(), options({ maxBytes: 1000, onOverflow: 'reject' }))).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it('stops reading an endless body at the cap (never buffers it all)', async () => {
    let written = 0
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      const pump = () => {
        while (!res.destroyed && written < 500_000_000) {
          written += 65_536
          if (!res.write(Buffer.alloc(65_536, 97))) {
            res.once('drain', pump)
            return
          }
        }
      }
      pump()
    }
    const response = await get(url(), options({ maxBytes: 100_000, timeoutMs: 3000 }))
    expect(response.bytes.length).toBe(100_000)
    expect(written).toBeLessThan(50_000_000)
  })

  it.each([
    ['application/pdf', 'BAD_CONTENT_TYPE'],
    ['application/json', 'BAD_CONTENT_TYPE'],
    ['image/png', 'BAD_CONTENT_TYPE'],
    ['text/plain', 'BAD_CONTENT_TYPE'],
  ])('refuses the content type %s before reading the body', async (type, code) => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': type })
      res.end('body')
    }
    await expect(get(url(), options())).rejects.toMatchObject({ code })
  })

  it('refuses a 2xx answer without a Content-Type', async () => {
    handler = (_req, res) => {
      res.writeHead(200)
      res.end('body')
    }
    await expect(get(url(), options())).rejects.toMatchObject({ code: 'BAD_CONTENT_TYPE' })
  })

  it('accepts xhtml and skips the check when no content type is demanded', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/xhtml+xml; charset=utf-8' })
      res.end('<p/>')
    }
    expect((await get(url(), options())).status).toBe(200)
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' })
      res.end('User-agent: *')
    }
    expect((await get(url('/robots.txt'), options({ contentType: null }))).bytes.toString()).toBe('User-agent: *')
  })

  it('refuses a compressed answer (decompression-bomb defence)', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' })
      res.end(Buffer.from([0x1f, 0x8b, 0x08]))
    }
    await expect(get(url(), options())).rejects.toMatchObject({ code: 'BAD_ENCODING' })
  })

  it('times out a server that never answers', async () => {
    handler = () => {}
    const started = Date.now()
    await expect(get(url(), options({ timeoutMs: 300 }))).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('times out a slow-loris body that keeps dripping bytes', async () => {
    handler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      const timer = setInterval(() => res.write('x'), 50)
      res.on('close', () => clearInterval(timer))
    }
    const started = Date.now()
    await expect(get(url(), options({ timeoutMs: 400 }))).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('refuses non-web schemes without opening a socket', async () => {
    await expect(get(new URL('ftp://example.com/'), options())).rejects.toMatchObject({ code: 'NOT_ALLOWED' })
    expect(hits).toBe(0)
  })

  it('reports a refused connection as a network error', async () => {
    const closed = http.createServer()
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve))
    const closedPort = (closed.address() as AddressInfo).port
    await new Promise<void>((resolve) => closed.close(() => resolve()))
    await expect(get(new URL(`http://example.com:${closedPort}/`), options())).rejects.toMatchObject({ code: 'NETWORK' })
  })
})

describe('the SSRF guard sits on the real connection path', () => {
  it('never opens a socket to a name that resolves to loopback', async () => {
    handler = (_req, res) => res.end('secret')
    const guarded = createNodeScanGet(createGuardedLookup(async () => [{ address: '127.0.0.1', family: 4 }]))
    await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'BLOCKED' })
    expect(hits).toBe(0)
  })

  it('never connects when the answer mixes a public and a private address', async () => {
    handler = (_req, res) => res.end('secret')
    const guarded = createNodeScanGet(
      createGuardedLookup(async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ]),
    )
    await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'BLOCKED' })
    expect(hits).toBe(0)
  })

  it.each(['169.254.169.254', '10.0.0.1', '192.168.0.10', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1'])(
    'refuses a name that resolves to %s',
    async (address) => {
      handler = (_req, res) => res.end('secret')
      const family = address.includes(':') ? 6 : 4
      const guarded = createNodeScanGet(createGuardedLookup(async () => [{ address, family }]))
      await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'BLOCKED' })
      expect(hits).toBe(0)
    },
  )

  it('asks the resolver again for every connection, so a rebinding name is checked each time', async () => {
    handler = (_req, res) => res.end('secret')
    const resolveAll = vi.fn(async () => [{ address: '127.0.0.1', family: 4 }])
    const guarded = createNodeScanGet(createGuardedLookup(resolveAll))
    await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'BLOCKED' })
    await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'BLOCKED' })
    expect(resolveAll).toHaveBeenCalledTimes(2)
  })

  it('treats a DNS failure as a network error', async () => {
    const guarded = createNodeScanGet(
      createGuardedLookup(async () => {
        throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
      }),
    )
    await expect(guarded(url(), options())).rejects.toMatchObject({ code: 'NETWORK' })
  })
})
