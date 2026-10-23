import { describe, expect, it } from 'vitest'
import { guardEdit } from './edit-guard'
import { GALLERY_ALBUMS_MAX, GALLERY_IMAGES_MAX, GALLERY_VIDEOS_MAX } from './list-limits'
import { checkPublishable } from './publish-gate'
import { applyOperation, type EditOperation } from './website-edit-operations'
import { normalizeWebsiteSchema } from './website-schema-compat'
import { websiteSchema, type WebsiteSchema } from './website-schema'

const YT = 'dQw4w9WgXcQ'
const GALLERY = 2

type Gallery = Extract<WebsiteSchema['sections'][number], { type: 'gallery' }>

function site(items?: Record<string, unknown>[]): WebsiteSchema {
  return {
    meta: {
      name: 'Studio',
      tagline: 'Tasarım',
      description: 'Bir tasarım stüdyosu',
      tone: 'Sakin',
      audience: 'Ev sahipleri',
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
    navigation: { logoText: 'Studio', links: [{ label: 'Ana Sayfa', href: '/' }] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'Studio', description: 'Açıklama' },
      { type: 'about', title: 'Hakkımızda', body: 'Metin' },
      {
        type: 'gallery',
        title: 'Galeri',
        items: items ?? [
          { src: 'https://example.com/a.jpg', alt: 'A' },
          { src: 'https://example.com/b.jpg', alt: 'B' },
          { src: 'https://example.com/c.jpg', alt: 'C' },
        ],
      },
      { type: 'footer' },
    ],
  } as unknown as WebsiteSchema
}

const gallery = (s: WebsiteSchema) => s.sections[GALLERY] as Gallery

function run(s: WebsiteSchema, ...ops: EditOperation[]): WebsiteSchema {
  return ops.reduce((acc, op) => {
    const next = applyOperation(acc, op)
    expect(guardEdit(acc, next)).toEqual({ ok: true })
    return next
  }, s)
}

const addAlbum = (name: string): EditOperation => ({ op: 'addAlbum', index: GALLERY, name })

describe('uploaded gallery images without imagePrompt', () => {
  it('are valid for the schema, the publish gate and the normalizer', () => {
    const s = site()
    expect(websiteSchema.safeParse(s).success).toBe(true)
    expect(checkPublishable(s)).toEqual({ ok: true })
    const normalized = normalizeWebsiteSchema(s)
    expect(normalized.ok && normalized.repaired).toBe(false)
  })

  it('are not a problem for the edit guard, before or after an edit', () => {
    const s = site()
    const edited = applyOperation(s, { op: 'addItem', index: GALLERY })
    expect(guardEdit(s, edited)).toEqual({ ok: true })
    expect(guardEdit(null, s)).toEqual({ ok: true })
  })

  it('still accept images that do carry an imagePrompt', () => {
    const s = site([{ imagePrompt: 'Modern ofis', src: '/a.jpg' }])
    expect(checkPublishable(s)).toEqual({ ok: true })
  })

  it('leave a gallery without albums or videos with its stored shape', () => {
    const s = site()
    expect(JSON.parse(JSON.stringify(websiteSchema.parse(s)))).toEqual(JSON.parse(JSON.stringify(s)))
  })
})

describe('gallery limits', () => {
  it('allow 60 images and no more', () => {
    const many = (n: number) => site(Array.from({ length: n }, (_, i) => ({ src: `/i${i}.jpg` })))
    expect(GALLERY_IMAGES_MAX).toBe(60)
    expect(websiteSchema.safeParse(many(60)).success).toBe(true)
    expect(websiteSchema.safeParse(many(61)).success).toBe(false)
    const full = many(60)
    expect(gallery(applyOperation(full, { op: 'addItem', index: GALLERY })).items).toHaveLength(60)
  })

  it('allow 12 albums and 12 videos and no more', () => {
    expect(GALLERY_ALBUMS_MAX).toBe(12)
    expect(GALLERY_VIDEOS_MAX).toBe(12)
    let s = site()
    for (let i = 1; i <= 14; i++) s = applyOperation(s, addAlbum(`Albüm ${i}`))
    expect(gallery(s).albums).toHaveLength(12)
    for (let i = 0; i < 14; i++) {
      s = applyOperation(s, { op: 'addVideo', index: GALLERY, url: `https://vimeo.com/${100000 + i}` })
    }
    expect(gallery(s).videos).toHaveLength(12)
    expect(guardEdit(null, s)).toEqual({ ok: true })
  })
})

