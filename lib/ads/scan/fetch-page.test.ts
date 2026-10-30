import { describe, expect, it, vi } from 'vitest'
import { SCAN_LIMITS } from './config'
import { ScanFetchError } from './errors'
import { assertScannable, createScanFetcher, decodeHtml } from './fetch-page'
import type { ScanGet, ScanGetOptions, ScanResponse } from './http'

const html = (body = '<p>merhaba</p>', extra: Partial<ScanResponse> = {}): ScanResponse => ({
  status: 200,
  location: null,
  contentType: 'text/html; charset=utf-8',
  xRobotsTag: null,
  bytes: Buffer.from(body),
  truncated: false,
  ...extra,
})
const redirect = (location: string, status = 302): ScanResponse => ({ ...html(''), status, location, bytes: Buffer.alloc(0) })
const status = (code: number, body = ''): ScanResponse => ({ ...html(body), status: code })
const text = (body: string): ScanResponse => ({ ...html(body), contentType: 'text/plain' })

type Routes = Record<string, ScanResponse | Error | (() => ScanResponse | Error)>

/** A fake transport: records every request and answers from a route table (default: 404). */
function fakeGet(routes: Routes) {
  const calls: Array<{ url: string; options: ScanGetOptions }> = []
  const httpGet: ScanGet = async (url, options) => {
    calls.push({ url: url.href, options })
    const route = routes[url.href]
    const value = typeof route === 'function' ? route() : route
    if (value instanceof Error) throw value
    return value ?? status(404)
  }
  return { httpGet, calls, urls: () => calls.map((c) => c.url) }
}

const fetcherFor = (httpGet: ScanGet, extra: { deadline?: number; now?: () => number } = {}) =>
  createScanFetcher({ httpGet, deadline: extra.deadline ?? Date.now() + 60_000, now: extra.now })

const ROBOTS_OK = { 'https://example.com/robots.txt': status(404) }

describe('assertScannable (re-run on every hop)', () => {
  it.each([
    'https://example.com/',
    'http://example.com/path?q=1',
    'https://sub.example.co.uk/a',
    'https://xn--bcher-kva.example/',
  ])('accepts %s', (value) => {
    expect(() => assertScannable(new URL(value))).not.toThrow()
  })

  it.each([
    ['file:///etc/passwd', 'file scheme'],
    ['ftp://example.com/', 'ftp scheme'],
    ['gopher://example.com/', 'gopher scheme'],
    ['data:text/html,hi', 'data scheme'],
    ['javascript:alert(1)', 'javascript scheme'],
    ['https://user:pass@example.com/', 'credentials'],
    ['https://user@example.com/', 'username only'],
    ['https://example.com:8443/', 'non-default https port'],
    ['http://example.com:8080/', 'non-default http port'],
    ['https://example.com:80/', 'http port on https'],
    ['http://example.com:443/', 'https port on http'],
    ['https://example.com:22/', 'ssh port'],
    ['http://127.0.0.1/', 'loopback literal'],
    ['http://127.1/', 'short loopback literal'],
    ['http://2130706433/', 'decimal loopback literal'],
    ['http://0x7f000001/', 'hex loopback literal'],
    ['http://0177.0.0.1/', 'octal loopback literal'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata literal'],
    ['http://10.0.0.1/', 'private literal'],
    ['http://[::1]/', 'IPv6 loopback literal'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped literal'],
    ['http://[fd00::1]/', 'IPv6 unique-local literal'],
    ['http://localhost/', 'localhost'],
    ['http://foo.localhost/', 'localhost suffix'],
    ['http://printer.local/', '.local'],
    ['http://db.internal/', '.internal'],
    ['http://nas.lan/', '.lan'],
    ['http://intranet/', 'single-label host'],
  ])('refuses %s (%s)', (value) => {
    expect(() => assertScannable(new URL(value))).toThrowError(expect.objectContaining({ code: 'NOT_ALLOWED' }))
  })
})

describe('redirects', () => {
  it('follows up to 3 hops, resolving relative locations', async () => {
    const t = fakeGet({
      ...ROBOTS_OK,
      'https://example.com/': redirect('/a'),
      'https://example.com/a': redirect('b'),
      'https://example.com/b': redirect('https://example.com/c'),
      'https://example.com/c': html('<p>son</p>'),
    })
    const page = await fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))
    expect(page.finalUrl.href).toBe('https://example.com/c')
    expect(page.html).toBe('<p>son</p>')
  })

  it('refuses a fourth hop', async () => {
    const t = fakeGet({
      ...ROBOTS_OK,
      'https://example.com/': redirect('/1'),
      'https://example.com/1': redirect('/2'),
      'https://example.com/2': redirect('/3'),
      'https://example.com/3': redirect('/4'),
      'https://example.com/4': html(),
    })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'REDIRECT_LIMIT',
    })
    expect(t.urls()).not.toContain('https://example.com/4')
    expect(SCAN_LIMITS.maxRedirects).toBe(3)
  })

  it('refuses a redirect loop', async () => {
    const t = fakeGet({
      ...ROBOTS_OK,
      'https://example.com/': redirect('/a'),
      'https://example.com/a': redirect('/'),
    })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'REDIRECT_LIMIT',
    })
  })

  it.each([
    ['http://169.254.169.254/latest/meta-data/', 'cloud metadata'],
    ['http://127.0.0.1:8080/admin', 'loopback with port'],
    ['http://10.0.0.1/', 'private IPv4 literal'],
    ['http://[::1]/', 'IPv6 loopback literal'],
    ['https://db.internal/', 'internal suffix'],
    ['https://example.com:8443/', 'non-default port'],
    ['ftp://example.com/file', 'ftp scheme'],
    ['gopher://example.com/', 'gopher scheme'],
    ['file:///etc/passwd', 'file scheme'],
    ['https://user:pw@example.com/', 'credentials'],
    ['https://example.com@evil.internal/', 'userinfo trick'],
  ])('revalidates the redirect target %s (%s) and never requests it', async (target) => {
    const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': redirect(target) })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    })
    expect(t.urls()).toEqual(['https://example.com/robots.txt', 'https://example.com/'])
  })

  it('treats a redirect without Location, with a bad Location or with a huge Location as a failure', async () => {
    const none = fakeGet({ ...ROBOTS_OK, 'https://example.com/': { ...redirect(''), location: null } })
    await expect(fetcherFor(none.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'REDIRECT_LIMIT',
    })
    const bad = fakeGet({ ...ROBOTS_OK, 'https://example.com/': redirect('http://[bad') })
    await expect(fetcherFor(bad.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    })
    const huge = fakeGet({ ...ROBOTS_OK, 'https://example.com/': redirect(`/${'a'.repeat(5000)}`) })
    await expect(fetcherFor(huge.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    })
  })

  it('checks robots.txt of the origin a redirect lands on, before fetching it', async () => {
    const t = fakeGet({
      ...ROBOTS_OK,
      'https://example.com/': redirect('https://www.example.com/'),
      'https://www.example.com/robots.txt': text('User-agent: *\nDisallow: /'),
      'https://www.example.com/': html(),
    })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'ROBOTS_DISALLOWED',
    })
    expect(t.urls()).not.toContain('https://www.example.com/')
  })

  it('follows a redirect of robots.txt itself (http -> https) with the same validation', async () => {
    const t = fakeGet({
      'https://example.com/robots.txt': redirect('http://127.0.0.1/robots.txt'),
      'https://example.com/': html(),
    })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'ROBOTS_DISALLOWED',
    })
    expect(t.urls()).not.toContain('http://127.0.0.1/robots.txt')
  })
})

