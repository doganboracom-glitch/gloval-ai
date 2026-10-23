import type { WebsiteSchema } from '@/lib/website-schema'
import { SITE_PAGE_HARD_CAP } from '@/lib/pricing-config'
import { isUsableImageSrc } from '@/lib/about-media'
import { uniquePageSlug } from '@/lib/page-slugs'
import {
  GENERAL_ALBUM,
  GENERAL_ALBUM_SLUG,
  findAlbumBySlug,
  imageAlbumName,
  isGeneralAlbum,
  type GallerySection,
} from '@/lib/gallery-albums'
import { parseGalleryVideoUrl, type GalleryVideoProvider } from '@/lib/gallery-video'

/**
 * Gallery pages
 * -------------
 * A site with a visible `gallery` section gets two system pages, both `kind: 'detail'`:
 *   - `/galeri` (`detailOf: 'gallery'`): album cards when the owner made albums, otherwise the photo grid;
 *     each album owns `/galeri/<album>` (a content sub-page, it does NOT count toward the plan page limit);
 *   - `/videolar` (`detailOf: 'videos'`): the video cards.
 * `/galeri` needs at least one usable photo and `/videolar` at least one valid video, otherwise the page is
 * removed again (404). Content stays on the section, so nothing here is stored twice. Pure and shared by the
 * renderer, editor, sitemap and public routes.
 */

export type GalleryPageKind = 'gallery' | 'videos'
type Lang = 'tr' | 'en'

const SLUGS: Record<GalleryPageKind, Record<Lang, string>> = {
  gallery: { tr: 'galeri', en: 'gallery' },
  videos: { tr: 'videolar', en: 'videos' },
}
const TITLES: Record<GalleryPageKind, Record<Lang, string>> = {
  gallery: { tr: 'Galeri', en: 'Gallery' },
  videos: { tr: 'Videolar', en: 'Videos' },
}
const SUBMENU_LABELS: Record<Lang, { photos: string; videos: string }> = {
  tr: { photos: 'Resimler', videos: 'Videolar' },
  en: { photos: 'Photos', videos: 'Videos' },
}

const siteLang = (site: Pick<WebsiteSchema, 'meta'>): Lang => (site.meta.language === 'en' ? 'en' : 'tr')

export function galleryPageTitle(kind: GalleryPageKind, lang: Lang): string {
  return TITLES[kind][lang]
}
export function gallerySubmenuLabels(lang: Lang) {
  return SUBMENU_LABELS[lang]
}

export type GalleryPhoto = {
  src: string
  alt: string
  caption?: string
  /** Album name the photo really belongs to ("Genel" when it has none). */
  album: string
  /** Position inside the section's `items`. */
  index: number
}

export type GalleryAlbumEntry = {
  id: string
  name: string
  slug: string
  photos: GalleryPhoto[]
  cover: GalleryPhoto
}

export type GalleryVideoEntry = {
  id: string
  name: string
  provider: GalleryVideoProvider
  videoId: string
  watchUrl: string
  embedUrl: string
  cover: { src: string; alt: string } | null
}

/** Visible gallery sections of the home page and of every page that owns sections. */
function gallerySections(site: Pick<WebsiteSchema, 'sections' | 'pages'>): GallerySection[] {
  const all = [...site.sections, ...(site.pages ?? []).flatMap((p) => p.sections ?? [])]
  return all.filter((s): s is GallerySection => s.type === 'gallery' && !s.hidden)
}

export function galleryPhotos(section: GallerySection, fallbackAlt: string): GalleryPhoto[] {
  const out: GalleryPhoto[] = []
  section.items.forEach((item, index) => {
    if (!isUsableImageSrc(item.src)) return
    const caption = item.caption?.trim() || undefined
    out.push({
      src: (item.src as string).trim(),
      alt: item.alt?.trim() || caption || fallbackAlt,
      ...(caption ? { caption } : {}),
      album: imageAlbumName(section, item.album),
      index,
    })
  })
  return out
}

