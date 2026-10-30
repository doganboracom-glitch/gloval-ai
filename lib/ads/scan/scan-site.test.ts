import { describe, expect, it } from 'vitest'
import { ScanFetchError } from './errors'
import type { ScanGet, ScanResponse } from './http'
import { pickExtraPages, scanSite } from './scan-site'

const res = (body: string, extra: Partial<ScanResponse> = {}): ScanResponse => ({
  status: 200,
  location: null,
  contentType: 'text/html; charset=utf-8',
  xRobotsTag: null,
  bytes: Buffer.from(body),
  truncated: false,
  ...extra,
})
const notFound: ScanResponse = { ...res(''), status: 404, bytes: Buffer.alloc(0) }

function site(pages: Record<string, ScanResponse | Error>) {
  const requested: string[] = []
  const httpGet: ScanGet = async (url) => {
    requested.push(url.href)
    const hit = pages[url.href]
    if (hit instanceof Error) throw hit
    return hit ?? notFound
  }
  return { httpGet, requested }
}

const HOME = `<html lang="tr"><head><title>Ege Nakliyat</title><meta name="description" content="İzmir evden eve nakliyat ve depolama hizmetleri."></head>
<body><header><nav><a href="/hakkimizda">Hakkımızda</a><a href="/hizmetler">Hizmetlerimiz</a><a href="/iletisim">İletişim</a><a href="https://baska.com/hizmet">Dış</a></nav></header>
<h1>Evden Eve Nakliyat</h1><p>${'Profesyonel ekip ile güvenli taşıma. '.repeat(10)}</p></body></html>`

const baseRoutes = () => ({
  'https://ornek.com/robots.txt': notFound,
  'https://ornek.com/': res(HOME),
  'https://ornek.com/hakkimizda': res('<title>Hakkımızda</title><h2>Biz kimiz</h2><p>1998 den beri İzmir de hizmet veriyoruz.</p>'),
  'https://ornek.com/hizmetler': res('<title>Hizmetler</title><p>Paketleme, depolama, asansörlü taşıma.</p>'),
  'https://ornek.com/iletisim': res('<title>İletişim</title><p>Bornova İzmir</p>'),
})

describe('scanSite', () => {
  it('builds a bounded snapshot from the home page and up to two extra pages', async () => {
    const t = site(baseRoutes())
    const result = await scanSite('Ornek.com', { httpGet: t.httpGet })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.snapshot).toMatchObject({
      host: 'ornek.com',
      finalHost: 'ornek.com',
      language: 'tr',
      title: 'Ege Nakliyat',
      headings: expect.arrayContaining(['Evden Eve Nakliyat', 'Biz kimiz']),
    })
    expect(result.snapshot.pages.map((p) => p.path)).toEqual(['/', '/hakkimizda', '/hizmetler'])
    expect(result.snapshot.text).toContain('Paketleme, depolama')
    expect(t.requested.filter((u) => !u.endsWith('robots.txt'))).toEqual([
      'https://ornek.com/',
      'https://ornek.com/hakkimizda',
      'https://ornek.com/hizmetler',
    ])
  })

  it('never follows links to other hosts, and never requests more than three pages', async () => {
    const t = site(baseRoutes())
    await scanSite('ornek.com', { httpGet: t.httpGet })
    expect(t.requested.some((u) => u.includes('baska.com'))).toBe(false)
    expect(t.requested.filter((u) => !u.endsWith('robots.txt'))).toHaveLength(3)
  })

  it('keeps the snapshot text within its budget', async () => {
    const big = `<title>x</title><p>${'kelime '.repeat(20_000)}</p>`
    const routes = { ...baseRoutes(), 'https://ornek.com/': res(HOME.replace('</body>', `${big}</body>`)) }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result.ok && result.snapshot.text.length).toBeLessThanOrEqual(6000)
  })

  it('returns plain strings only: no markup, no invisible characters', async () => {
    const injected = `<p>Normal metin\u200B\u202E<script>alert(1)</script>${String.fromCodePoint(0xe0041)}</p>`
    const routes = { ...baseRoutes(), 'https://ornek.com/': res(HOME.replace('</body>', `${injected}</body>`)) }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const everything = JSON.stringify(result.snapshot)
    expect(everything).not.toMatch(/<\/?[a-z]/i)
    expect(everything).not.toMatch(/[\u200B\u202E\u{E0000}-\u{E007F}]/u)
    expect(everything).not.toContain('alert(1)')
  })

  it('ignores an extra page that cannot be read', async () => {
    const routes = { ...baseRoutes(), 'https://ornek.com/hakkimizda': new ScanFetchError('TIMEOUT') }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result.ok && result.snapshot.pages.map((p) => p.path)).toEqual(['/', '/hizmetler'])
  })

  it('skips extra pages that ask not to be used', async () => {
    const routes = {
      ...baseRoutes(),
      'https://ornek.com/hakkimizda': res('<meta name="robots" content="noindex"><p>gizli</p>'),
    }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result.ok && result.snapshot.text).not.toContain('gizli')
  })

  it('records a cross-host redirect in finalHost', async () => {
    const routes = {
      'https://ornek.com/robots.txt': notFound,
      'https://ornek.com/': res('', { status: 301, location: 'https://www.ornek.com/', bytes: Buffer.alloc(0) }),
      'https://www.ornek.com/robots.txt': notFound,
      'https://www.ornek.com/': res(HOME),
    }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result.ok && result.snapshot.finalHost).toBe('www.ornek.com')
  })
})