describe('robots.txt (RFC 9309)', () => {
  const page = (routes: Routes) => {
    const t = fakeGet({ 'https://example.com/': html(), ...routes })
    return { t, result: fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/')) }
  }

  it('does not fetch the page when robots disallows it', async () => {
    const { t, result } = page({ 'https://example.com/robots.txt': text('User-agent: *\nDisallow: /') })
    await expect(result).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' })
    expect(t.urls()).toEqual(['https://example.com/robots.txt'])
  })

  it('honours a group that names this bot', async () => {
    const { result } = page({ 'https://example.com/robots.txt': text('User-agent: GlovalAdsBot\nDisallow: /') })
    await expect(result).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' })
  })

  it('allows the page when robots allows it', async () => {
    const { result } = page({ 'https://example.com/robots.txt': text('User-agent: *\nDisallow: /private') })
    await expect(result).resolves.toMatchObject({ html: '<p>merhaba</p>' })
  })

  it.each([404, 403, 410, 429])('treats a %s robots.txt as "everything allowed"', async (code) => {
    const { result } = page({ 'https://example.com/robots.txt': status(code) })
    await expect(result).resolves.toBeDefined()
  })

  it.each([500, 502, 503])('treats a %s robots.txt as "everything disallowed"', async (code) => {
    const { t, result } = page({ 'https://example.com/robots.txt': status(code) })
    await expect(result).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' })
    expect(t.urls()).toEqual(['https://example.com/robots.txt'])
  })

  it('treats an unreachable robots.txt as "everything disallowed"', async () => {
    const { result } = page({ 'https://example.com/robots.txt': new ScanFetchError('TIMEOUT') })
    await expect(result).rejects.toMatchObject({ code: 'ROBOTS_DISALLOWED' })
  })

  it('treats a robots.txt that answers HTML (soft 404) as "no rules"', async () => {
    const { result } = page({ 'https://example.com/robots.txt': html('<html><body>Page not found</body></html>') })
    await expect(result).resolves.toBeDefined()
  })

  it('reads robots.txt once per origin and with the robots size cap and no content-type demand', async () => {
    const t = fakeGet({
      'https://example.com/robots.txt': text('User-agent: *\nDisallow: /nope'),
      'https://example.com/': html(),
      'https://example.com/a': html(),
    })
    const fetcher = fetcherFor(t.httpGet)
    await fetcher.fetchPage(new URL('https://example.com/'))
    await fetcher.fetchPage(new URL('https://example.com/a'))
    const robotsCalls = t.calls.filter((c) => c.url.endsWith('/robots.txt'))
    expect(robotsCalls).toHaveLength(1)
    expect(robotsCalls[0].options).toMatchObject({ maxBytes: SCAN_LIMITS.robotsMaxBytes, contentType: null })
  })
})

describe('request limits', () => {
  it('asks for pages with the 1 MB cap and an HTML-only content-type filter', async () => {
    const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': html() })
    await fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))
    const pageCall = t.calls.find((c) => c.url === 'https://example.com/')
    expect(pageCall?.options.maxBytes).toBe(1_048_576)
    expect(pageCall?.options.contentType?.test('text/html; charset=utf-8')).toBe(true)
    expect(pageCall?.options.contentType?.test('application/pdf')).toBe(false)
    expect(pageCall?.options.contentType?.test('text/htmlx')).toBe(false)
  })

  it('never gives a request more than its own timeout or more than the time left', async () => {
    let clock = 1_000
    const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': html() })
    await fetcherFor(t.httpGet, { deadline: 1_000 + 2_500, now: () => clock }).fetchPage(new URL('https://example.com/'))
    for (const call of t.calls) expect(call.options.timeoutMs).toBeLessThanOrEqual(SCAN_LIMITS.requestTimeoutMs)
    clock = 1_000 + 2_500 - 100
    const late = fakeGet({ ...ROBOTS_OK, 'https://example.com/': html() })
    await fetcherFor(late.httpGet, { deadline: 1_000 + 2_500, now: () => clock }).fetchPage(new URL('https://example.com/'))
    for (const call of late.calls) expect(call.options.timeoutMs).toBeLessThanOrEqual(100)
  })

  it('stops with TIMEOUT once the shared deadline has passed, without sending a request', async () => {
    const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': html() })
    const fetcher = fetcherFor(t.httpGet, { deadline: 500, now: () => 1_000 })
    await expect(fetcher.fetchPage(new URL('https://example.com/'))).rejects.toBeInstanceOf(ScanFetchError)
    expect(t.calls).toHaveLength(0)
  })

  it('surfaces transport errors unchanged (blocked address, too large, content type)', async () => {
    for (const code of ['BLOCKED', 'BAD_CONTENT_TYPE', 'TOO_LARGE', 'NETWORK'] as const) {
      const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': new ScanFetchError(code) })
      await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({ code })
    }
  })

  it('refuses a final non-2xx answer', async () => {
    const t = fakeGet({ ...ROBOTS_OK, 'https://example.com/': status(404, '<p>nope</p>') })
    await expect(fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))).rejects.toMatchObject({
      code: 'BAD_STATUS',
    })
  })

  it('reports truncation and the X-Robots-Tag verdict', async () => {
    const t = fakeGet({
      ...ROBOTS_OK,
      'https://example.com/': html('<p>x</p>', { truncated: true, xRobotsTag: 'noindex' }),
    })
    const page = await fetcherFor(t.httpGet).fetchPage(new URL('https://example.com/'))
    expect(page).toMatchObject({ truncated: true, headerForbidsUse: true })
  })
})