export function galleryVideos(section: GallerySection): GalleryVideoEntry[] {
  const out: GalleryVideoEntry[] = []
  for (const video of section.videos ?? []) {
    const ref = parseGalleryVideoUrl(video.url)
    if (!ref) continue
    out.push({
      id: video.id,
      name: video.name.trim() || `Video ${out.length + 1}`,
      provider: ref.provider,
      videoId: ref.videoId,
      watchUrl: ref.watchUrl,
      embedUrl: ref.embedUrl,
      cover: isUsableImageSrc(video.cover?.src)
        ? { src: (video.cover?.src as string).trim(), alt: video.cover?.alt?.trim() || video.name.trim() }
        : null,
    })
  }
  return out
}

export function findGalleryPage(site: Pick<WebsiteSchema, 'pages'>, kind: GalleryPageKind) {
  return (site.pages ?? []).find((p) => p.kind === 'detail' && p.detailOf === kind) ?? null
}

function albumEntries(section: GallerySection, photos: GalleryPhoto[]): GalleryAlbumEntry[] {
  const out: GalleryAlbumEntry[] = []
  for (const album of section.albums ?? []) {
    const own = photos.filter((p) => p.album === album.name)
    if (own.length > 0) out.push({ id: album.id, name: album.name, slug: album.slug, photos: own, cover: own[0] })
  }
  const general = photos.filter((p) => isGeneralAlbum(p.album))
  if (general.length > 0) {
    out.push({ id: 'general', name: GENERAL_ALBUM, slug: GENERAL_ALBUM_SLUG, photos: general, cover: general[0] })
  }
  return out
}

export type ResolvedGalleryPages = {
  lang: Lang
  gallery: {
    slug: string
    title: string
    /** The page exists and has at least one photo to show. */
    active: boolean
    section: GallerySection | null
    photos: GalleryPhoto[]
    /** True when the owner made at least one album that holds a photo: `/galeri` then lists album cards. */
    hasAlbums: boolean
    albums: GalleryAlbumEntry[]
  }
  videos: {
    slug: string
    title: string
    active: boolean
    section: GallerySection | null
    items: GalleryVideoEntry[]
  }
}

export function resolveGalleryPages(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
): ResolvedGalleryPages {
  const lang = siteLang(site)
  const sections = gallerySections(site)

  let photoSection: GallerySection | null = null
  let photos: GalleryPhoto[] = []
  for (const section of sections) {
    const found = galleryPhotos(section, site.meta.name)
    if (found.length > 0) {
      photoSection = section
      photos = found
      break
    }
  }

  let videoSection: GallerySection | null = null
  let videoItems: GalleryVideoEntry[] = []
  for (const section of sections) {
    const found = galleryVideos(section)
    if (found.length > 0) {
      videoSection = section
      videoItems = found
      break
    }
  }

  const galleryPage = findGalleryPage(site, 'gallery')
  const videosPage = findGalleryPage(site, 'videos')
  const albums = photoSection ? albumEntries(photoSection, photos) : []

  return {
    lang,
    gallery: {
      slug: galleryPage?.slug || SLUGS.gallery[lang],
      title: galleryPage?.title || TITLES.gallery[lang],
      active: !!galleryPage && photos.length > 0,
      section: photoSection,
      photos,
      hasAlbums: albums.some((a) => a.id !== 'general'),
      albums,
    },
    videos: {
      slug: videosPage?.slug || SLUGS.videos[lang],
      title: videosPage?.title || TITLES.videos[lang],
      active: !!videosPage && videoItems.length > 0,
      section: videoSection,
      items: videoItems,
    },
  }
}

export function galleryAlbumPath(listSlug: string, albumSlug: string): string {
  return `/${listSlug}/${albumSlug}`
}

export type PublicAlbumLookup =
  | { kind: 'album'; resolved: ResolvedGalleryPages; entry: GalleryAlbumEntry; index: number }
  | { kind: 'moved'; to: string }

/**
 * The album behind `/<listSlug>/<albumSlug>`, only while `/galeri` is live and shows album cards. An album's
 * old slug (kept in `previousSlugs` after a rename) answers `moved`, so the caller can redirect permanently.
 */
