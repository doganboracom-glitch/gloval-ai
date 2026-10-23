import type { Section } from '@/lib/website-schema'
import { slugify } from '@/lib/slug'
import { isUsableImageSrc } from '@/lib/about-media'
import { parseGalleryVideoUrl } from '@/lib/gallery-video'
import {
  GALLERY_ALBUMS_MAX,
  GALLERY_ALBUM_NAME_MAX,
  GALLERY_VIDEOS_MAX,
  GALLERY_VIDEO_NAME_MAX,
} from '@/lib/list-limits'

/**
 * Gallery albums and videos
 * -------------------------
 * An image keeps its album as plain text (`item.album`); empty or unknown means the implicit "Genel"
 * album, which is never stored in `albums`, cannot be renamed and cannot be removed. Albums carry a stable
 * `id`, an automatic unique `slug`, and the slugs they used before a rename (`previousSlugs`) so old links
 * can be redirected. Pure: no I/O, shared by the edit operations and the editor.
 */

export type GallerySection = Extract<Section, { type: 'gallery' }>
export type GalleryAlbum = NonNullable<GallerySection['albums']>[number]
export type GalleryVideo = NonNullable<GallerySection['videos']>[number]

export const GENERAL_ALBUM = 'Genel'
export const GENERAL_ALBUM_SLUG = 'genel'
const PREVIOUS_SLUGS_MAX = 20

export type GalleryError =
  | 'empty'
  | 'duplicate'
  | 'reserved'
  | 'full'
  | 'missing'
  | 'invalid_url'
  | 'invalid_cover'
export type GalleryResult = { ok: true; section: GallerySection } | { ok: false; error: GalleryError }

const fail = (error: GalleryError): GalleryResult => ({ ok: false, error })

export function cleanAlbumName(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, GALLERY_ALBUM_NAME_MAX)
}

/** Case- and diacritic-insensitive identity behind the "unique name" rule. */
export function albumKey(name: string | undefined | null): string {
  return cleanAlbumName(name)
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
}

const GENERAL_KEY = albumKey(GENERAL_ALBUM)

/** True for an empty album value and for "Genel" in any letter case. */
export function isGeneralAlbum(name: string | undefined | null): boolean {
  const key = albumKey(name)
  return key === '' || key === GENERAL_KEY
}

/** The album an image really belongs to: a listed album's name, otherwise "Genel". */
export function imageAlbumName(section: Pick<GallerySection, 'albums'>, album: string | undefined): string {
  if (isGeneralAlbum(album)) return GENERAL_ALBUM
  const key = albumKey(album)
  return (section.albums ?? []).find((a) => albumKey(a.name) === key)?.name ?? GENERAL_ALBUM
}

/** Images per album name, "Genel" first. */
export function albumImageCounts(section: Pick<GallerySection, 'albums' | 'items'>): { name: string; count: number }[] {
  const names = [GENERAL_ALBUM, ...(section.albums ?? []).map((a) => a.name)]
  return names.map((name) => ({
    name,
    count: section.items.filter((item) => imageAlbumName(section, item.album) === name).length,
  }))
}

/** Looks an old or current slug up; returns the album that owns it now. */
export function findAlbumBySlug(section: Pick<GallerySection, 'albums'>, slug: string): GalleryAlbum | undefined {
  const albums = section.albums ?? []
  return albums.find((a) => a.slug === slug) ?? albums.find((a) => a.previousSlugs?.includes(slug))
}

function withAlbums(section: GallerySection, albums: GalleryAlbum[]): GallerySection {
  const { albums: _old, ...rest } = section
  return albums.length > 0 ? { ...rest, albums } : rest
}

function withVideos(section: GallerySection, videos: GalleryVideo[]): GallerySection {
  const { videos: _old, ...rest } = section
  return videos.length > 0 ? { ...rest, videos } : rest
}

