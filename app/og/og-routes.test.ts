import { describe, expect, it } from 'vitest'
import { GET as getPage } from './[page]/route'
import { GET as getPost } from './post/[slug]/route'
import { getPosts } from '@/lib/content/blog'

function pageRequest(page: string, query = '') {
  return getPage(new Request(`https://gloval.ai/og/${page}${query}`), {
    params: Promise.resolve({ page }),
  })
}

async function pngSize(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer())
  const signature = Array.from(bytes.slice(0, 8))
  const view = new DataView(bytes.buffer)
  return {
    signature,
    width: view.getUint32(16),
    height: view.getUint32(20),
    length: bytes.length,
  }
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

describe('/og/[page]', () => {
  for (const [page, query] of [
    ['home', ''],
    ['home', '?lang=en'],
    ['blog', ''],
    ['faq', ''],
    ['contact', '?lang=en'],
  ] as const) {
    it(`renders a 1200x630 PNG for ${page}${query}`, async () => {
      const res = await pageRequest(page, query)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      const size = await pngSize(res)
      expect(size.signature).toEqual(PNG_SIGNATURE)
      expect(size.width).toBe(1200)
      expect(size.height).toBe(630)
      expect(size.length).toBeGreaterThan(5_000)
    }, 30_000)
  }

  it('sends a short, shared-cache friendly Cache-Control', async () => {
    const res = await pageRequest('home')
    const cacheControl = res.headers.get('cache-control') ?? ''
    expect(cacheControl).toContain('public')
    const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1])
    expect(maxAge).toBeLessThanOrEqual(3600)
  }, 30_000)

  it('404s for unknown or prototype keys instead of rendering arbitrary text', async () => {
    expect((await pageRequest('admin')).status).toBe(404)
    expect((await pageRequest('constructor')).status).toBe(404)
  })
})

describe('/og/post/[slug]', () => {
  it('renders a 1200x630 PNG for a real post', async () => {
    const slug = (await getPosts())[0].slug
    const res = await getPost(new Request(`https://gloval.ai/og/post/${slug}`), {
      params: Promise.resolve({ slug }),
    })
    expect(res.status).toBe(200)
    const size = await pngSize(res)
    expect(size.width).toBe(1200)
    expect(size.height).toBe(630)
  }, 30_000)

  it('404s for an unknown slug', async () => {
    const res = await getPost(new Request('https://gloval.ai/og/post/nope'), {
      params: Promise.resolve({ slug: 'nope' }),
    })
    expect(res.status).toBe(404)
  })
})