export function findPublicAlbum(
  site: Pick<WebsiteSchema, 'sections' | 'pages' | 'meta'>,
  listSlug: string,
  albumSlug: string,
): PublicAlbumLookup | null {
  const resolved = resolveGalleryPages(site)
  const { gallery } = resolved
  if (!gallery.active || !gallery.hasAlbums || gallery.slug.toLowerCase() !== listSlug.toLowerCase()) return null
  const wanted = albumSlug.toLowerCase()
  const index = gallery.albums.findIndex((a) => a.slug === wanted)
  if (index >= 0) return { kind: 'album', resolved, entry: gallery.albums[index], index }
  const old = gallery.section ? findAlbumBySlug(gallery.section, wanted) : undefined
  const current = old ? gallery.albums.find((a) => a.id === old.id) : undefined
  if (current && current.slug !== wanted) return { kind: 'moved', to: galleryAlbumPath(gallery.slug, current.slug) }
  return null
}

/** Splits `/<listSlug>/<albumSlug>` when it addresses a live album page. */
export function matchAlbumHref(
  site: WebsiteSchema,
  href: string,
): { listSlug: string; albumSlug: string } | null {
  const path = href.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')
  const [listSlug, albumSlug, ...rest] = path.split('/')
  if (!listSlug || !albumSlug || rest.length > 0) return null
  const found = findPublicAlbum(site, listSlug, albumSlug)
  return found?.kind === 'album' ? { listSlug, albumSlug: found.entry.slug } : null
}

/** Plain-text digest for meta descriptions. */
export function galleryDescription(
  site: Pick<WebsiteSchema, 'meta'>,
  kind: GalleryPageKind,
  name: string,
  count: number,
): string {
  const lang = siteLang(site)
  if (kind === 'videos') {
    return lang === 'en' ? `${count} videos from ${name}.` : `${name} videoları (${count}).`
  }
  return lang === 'en' ? `${count} photos from ${name}.` : `${name} fotoğraf galerisi (${count} fotoğraf).`
}

function syncOne<T extends WebsiteSchema>(
  site: T,
  kind: GalleryPageKind,
  wanted: boolean,
  pageLimit: number,
): T {
  const pages = site.pages ?? []
  const existing = findGalleryPage(site, kind)
  if (!wanted) {
    if (!existing) return site
    return { ...site, pages: pages.filter((p) => p !== existing) }
  }
  if (existing) return site

  const lang = siteLang(site)
  const own = new Set([SLUGS[kind].tr, SLUGS[kind].en])
  // The owner already runs a page on this address: it keeps answering there untouched.
  if (pages.some((p) => !p.isHome && own.has((p.slug || '').toLowerCase()))) return site
  if (pages.length >= Math.min(pageLimit, SITE_PAGE_HARD_CAP)) return site

  const taken = new Set(pages.map((p) => (p.slug || '').toLowerCase()))
  const slug = taken.has(SLUGS[kind][lang]) ? uniquePageSlug(SLUGS[kind][lang], taken) : SLUGS[kind][lang]
  const created = { slug, title: TITLES[kind][lang], kind: 'detail' as const, detailOf: kind }
  const base = pages.length === 0 ? [{ slug: 'home', title: site.meta.name, isHome: true }] : pages
  return { ...site, pages: [...base, created] }
}

/**
 * Keeps the `/galeri` and `/videolar` system pages in step with the gallery section: created while there is
 * a usable photo / valid video, dropped again when there is none. New pages count toward the plan page limit.
 * Idempotent; returns the same object when nothing changes.
 */
export function syncGalleryPages<T extends WebsiteSchema>(site: T, pageLimit: number = SITE_PAGE_HARD_CAP): T {
  const sections = gallerySections(site)
  const hasPhotos = sections.some((s) => galleryPhotos(s, site.meta.name).length > 0)
  const hasVideos = sections.some((s) => galleryVideos(s).length > 0)
  return syncOne(syncOne(site, 'gallery', hasPhotos, pageLimit), 'videos', hasVideos, pageLimit)
}