function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used)
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`
    if (!taken.has(id)) return id
  }
}

/** Slug from the name, made unique against every other album's slug and old slugs. */
function uniqueSlug(name: string, others: readonly GalleryAlbum[]): string {
  const taken = new Set<string>([GENERAL_ALBUM_SLUG])
  for (const a of others) {
    taken.add(a.slug)
    for (const s of a.previousSlugs ?? []) taken.add(s)
  }
  const base = slugify(name).slice(0, 56) || 'album'
  let slug = base
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`
  return slug
}

function nameProblem(name: string, others: readonly GalleryAlbum[]): GalleryError | null {
  if (!name) return 'empty'
  const key = albumKey(name)
  if (key === GENERAL_KEY) return 'reserved'
  if (others.some((a) => albumKey(a.name) === key)) return 'duplicate'
  return null
}

/* -------------------------------------------------------------------------- */
/*  Albums                                                                    */
/* -------------------------------------------------------------------------- */

export function addAlbum(section: GallerySection, rawName: string): GalleryResult {
  const albums = section.albums ?? []
  const name = cleanAlbumName(rawName)
  const problem = nameProblem(name, albums)
  if (problem) return fail(problem)
  if (albums.length >= GALLERY_ALBUMS_MAX) return fail('full')
  const album: GalleryAlbum = {
    id: nextId('alb', albums.map((a) => a.id)),
    name,
    slug: uniqueSlug(name, albums),
    previousSlugs: [],
  }
  return { ok: true, section: withAlbums(section, [...albums, album]) }
}

export function renameAlbum(section: GallerySection, albumId: string, rawName: string): GalleryResult {
  const albums = section.albums ?? []
  const current = albums.find((a) => a.id === albumId)
  if (!current) return fail('missing')
  const name = cleanAlbumName(rawName)
  const others = albums.filter((a) => a.id !== albumId)
  const problem = nameProblem(name, others)
  if (problem) return fail(problem)
  if (name === current.name) return { ok: true, section }

  const slug = uniqueSlug(name, others)
  const previous = (current.previousSlugs ?? []).filter((s) => s !== slug)
  const previousSlugs =
    slug === current.slug
      ? previous
      : [...previous.filter((s) => s !== current.slug), current.slug].slice(-PREVIOUS_SLUGS_MAX)

  const oldKey = albumKey(current.name)
  const items = section.items.map((item) =>
    item.album !== undefined && albumKey(item.album) === oldKey ? { ...item, album: name } : item,
  )
  const renamed = albums.map((a) => (a.id === albumId ? { ...a, name, slug, previousSlugs } : a))
  return { ok: true, section: withAlbums({ ...section, items }, renamed) }
}

export function moveAlbum(section: GallerySection, albumId: string, direction: 'up' | 'down'): GalleryResult {
  const albums = [...(section.albums ?? [])]
  const from = albums.findIndex((a) => a.id === albumId)
  if (from < 0) return fail('missing')
  const to = from + (direction === 'up' ? -1 : 1)
  if (to < 0 || to >= albums.length) return { ok: true, section }
  ;[albums[from], albums[to]] = [albums[to], albums[from]]
  return { ok: true, section: withAlbums(section, albums) }
}

/** Removes the album; its images move to "Genel". */
export function removeAlbum(section: GallerySection, albumId: string): GalleryResult {
  const albums = section.albums ?? []
  const target = albums.find((a) => a.id === albumId)
  if (!target) return fail('missing')
  const key = albumKey(target.name)
  const items = section.items.map((item) => {
    if (item.album === undefined || albumKey(item.album) !== key) return item
    const { album: _album, ...rest } = item
    return rest
  })
  return { ok: true, section: withAlbums({ ...section, items }, albums.filter((a) => a.id !== albumId)) }
}