describe('albums', () => {
  it('addAlbum creates an id and an automatic slug', () => {
    const s = run(site(), addAlbum('  Düğün   Çekimi  '))
    const [album] = gallery(s).albums!
    expect(album).toMatchObject({ name: 'Düğün Çekimi', slug: 'dugun-cekimi', previousSlugs: [] })
    expect(album.id).toBeTruthy()
  })

  it('names are at most 40 characters', () => {
    const s = applyOperation(site(), addAlbum('x'.repeat(60)))
    expect(gallery(s).albums![0].name).toHaveLength(40)
    expect(guardEdit(null, s)).toEqual({ ok: true })
  })

  it('names are unique regardless of case and diacritics', () => {
    const s = run(site(), addAlbum('Mutfak'))
    for (const dup of ['mutfak', 'MUTFAK', ' Mutfak ']) {
      expect(gallery(applyOperation(s, addAlbum(dup))).albums).toHaveLength(1)
    }
    const i = run(site(), addAlbum('Işık'))
    expect(gallery(applyOperation(i, addAlbum('ışık'))).albums).toHaveLength(1)
    expect(gallery(applyOperation(i, addAlbum('ISIK'))).albums).toHaveLength(1)
  })

  it('slugs stay unique when names differ only by punctuation', () => {
    const s = run(site(), addAlbum('Ev & Bahçe'), addAlbum('Ev - Bahçe'), addAlbum('Ev / Bahçe'))
    const slugs = gallery(s).albums!.map((a) => a.slug)
    expect(new Set(slugs).size).toBe(3)
    expect(slugs[0]).toBe('ev-bahce')
  })

  it('"Genel" cannot be added, renamed to, renamed or removed', () => {
    const base = run(site(), addAlbum('Mutfak'))
    for (const name of ['Genel', 'genel', 'GENEL', '  Genel ']) {
      expect(gallery(applyOperation(base, addAlbum(name))).albums).toHaveLength(1)
    }
    const id = gallery(base).albums![0].id
    const toGeneral = applyOperation(base, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Genel' })
    expect(gallery(toGeneral).albums![0].name).toBe('Mutfak')
    // "Genel" has no stored entry, so no id can ever address it.
    const rename = applyOperation(base, { op: 'renameAlbum', index: GALLERY, albumId: 'genel', name: 'Başka' })
    expect(gallery(rename)).toEqual(gallery(base))
    const remove = applyOperation(base, { op: 'removeAlbum', index: GALLERY, albumId: 'genel' })
    expect(gallery(remove)).toEqual(gallery(base))
  })

  it('an album can never take the reserved "genel" slug', () => {
    const s = applyOperation(site(), addAlbum('Genel!'))
    expect(gallery(s).albums![0].slug).not.toBe('genel')
  })

  it('renameAlbum moves the old slug to previousSlugs and follows the images', () => {
    let s = run(site(), addAlbum('Mutfak'))
    const id = gallery(s).albums![0].id
    s = run(s, { op: 'setImageAlbum', index: GALLERY, itemIndex: 1, albumId: id })
    s = run(s, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Yemek Odası' })
    const album = gallery(s).albums![0]
    expect(album).toMatchObject({ id, name: 'Yemek Odası', slug: 'yemek-odasi', previousSlugs: ['mutfak'] })
    expect(gallery(s).items[1].album).toBe('Yemek Odası')
    s = run(s, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Salon' })
    expect(gallery(s).albums![0].previousSlugs).toEqual(['mutfak', 'yemek-odasi'])
  })

  it('renaming back reclaims the old slug without keeping it as previous', () => {
    let s = run(site(), addAlbum('Mutfak'))
    const id = gallery(s).albums![0].id
    s = run(s, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Salon' })
    s = run(s, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Mutfak' })
    expect(gallery(s).albums![0]).toMatchObject({ slug: 'mutfak', previousSlugs: ['salon'] })
  })

  it('a retired slug is not handed to another album', () => {
    let s = run(site(), addAlbum('Mutfak'))
    const id = gallery(s).albums![0].id
    s = run(s, { op: 'renameAlbum', index: GALLERY, albumId: id, name: 'Salon' }, addAlbum('Mutfak'))
    const second = gallery(s).albums![1]
    expect(second.slug).toBe('mutfak-2')
  })

  it('renaming to a taken name changes nothing', () => {
    const s = run(site(), addAlbum('A'), addAlbum('B'))
    const [a] = gallery(s).albums!
    const same = applyOperation(s, { op: 'renameAlbum', index: GALLERY, albumId: a.id, name: 'b' })
    expect(gallery(same)).toEqual(gallery(s))
  })

  it('moveAlbum reorders and stops at the ends', () => {
    let s = run(site(), addAlbum('A'), addAlbum('B'), addAlbum('C'))
    const ids = gallery(s).albums!.map((a) => a.id)
    s = run(s, { op: 'moveAlbum', index: GALLERY, albumId: ids[2], direction: 'up' })
    expect(gallery(s).albums!.map((a) => a.name)).toEqual(['A', 'C', 'B'])
    const edge = applyOperation(s, { op: 'moveAlbum', index: GALLERY, albumId: ids[0], direction: 'up' })
    expect(gallery(edge).albums!.map((a) => a.name)).toEqual(['A', 'C', 'B'])
  })

  it('removeAlbum sends its images to Genel and leaves others alone', () => {
    let s = run(site(), addAlbum('A'), addAlbum('B'))
    const [a, b] = gallery(s).albums!
    s = run(
      s,
      { op: 'setImageAlbum', index: GALLERY, itemIndex: 0, albumId: a.id },
      { op: 'setImageAlbum', index: GALLERY, itemIndex: 1, albumId: b.id },
      { op: 'removeAlbum', index: GALLERY, albumId: a.id },
    )
    expect(gallery(s).albums!.map((x) => x.name)).toEqual(['B'])
    expect(gallery(s).items[0].album).toBeUndefined()
    expect(gallery(s).items[1].album).toBe('B')
    s = run(s, { op: 'removeAlbum', index: GALLERY, albumId: b.id })
    expect(gallery(s).albums).toBeUndefined()
  })

  it('setImageAlbum assigns, ignores unknown albums and returns to Genel', () => {
    let s = run(site(), addAlbum('A'))
    const id = gallery(s).albums![0].id
    s = run(s, { op: 'setImageAlbum', index: GALLERY, itemIndex: 0, albumId: id })
    expect(gallery(s).items[0].album).toBe('A')
    expect(gallery(applyOperation(s, { op: 'setImageAlbum', index: GALLERY, itemIndex: 0, albumId: 'nope' }))).toEqual(
      gallery(s),
    )
    expect(gallery(applyOperation(s, { op: 'setImageAlbum', index: GALLERY, itemIndex: 9, albumId: id }))).toEqual(
      gallery(s),
    )
    s = run(s, { op: 'setImageAlbum', index: GALLERY, itemIndex: 0 })
    expect(gallery(s).items[0].album).toBeUndefined()
  })

  it('album operations on a non-gallery section are ignored', () => {
    const s = site()
    expect(applyOperation(s, { op: 'addAlbum', index: 0, name: 'A' })).toEqual(s)
  })
})

describe('videos', () => {
  const add = (url: string, extra: Record<string, unknown> = {}): EditOperation =>
    ({ op: 'addVideo', index: GALLERY, url, ...extra }) as EditOperation

  it('addVideo derives provider, videoId and a canonical address', () => {
    const s = run(site(), add(`https://youtu.be/${YT}`, { name: 'Tanıtım' }), add('https://vimeo.com/123456'))
    const [yt, vi] = gallery(s).videos!
    expect(yt).toMatchObject({ name: 'Tanıtım', provider: 'youtube', videoId: YT })
    expect(yt.url).toBe(`https://www.youtube.com/watch?v=${YT}`)
    expect(vi).toMatchObject({ provider: 'vimeo', videoId: '123456', name: 'Video 2' })
    expect(yt.id).not.toBe(vi.id)
    expect(guardEdit(null, s)).toEqual({ ok: true })
  })

  it('addVideo rejects fake hosts and bad covers', () => {
    const s = site()
    expect(applyOperation(s, add(`https://youtube.com.evil.com/watch?v=${YT}`))).toEqual(s)
    expect(applyOperation(s, add(`https://youtube.com@evil.com/watch?v=${YT}`))).toEqual(s)
    expect(applyOperation(s, add(`https://youtu.be/${YT}`, { cover: { src: 'javascript:alert(1)' } }))).toEqual(s)
  })

  it('keeps an optional cover image', () => {
    const s = run(site(), add(`https://youtu.be/${YT}`, { cover: { src: '/cover.jpg', alt: ' Kapak ' } }))
    expect(gallery(s).videos![0].cover).toEqual({ src: '/cover.jpg', alt: 'Kapak' })
  })

  it('updateVideo changes name, address and cover and can clear the cover', () => {
    let s = run(site(), add(`https://youtu.be/${YT}`))
    const id = gallery(s).videos![0].id
    s = run(s, {
      op: 'updateVideo',
      index: GALLERY,
      id,
      name: 'Yeni',
      url: 'https://vimeo.com/987654',
      cover: { src: '/k.jpg' },
    })
    expect(gallery(s).videos![0]).toMatchObject({
      name: 'Yeni',
      provider: 'vimeo',
      videoId: '987654',
      url: 'https://vimeo.com/987654',
      cover: { src: '/k.jpg' },
    })
    s = run(s, { op: 'updateVideo', index: GALLERY, id, cover: null })
    expect(gallery(s).videos![0].cover).toBeUndefined()
  })

  it('updateVideo with a bad address or empty name changes nothing', () => {
    const s = run(site(), add(`https://youtu.be/${YT}`))
    const id = gallery(s).videos![0].id
    for (const patch of [{ url: 'https://evil.com/youtu.be/x' }, { name: '   ' }, { cover: { src: 'x' } }]) {
      expect(gallery(applyOperation(s, { op: 'updateVideo', index: GALLERY, id, ...patch }))).toEqual(gallery(s))
    }
  })

  it('moveVideo reorders and removeVideo drops the key when empty', () => {
    let s = run(site(), add('https://vimeo.com/111111', { name: 'A' }), add('https://vimeo.com/222222', { name: 'B' }))
    const [a, b] = gallery(s).videos!
    s = run(s, { op: 'moveVideo', index: GALLERY, id: b.id, direction: 'up' })
    expect(gallery(s).videos!.map((v) => v.name)).toEqual(['B', 'A'])
    s = run(s, { op: 'removeVideo', index: GALLERY, id: a.id }, { op: 'removeVideo', index: GALLERY, id: b.id })
    expect(gallery(s).videos).toBeUndefined()
  })

  it('a stored video with a fake host fails the schema', () => {
    const s = site()
    ;(s.sections[GALLERY] as unknown as { videos: unknown[] }).videos = [
      { id: 'v', name: 'X', url: 'https://youtube.com.evil.com/watch?v=' + YT, provider: 'youtube', videoId: YT },
    ]
    expect(websiteSchema.safeParse(s).success).toBe(false)
    expect(checkPublishable(s).ok).toBe(false)
  })
})

describe('undo and redo', () => {
  it('operations never mutate the previous schema, so a snapshot restores it exactly', () => {
    const before = site()
    const snapshot = JSON.stringify(before)
    const ops: EditOperation[] = [
      addAlbum('A'),
      { op: 'addVideo', index: GALLERY, url: `https://youtu.be/${YT}` },
      { op: 'setImageAlbum', index: GALLERY, itemIndex: 0, albumId: 'alb-1' },
      { op: 'renameAlbum', index: GALLERY, albumId: 'alb-1', name: 'B' },
      { op: 'removeAlbum', index: GALLERY, albumId: 'alb-1' },
    ]
    const history: WebsiteSchema[] = [before]
    for (const op of ops) history.push(applyOperation(history[history.length - 1], op))
    expect(JSON.stringify(before)).toBe(snapshot)
    // Undo to the start and redo forward: the same operations rebuild identical states.
    let replay = history[0]
    for (let i = 0; i < ops.length; i++) {
      replay = applyOperation(replay, ops[i])
      expect(replay).toEqual(history[i + 1])
    }
  })

  it('every intermediate state survives a JSON round trip and the publish gate', () => {
    let s = site()
    const ops: EditOperation[] = [
      addAlbum('A'),
      addAlbum('B'),
      { op: 'addVideo', index: GALLERY, url: 'https://vimeo.com/424242' },
      { op: 'setImageAlbum', index: GALLERY, itemIndex: 2, albumId: 'alb-2' },
    ]
    for (const op of ops) {
      s = applyOperation(s, op)
      const stored = JSON.parse(JSON.stringify(s))
      expect(checkPublishable(stored)).toEqual({ ok: true })
      expect(stored).toEqual(s)
    }
  })
})
