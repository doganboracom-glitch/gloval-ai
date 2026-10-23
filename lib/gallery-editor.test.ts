import { describe, expect, it, vi } from 'vitest'
import { guardEdit } from './edit-guard'
import { GALLERY_IMAGES_MAX } from './list-limits'
import { checkPublishable } from './publish-gate'
import { applyOperation, type EditOperation } from './website-edit-operations'
import { normalizeWebsiteSchema } from './website-schema-compat'
import { websiteSchema, type WebsiteSchema } from './website-schema'
import {
  GALLERY_UPLOAD_MAX_BYTES,
  isGalleryAltMissing,
  sortGalleryUploads,
  suggestGalleryAlt,
  validateGalleryUpload,
} from './gallery-editor'
import { COVER_MAX_BYTES, fetchGalleryVideoCover } from './gallery-video-cover'

const GALLERY = 2
const YT = 'dQw4w9WgXcQ'
type Gallery = Extract<WebsiteSchema['sections'][number], { type: 'gallery' }>

function site(items: Record<string, unknown>[]): WebsiteSchema {
  return {
    meta: {
      name: 'DB Ajans',
      tagline: 'Reklam',
      description: 'Bir reklam ajansı',
      tone: 'Samimi',
      audience: 'KOBİ',
      language: 'tr',
    },
    theme: {
      mode: 'light',
      radius: 'medium',
      palette: [
        { name: 'Ana', hex: '#2563eb' },
        { name: 'Zemin', hex: '#ffffff' },
        { name: 'Metin', hex: '#111827' },
      ],
    },
    typography: { headingFont: 'Inter', bodyFont: 'Inter' },
    navigation: { logoText: 'DB', links: [{ label: 'Ana Sayfa', href: '/' }] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'DB Ajans', description: 'Açıklama' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      { type: 'gallery', title: 'Galeri', items },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

const gallery = (s: WebsiteSchema) => s.sections[GALLERY] as Gallery
const photo = (n: number) => ({ src: `https://example.com/${n}.jpg`, alt: `Foto ${n}` })

function run(s: WebsiteSchema, ...ops: EditOperation[]): WebsiteSchema {
  return ops.reduce((acc, op) => {
    const next = applyOperation(acc, op)
    expect(guardEdit(acc, next)).toEqual({ ok: true })
    return next
  }, s)
}

describe('upload rules', () => {
  it('accepts png, jpg and webp up to 5 MB only', () => {
    expect(validateGalleryUpload({ type: 'image/png', size: 100 })).toBeNull()
    expect(validateGalleryUpload({ type: 'image/jpeg', size: GALLERY_UPLOAD_MAX_BYTES })).toBeNull()
    expect(validateGalleryUpload({ type: 'image/webp', size: 100 })).toBeNull()
    expect(validateGalleryUpload({ type: 'image/gif', size: 100 })).toBe('type')
    expect(validateGalleryUpload({ type: 'image/svg+xml', size: 100 })).toBe('type')
    expect(validateGalleryUpload({ type: 'image/png', size: GALLERY_UPLOAD_MAX_BYTES + 1 })).toBe('size')
  })

  it('sorts a multi-file pick into accepted and refused files', () => {
    const files = [
      { name: 'a.png', type: 'image/png', size: 10 },
      { name: 'b.gif', type: 'image/gif', size: 10 },
      { name: 'c.jpg', type: 'image/jpeg', size: GALLERY_UPLOAD_MAX_BYTES + 1 },
      { name: 'd.webp', type: 'image/webp', size: 10 },
      { name: 'e.png', type: 'image/png', size: 10 },
    ]
    const { accepted, rejected } = sortGalleryUploads(files, 2)
    expect(accepted.map((f) => f.name)).toEqual(['a.png', 'd.webp'])
    expect(rejected.map((r) => [r.file.name, r.problem])).toEqual([
      ['b.gif', 'type'],
      ['c.jpg', 'size'],
      ['e.png', 'full'],
    ])
  })
})

describe('multi image upload', () => {
  it('adds several photos in a single undoable step, with suggested alt text and no imagePrompt', () => {
    const before = site([photo(1)])
    const after = run(before, {
      op: 'addGalleryImages',
      index: GALLERY,
      images: [{ src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,BBBB', alt: 'Ofisimiz' }],
    })
    const items = gallery(after).items
    expect(items).toHaveLength(3)
    expect(items[1].alt).toBe('DB Ajans - fotoğraf 2')
    expect(items[2].alt).toBe('Ofisimiz')
    expect(items.every((i) => i.album === undefined && !('imagePrompt' in i && i.imagePrompt))).toBe(true)
    expect(gallery(before).items).toHaveLength(1)
    expect(websiteSchema.safeParse(after).success).toBe(true)
    expect(checkPublishable(after)).toEqual({ ok: true })
  })

  it('skips photos beyond the 60-image limit and ignores unusable sources', () => {
    const full = site(Array.from({ length: GALLERY_IMAGES_MAX - 1 }, (_, i) => photo(i)))
    const after = run(full, {
      op: 'addGalleryImages',
      index: GALLERY,
      images: [{ src: 'data:image/png;base64,AAAA' }, { src: 'data:image/png;base64,BBBB' }, { src: '' }],
    })
    expect(gallery(after).items).toHaveLength(GALLERY_IMAGES_MAX)
  })

  it('puts a photo into an existing album and falls back to Genel for an unknown one', () => {
    const s = run(site([photo(1)]), { op: 'addAlbum', index: GALLERY, name: 'Firmamızdan Kareler' })
    const after = run(s, {
      op: 'addGalleryImages',
      index: GALLERY,
      images: [
        { src: 'data:image/png;base64,AAAA', album: 'firmamızdan kareler' },
        { src: 'data:image/png;base64,BBBB', album: 'Yok' },
      ],
    })
    expect(gallery(after).items[1].album).toBe('Firmamızdan Kareler')
    expect(gallery(after).items[2].album).toBeUndefined()
  })

  it('suggests alt text from the album when there is one and reports a missing alt', () => {
    expect(suggestGalleryAlt({ businessName: 'DB Ajans', album: 'Ofis' }, 0)).toBe('DB Ajans - Ofis - fotoğraf 1')
    expect(suggestGalleryAlt({}, 1, 'en')).toBe('Gallery photo - photo 2')
    expect(isGalleryAltMissing({})).toBe(true)
    expect(isGalleryAltMissing({ alt: '  ' })).toBe(true)
    expect(isGalleryAltMissing({ alt: 'Ofis' })).toBe(false)
  })
})

describe('video cover download', () => {
  const jpeg = (bytes = 64) =>
    new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'image/jpeg' } })

  it('downloads the YouTube thumbnail on the server and stores it', async () => {
    const fetchImpl = vi.fn(async (..._args: unknown[]) => jpeg())
    const persist = vi.fn(async (..._args: unknown[]) => 'https://storage.example.com/cover.jpg')
    const cover = await fetchGalleryVideoCover(`https://youtu.be/${YT}`, { fetchImpl: fetchImpl as never, persist })
    expect(cover).toEqual({ src: 'https://storage.example.com/cover.jpg' })
    expect(String(fetchImpl.mock.calls[0][0])).toBe(`https://i.ytimg.com/vi/${YT}/maxresdefault.jpg`)
    expect(persist.mock.calls[0][0]).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('falls back to the smaller thumbnail when the large one is missing', async () => {
    const fetchImpl = vi.fn(async (input: unknown) =>
      String(input).endsWith('maxresdefault.jpg') ? new Response('', { status: 404 }) : jpeg(),
    )
    const cover = await fetchGalleryVideoCover(`https://youtu.be/${YT}`, {
      fetchImpl: fetchImpl as never,
      persist: async () => 'stored',
    })
    expect(cover).toEqual({ src: 'stored' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns null (themed fallback card) on a network error, a bad type, an oversized file or a storage failure', async () => {
    const persist = vi.fn(async () => 'stored')
    const boom = vi.fn(async () => {
      throw new Error('network')
    })
    expect(await fetchGalleryVideoCover(`https://youtu.be/${YT}`, { fetchImpl: boom as never, persist })).toBeNull()

    const html = vi.fn(async () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } }))
    expect(await fetchGalleryVideoCover(`https://youtu.be/${YT}`, { fetchImpl: html as never, persist })).toBeNull()

    const big = vi.fn(async () => jpeg(COVER_MAX_BYTES + 1))
    expect(await fetchGalleryVideoCover(`https://youtu.be/${YT}`, { fetchImpl: big as never, persist })).toBeNull()

    const ok = vi.fn(async () => jpeg())
    const failing = vi.fn(async () => {
      throw new Error('storage')
    })
    expect(await fetchGalleryVideoCover(`https://youtu.be/${YT}`, { fetchImpl: ok as never, persist: failing })).toBeNull()
    expect(persist).not.toHaveBeenCalled()
  })

  it('never contacts anything for an invalid address or for Vimeo', async () => {
    const fetchImpl = vi.fn(async () => jpeg())
    const deps = { fetchImpl: fetchImpl as never, persist: async () => 'stored' }
    expect(await fetchGalleryVideoCover('https://youtube.com.evil.com/watch?v=' + YT, deps)).toBeNull()
    expect(await fetchGalleryVideoCover('https://vimeo.com/424242', deps)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('a video without a cover is valid and publishable (fallback card)', () => {
    const after = run(site([photo(1)]), { op: 'addVideo', index: GALLERY, url: `https://youtu.be/${YT}`, name: 'Demo 1' })
    const video = gallery(after).videos?.[0]
    expect(video?.name).toBe('Demo 1')
    expect(video?.cover).toBeUndefined()
    expect(checkPublishable(after)).toEqual({ ok: true })
  })
})

describe('backward compatibility (dbajans-like site)', () => {
  const legacy = () =>
    site([
      { caption: 'Stand', imagePrompt: 'Fuar standı', src: 'https://example.com/a.jpg', alt: 'Stand', aspectRatio: '4/3' },
      { caption: 'Ofis', imagePrompt: 'Ofis', src: 'https://example.com/b.jpg' },
    ])

  it('parses, normalizes and publishes without albums, videos or alt text', () => {
    const raw = JSON.parse(JSON.stringify(legacy()))
    const result = normalizeWebsiteSchema(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const normalized = result.value as WebsiteSchema
    expect(websiteSchema.safeParse(normalized).success).toBe(true)
    expect(checkPublishable(normalized)).toEqual({ ok: true })
    const g = gallery(normalized)
    expect(g.albums ?? []).toEqual([])
    expect(g.videos ?? []).toEqual([])
  })

  it('unrelated edits leave the gallery data byte-for-byte untouched', () => {
    const before = legacy()
    const after = run(before, { op: 'updateSectionValue', index: 0, field: 'title', value: 'Yeni' })
    expect(JSON.stringify(gallery(after))).toBe(JSON.stringify(gallery(before)))
  })

  it('new features layer on top of legacy items and undo restores them exactly', () => {
    const before = legacy()
    const snapshot = JSON.stringify(before)
    const ops: EditOperation[] = [
      { op: 'addAlbum', index: GALLERY, name: 'Firmamızdan Kareler' },
      { op: 'setImageAlbum', index: GALLERY, itemIndex: 0, albumId: 'alb-1' },
      { op: 'addGalleryImages', index: GALLERY, images: [{ src: 'data:image/png;base64,AAAA' }] },
      { op: 'addVideo', index: GALLERY, url: `https://youtu.be/${YT}`, name: 'Demo 1' },
    ]
    const states = [before]
    for (const op of ops) states.push(run(states[states.length - 1], op))
    expect(JSON.stringify(before)).toBe(snapshot)
    // Redo from the start rebuilds identical states.
    let replay = states[0]
    ops.forEach((op, i) => {
      replay = applyOperation(replay, op)
      expect(replay).toEqual(states[i + 1])
    })
    expect(checkPublishable(states[states.length - 1])).toEqual({ ok: true })
  })
})
