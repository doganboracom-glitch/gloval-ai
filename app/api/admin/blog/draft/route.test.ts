import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkLimit: vi.fn(),
  generateText: vi.fn(),
  insert: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ updateTag: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/content/blog', () => ({ BLOG_CACHE_TAG: 'platform-blog' }))
vi.mock('@/lib/mail/admin-guard', () => ({
  getAdminUser: mocks.getAdminUser,
  requireAdminResponse: async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
}))
vi.mock('@/lib/blog-admin-limit', () => ({ checkBlogAdminLimit: mocks.checkLimit }))
vi.mock('@/lib/blog-audit', () => ({ recordBlogAudit: mocks.audit }))
vi.mock('ai', () => ({
  generateText: mocks.generateText,
  Output: { object: (spec: unknown) => spec },
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: unknown) => ({ select: () => ({ single: () => mocks.insert(row) }) }),
    }),
  }),
}))

import { POST } from './route'

const BODY = [
  '## Hedef kitleyi tanımlayın',
  'Web sitesi kurarken önce kimlere ulaşmak istediğinizi belirleyin. Sayfa yapısını bu kitlenin sorularına göre sade tutun.',
  '## Sayfa yapısı',
  '- Ana sayfada işletmenizi tek cümleyle anlatın.',
  '- İletişim bilgilerini her sayfadan ulaşılabilir bırakın.',
  'Düzenli olarak içeriği gözden geçirmek, sitenin güncel kalmasını sağlar. Küçük adımlarla ilerlemek çoğu zaman daha sürdürülebilirdir.',
].join('\n')

const request = (body: unknown) =>
  new Request('http://localhost/api/admin/blog/draft', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/admin/blog/draft', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.getAdminUser.mockResolvedValue({ userId: 'u-1', email: 'admin@example.com' })
    mocks.checkLimit.mockResolvedValue({ allowed: true })
    mocks.audit.mockResolvedValue(undefined)
    mocks.insert.mockResolvedValue({ data: { id: 'post-1' }, error: null })
    mocks.generateText.mockResolvedValue({
      output: {
        title: 'Küçük işletmeler için web sitesi',
        excerpt: 'Kısa özet.',
        body: BODY,
        seoTitle: 'Web sitesi rehberi',
        metaDescription: 'Küçük işletmeler için sade bir rehber.',
        tags: ['web sitesi'],
      },
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('rejects a non-admin without calling the model or touching the database', async () => {
    mocks.getAdminUser.mockResolvedValue(null)
    const res = await POST(request({ topic: 'Küçük işletmeler için web sitesi' }))
    expect(res.status).toBe(404)
    expect(mocks.generateText).not.toHaveBeenCalled()
    expect(mocks.checkLimit).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('answers 429 with a Retry-After header when the AI limit is exhausted', async () => {
    mocks.checkLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 120 })
    const res = await POST(request({ topic: 'Küçük işletmeler için web sitesi' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('120')
    expect(mocks.generateText).not.toHaveBeenCalled()
  })

  it('rejects an invalid topic', async () => {
    const res = await POST(request({ topic: 'ab' }))
    expect(res.status).toBe(400)
    expect(mocks.generateText).not.toHaveBeenCalled()
  })

  it('always saves the result as an unpublished draft, never published or scheduled', async () => {
    const res = await POST(request({ topic: 'Küçük işletmeler için web sitesi', keywords: 'web sitesi', status: 'published' }))
    expect(res.status).toBe(200)
    const row = mocks.insert.mock.calls[0][0] as Record<string, unknown>
    expect(row.status).toBe('draft')
    expect(row.published_at).toBeNull()
    expect(row.featured).toBe(false)
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'post.ai_draft', postId: 'post-1' }))
  })

  it('removes unverifiable claims from the saved body', async () => {
    mocks.generateText.mockResolvedValue({
      output: {
        title: 'Başlık',
        excerpt: '',
        body: `${BODY}\nSiteler %80 daha fazla ziyaret alır. Detay: https://example.com`,
        seoTitle: '',
        metaDescription: '',
        tags: [],
      },
    })
    await POST(request({ topic: 'Küçük işletmeler için web sitesi' }))
    const row = mocks.insert.mock.calls[0][0] as { body: string }
    expect(row.body).not.toMatch(/%80|https?:/)
  })

  it('retries with a suffixed slug on a collision and still saves a draft', async () => {
    mocks.insert
      .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate' } })
      .mockResolvedValueOnce({ data: { id: 'post-2' }, error: null })
    const res = await POST(request({ topic: 'Küçük işletmeler için web sitesi' }))
    expect(res.status).toBe(200)
    const [first, second] = mocks.insert.mock.calls.map((call) => call[0] as { slug: string; status: string })
    expect(second.slug).not.toBe(first.slug)
    expect(second.status).toBe('draft')
  })

  it('reports a model failure without saving anything', async () => {
    mocks.generateText.mockRejectedValue(new Error('gateway down'))
    const res = await POST(request({ topic: 'Küçük işletmeler için web sitesi' }))
    expect(res.status).toBe(502)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