describe('failures never reveal why', () => {
  const failures: Array<[string, Record<string, ScanResponse | Error>]> = [
    ['blocked address', { 'https://ornek.com/robots.txt': notFound, 'https://ornek.com/': new ScanFetchError('BLOCKED') }],
    ['dns / network', { 'https://ornek.com/robots.txt': notFound, 'https://ornek.com/': new ScanFetchError('NETWORK') }],
    ['timeout', { 'https://ornek.com/robots.txt': notFound, 'https://ornek.com/': new ScanFetchError('TIMEOUT') }],
    ['404', { 'https://ornek.com/robots.txt': notFound }],
    ['robots disallow', { 'https://ornek.com/robots.txt': res('User-agent: *\nDisallow: /', { contentType: 'text/plain' }) }],
    ['robots 5xx', { 'https://ornek.com/robots.txt': { ...notFound, status: 503 } }],
    ['not html', { 'https://ornek.com/robots.txt': notFound, 'https://ornek.com/': new ScanFetchError('BAD_CONTENT_TYPE') }],
    ['redirect to metadata', {
      'https://ornek.com/robots.txt': notFound,
      'https://ornek.com/': res('', { status: 302, location: 'http://169.254.169.254/', bytes: Buffer.alloc(0) }),
    }],
    ['noindex header', {
      'https://ornek.com/robots.txt': notFound,
      'https://ornek.com/': res(HOME, { xRobotsTag: 'noindex' }),
    }],
    ['noindex meta', {
      'https://ornek.com/robots.txt': notFound,
      'https://ornek.com/': res(HOME.replace('<head>', '<head><meta name="robots" content="noindex">')),
    }],
  ]

  it.each(failures)('%s -> the same generic "unreachable" code', async (_name, routes) => {
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result).toMatchObject({ ok: false, code: 'unreachable' })
  })

  it('rejects an address that is not a public site name before any request', async () => {
    for (const address of ['localhost', '127.0.0.1', 'http://169.254.169.254/', 'intranet', 'db.internal', 'https://a@b.com@c.com', '']) {
      const t = site({})
      const result = await scanSite(address, { httpGet: t.httpGet })
      expect(result).toMatchObject({ ok: false, code: 'invalid_address' })
      expect(t.requested).toEqual([])
    }
  })

  it('reports a page with nothing to read (a JavaScript-only shell) as insufficient content', async () => {
    const routes = {
      'https://ornek.com/robots.txt': notFound,
      'https://ornek.com/': res('<html><body><div id="root"></div><script src="/app.js"></script></body></html>'),
    }
    const result = await scanSite('ornek.com', { httpGet: site(routes).httpGet })
    expect(result).toMatchObject({ ok: false, code: 'insufficient_content' })
  })
})

describe('pickExtraPages', () => {
  const home = new URL('https://www.ornek.com/')
  const link = (href: string, label = '') => ({ href, label })

  it('prefers about, then services, then contact; at most two', () => {
    const picked = pickExtraPages(home, [link('/iletisim', 'İletişim'), link('/hizmetler', 'Hizmetler'), link('/hakkimizda', 'Hakkımızda')])
    expect(picked.map((u) => u.pathname)).toEqual(['/hakkimizda', '/hizmetler'])
  })

  it('stays on the same site (www tolerated), drops query / hash, unsafe schemes and file links', () => {
    const picked = pickExtraPages(home, [
      link('https://ornek.com/hakkimizda?x=1#top', 'Hakkımızda'),
      link('https://baska.com/hizmetler', 'Hizmetler'),
      link('javascript:alert(1)', 'Hizmetler'),
      link('mailto:a@b.c', 'İletişim'),
      link('/hizmetler.pdf', 'Hizmetler'),
    ])
    expect(picked.map((u) => u.href)).toEqual(['https://ornek.com/hakkimizda'])
  })

  it('matches words, not substrings', () => {
    expect(pickExtraPages(home, [link('/hakkimizda-ekibimiz', 'Blog')]).length).toBe(1)
    expect(pickExtraPages(home, [link('/hakkimizdaki-sorular', 'Blog')])).toEqual([])
    expect(pickExtraPages(home, [link('/uretim', 'Üretim')])).toEqual([])
  })
})