/** `albumId` undefined (or empty) puts the image into "Genel". */
export function setImageAlbum(section: GallerySection, itemIndex: number, albumId: string | undefined): GalleryResult {
  const item = section.items[itemIndex]
  if (!item) return fail('missing')
  let album: string | undefined
  if (albumId) {
    const target = (section.albums ?? []).find((a) => a.id === albumId)
    if (!target) return fail('missing')
    album = target.name
  }
  const { album: _album, ...rest } = item
  const next = album === undefined ? rest : { ...rest, album }
  const items = section.items.map((it, i) => (i === itemIndex ? next : it))
  return { ok: true, section: { ...section, items } }
}

/* -------------------------------------------------------------------------- */
/*  Videos                                                                    */
/* -------------------------------------------------------------------------- */

export function cleanVideoName(raw: string | undefined | null): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim().slice(0, GALLERY_VIDEO_NAME_MAX)
}

type CoverInput = { src: string; alt?: string }

function cleanCover(cover: CoverInput): GalleryVideo['cover'] | null {
  if (!isUsableImageSrc(cover.src)) return null
  const alt = (cover.alt ?? '').trim()
  return alt ? { src: cover.src.trim(), alt } : { src: cover.src.trim() }
}

export function addVideo(
  section: GallerySection,
  input: { url: string; name?: string; cover?: CoverInput },
  defaultName: (n: number) => string,
): GalleryResult {
  const videos = section.videos ?? []
  if (videos.length >= GALLERY_VIDEOS_MAX) return fail('full')
  const ref = parseGalleryVideoUrl(input.url)
  if (!ref) return fail('invalid_url')
  let cover: GalleryVideo['cover']
  if (input.cover) {
    const cleaned = cleanCover(input.cover)
    if (!cleaned) return fail('invalid_cover')
    cover = cleaned
  }
  const video: GalleryVideo = {
    id: nextId('vid', videos.map((v) => v.id)),
    name: cleanVideoName(input.name) || defaultName(videos.length + 1),
    url: ref.watchUrl,
    provider: ref.provider,
    videoId: ref.videoId,
    ...(cover ? { cover } : {}),
  }
  return { ok: true, section: withVideos(section, [...videos, video]) }
}

export function updateVideo(
  section: GallerySection,
  id: string,
  patch: { name?: string; url?: string; cover?: CoverInput | null },
): GalleryResult {
  const videos = section.videos ?? []
  const current = videos.find((v) => v.id === id)
  if (!current) return fail('missing')
  const next: GalleryVideo = { ...current }

  if (patch.url !== undefined) {
    const ref = parseGalleryVideoUrl(patch.url)
    if (!ref) return fail('invalid_url')
    next.url = ref.watchUrl
    next.provider = ref.provider
    next.videoId = ref.videoId
  }
  if (patch.name !== undefined) {
    const name = cleanVideoName(patch.name)
    if (!name) return fail('empty')
    next.name = name
  }
  if (patch.cover === null) {
    delete next.cover
  } else if (patch.cover) {
    const cleaned = cleanCover(patch.cover)
    if (!cleaned) return fail('invalid_cover')
    next.cover = cleaned
  }
  return { ok: true, section: withVideos(section, videos.map((v) => (v.id === id ? next : v))) }
}

export function moveVideo(section: GallerySection, id: string, direction: 'up' | 'down'): GalleryResult {
  const videos = [...(section.videos ?? [])]
  const from = videos.findIndex((v) => v.id === id)
  if (from < 0) return fail('missing')
  const to = from + (direction === 'up' ? -1 : 1)
  if (to < 0 || to >= videos.length) return { ok: true, section }
  ;[videos[from], videos[to]] = [videos[to], videos[from]]
  return { ok: true, section: withVideos(section, videos) }
}

export function removeVideo(section: GallerySection, id: string): GalleryResult {
  const videos = section.videos ?? []
  if (!videos.some((v) => v.id === id)) return fail('missing')
  return { ok: true, section: withVideos(section, videos.filter((v) => v.id !== id)) }
}
