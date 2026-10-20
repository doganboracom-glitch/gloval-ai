import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(),
  checkLimit: vi.fn(),
  upload: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mail/admin-guard', () => ({
  getAdminUser: mocks.getAdminUser,
  requireAdminResponse: async () => new Response(JSON.stringify({ error: 'not_found' }), { status: 404 }),
}))
vi.mock('@/lib/blog-admin-limit', () => ({ checkBlogAdminLimit: mocks.checkLimit }))
vi.mock('@/lib/blog-audit', () => ({ recordBlogAudit: mocks.audit }))
vi.mock('@/lib/image-storage', () => ({
  BUCKET: 'site-images',
  ensureBucket: vi.fn(async () => {}),
  persistImageDataUri: vi.fn(),
}))
vi.mock('@/lib/image-provider', () => ({
  getImageProvider: vi.fn(),
  imageGenerationAvailable: () => false,
}))
vi.mock('@/lib/blog-cover-inspect', () => ({ inspectCover: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        upload: mocks.upload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  }),
}))

import { POST } from './route'

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function uploadRequest(bytes: Uint8Array, name: string, type: string) {
  const form = new FormData()
  form.append('file', new File([bytes as BlobPart], name, { type }))
  return new Request('http://localhost/api/admin/blog/cover', { method: 'POST', body: form })
}

function png(total = 128) {
  const bytes = new Uint8Array(total)
  bytes.set(PNG_HEAD)
  return bytes
}

describe('POST /api/admin/blog/cover (upload)', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.getAdminUser.mockResolvedValue({ userId: 'u-1', email: 'admin@example.com' })
    mocks.checkLimit.mockResolvedValue({ allowed: true })
    mocks.upload.mockResolvedValue({ error: null })
    mocks.audit.mockResolvedValue(undefined)
  })

  it('rejects a non-admin before reading the body', async () => {
    mocks.getAdminUser.mockResolvedValue(null)
    const res = await POST(uploadRequest(png(), 'a.png', 'image/png'))
    expect(res.status).toBe(404)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('answers 429 with Retry-After when the upload limit is exhausted', async () => {
    mocks.checkLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 })
    const res = await POST(uploadRequest(png(), 'a.png', 'image/png'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('refuses when the counter cannot be reached (fails closed)', async () => {
    mocks.checkLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 })
    const res = await POST(uploadRequest(png(), 'a.png', 'image/png'))
    expect(res.status).toBe(429)
  })

  it('rejects a file with a spoofed image MIME type (415)', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    const res = await POST(uploadRequest(html, 'evil.png', 'image/png'))
    expect(res.status).toBe(415)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects SVG (415)', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>')
    const res = await POST(uploadRequest(svg, 'logo.svg', 'image/svg+xml'))
    expect(res.status).toBe(415)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('rejects files over 5 MB (413)', async () => {
    const res = await POST(uploadRequest(png(5 * 1024 * 1024 + 1), 'big.png', 'image/png'))
    expect(res.status).toBe(413)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('stores a real image under a random name with the sniffed type, ignoring the client file name', async () => {
    const res = await POST(uploadRequest(png(), '../../evil.php', 'application/x-php'))
    expect(res.status).toBe(200)
    const json = (await res.json()) as { path: string }
    expect(json.path).toMatch(/^blog\/[0-9a-f-]{36}\.png$/)
    expect(mocks.upload).toHaveBeenCalledWith(json.path, expect.any(Uint8Array), expect.objectContaining({ contentType: 'image/png' }))
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'media.upload' }))
  })
})