describe('decodeHtml', () => {
  const latin5 = Buffer.from([0x43, 0xfd, 0x6c, 0xfe, 0x6d, 0x61]) // "Cıl" + "şma" in windows-1254: C ı l ş m a

  it('decodes Turkish single-byte pages declared in the header', () => {
    expect(decodeHtml(latin5, 'text/html; charset=windows-1254')).toBe('Cılşma')
    expect(decodeHtml(latin5, 'text/html; charset=ISO-8859-9')).toBe('Cılşma')
  })

  it('sniffs <meta charset> when the header has none', () => {
    const bytes = Buffer.concat([Buffer.from('<meta charset="iso-8859-9">'), latin5])
    expect(decodeHtml(bytes, 'text/html')).toContain('Cılşma')
  })

  it('reads UTF-8 by default and falls back to UTF-8 for an unknown label', () => {
    expect(decodeHtml(Buffer.from('çalışma'), 'text/html')).toBe('çalışma')
    expect(decodeHtml(Buffer.from('çalışma'), 'text/html; charset=x-weird')).toBe('çalışma')
  })
})

describe('the transport is only ever called through the guard', () => {
  it('calls the injected transport and nothing else', async () => {
    const spy = vi.fn(async () => html())
    await fetcherFor(spy as unknown as ScanGet).fetchPage(new URL('https://example.com/'))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
