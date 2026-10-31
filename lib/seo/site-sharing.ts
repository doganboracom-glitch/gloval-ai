import type { Metadata } from 'next'
import type { WebsiteSchema } from '@/lib/website-schema'
import { OG_IMAGE_SIZE } from '@/lib/seo/page-seo'
import {
  resolveSeoDescription,
  seoDescriptionPlainText,
} from '@/lib/seo/seo-description'

export type TenantSeoSite = {
  name: string
  schema: WebsiteSchema
}

export type TenantSocialMetadataInput = {
  site: TenantSeoSite
  slug: string
  origin: string
  lastModified?: string | null
  canonical?: string
  title?: string
  description?: string | null
  type?: 'website' | 'article'
  article?: {
    publishedTime?: string | null
    modifiedTime?: string | null
    tags?: string[]
  }
  robots?: Metadata['robots']
  alternateTypes?: Record<string, string>
}

const IMAGE_CONTAINER_KEYS = new Set([
  'image',
  'images',
  'cover',
  'coverimage',
  'featuredimage',
  'thumbnail',
  'media',
  'photos',
  'slides',
  'gallery',
  'items',
  'cards',
  'products',
  'services',
  'features',
  'members',
  'references',
  'portfolio',
  'work',
])
const MAX_OG_IMAGE_CANDIDATES = 12
const MAX_IMAGE_WALK_NODES = 240

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addCandidate(
  value: unknown,
  candidates: string[],
  seen: Set<string>,
): void {
  if (typeof value !== 'string') return
  const source = value.trim()
  if (!source || source.length > 2_500_000 || seen.has(source)) return
  seen.add(source)
  candidates.push(source)
}

function collectImageCandidates(
  value: unknown,
  candidates: string[],
  seenSources: Set<string>,
  state: { nodes: number },
  key = '',
  depth = 0,
): void {
  if (state.nodes >= MAX_IMAGE_WALK_NODES || depth > 8 || candidates.length >= MAX_OG_IMAGE_CANDIDATES) {
    return
  }
  state.nodes += 1

  if (typeof value === 'string') {
    if (IMAGE_CONTAINER_KEYS.has(key.toLowerCase())) addCandidate(value, candidates, seenSources)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageCandidates(item, candidates, seenSources, state, key, depth + 1)
      if (candidates.length >= MAX_OG_IMAGE_CANDIDATES) return
    }
    return
  }

  if (!isRecord(value)) return

  addCandidate(value.src, candidates, seenSources)
  for (const [childKey, childValue] of Object.entries(value)) {
    if (childKey === 'src') continue
    if (
      IMAGE_CONTAINER_KEYS.has(childKey.toLowerCase()) ||
      Array.isArray(childValue) ||
      isRecord(childValue)
    ) {
      collectImageCandidates(childValue, candidates, seenSources, state, childKey, depth + 1)
      if (candidates.length >= MAX_OG_IMAGE_CANDIDATES) return
    }
  }
}

/** Site-owned image candidates in priority order: explicit share image, hero, then featured content. */
export function getTenantOgImageCandidates(schema: WebsiteSchema): string[] {
  const candidates: string[] = []
  const seen = new Set<string>()
  addCandidate(schema.meta.ogImage, candidates, seen)

  const hero = schema.sections.find((section) => section.type === 'hero')
  if (hero?.type === 'hero' && !hero.hidden) {
    addCandidate(hero.image?.src, candidates, seen)
    for (const slide of hero.slides ?? []) {
      addCandidate(slide.image?.src, candidates, seen)
    }
  }

  const state = { nodes: 0 }
  for (const section of schema.sections) {
    if (section === hero || section.hidden) continue
    collectImageCandidates(section, candidates, seen, state)
    if (candidates.length >= MAX_OG_IMAGE_CANDIDATES) break
  }
  for (const page of schema.pages) {
    for (const section of page.sections ?? []) {
      if (section.hidden) continue
      collectImageCandidates(section, candidates, seen, state)
      if (candidates.length >= MAX_OG_IMAGE_CANDIDATES) break
    }
    if (candidates.length >= MAX_OG_IMAGE_CANDIDATES) break
  }
  return candidates
}

/**
 * Returns a URL only for image files in this project's public `site-images`
 * bucket. User-provided hosts, URL credentials, query strings, redirects and
 * encoded/path-traversal segments are deliberately rejected.
 */
export function trustedSupabaseImageUrl(
  source: string,
  supabaseUrl: string | undefined,
): string | null {
  if (!supabaseUrl || source.length > 4096) return null

  try {
    const base = new URL(supabaseUrl)
    const url = new URL(source)
    const isLocalSupabase =
      base.hostname === 'localhost' || base.hostname === '127.0.0.1' || base.hostname === '[::1]'
    if (
      url.origin !== base.origin ||
      (base.protocol !== 'https:' && !isLocalSupabase) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.includes('%') ||
      url.pathname.includes('\\')
    ) {
      return null
    }

    const prefix = '/storage/v1/object/public/site-images/'
    if (!url.pathname.startsWith(prefix)) return null
    const objectPath = url.pathname.slice(prefix.length)
    const segments = objectPath.split('/')
    if (
      !objectPath ||
      segments.some((segment) => !segment || segment === '.' || segment === '..' || !/^[a-z0-9._-]+$/i.test(segment)) ||
      !/\.(?:png|jpe?g|webp|avif)$/i.test(objectPath)
    ) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

function compactAssetVersion(source: string): string {
  if (!source.startsWith('data:')) return source
  return `${source.slice(0, 96)}:${source.length}:${source.slice(-96)}`
}

function shortHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function tenantImageVersion(site: TenantSeoSite, lastModified?: string | null): string {
  const modifiedAt = lastModified ? Date.parse(lastModified) : Number.NaN
  const timestamp = Number.isFinite(modifiedAt) ? modifiedAt.toString(36) : 'snapshot'
  const palette = site.schema.theme.palette.map(({ name, hex }) => `${name}:${hex}`).join('|')
  const assets = [
    ...getTenantOgImageCandidates(site.schema),
    site.schema.navigation.logo?.src ?? '',
  ]
    .map(compactAssetVersion)
    .join('|')
  const content = [
    site.name,
    site.schema.meta.name,
    site.schema.meta.seoTitle ?? '',
    site.schema.meta.description,
    site.schema.meta.tagline,
    site.schema.meta.language,
    palette,
    assets,
  ].join('\u001f')

  return `${timestamp}-${shortHash(content)}`
}

function tenantOgImageUrl(
  origin: string,
  slug: string,
  site: TenantSeoSite,
  lastModified?: string | null,
): string {
  const base = new URL(origin)
  base.pathname = '/'
  base.search = ''
  base.hash = ''
  const imageUrl = new URL(`/site/${encodeURIComponent(slug)}/opengraph-image`, base)
  imageUrl.searchParams.set('v', tenantImageVersion(site, lastModified))
  return imageUrl.toString()
}

export function tenantSiteTitle(site: TenantSeoSite): string {
  const seoTitle = site.schema.meta.seoTitle?.trim()
  return seoTitle ? `${site.name} - ${seoTitle}` : site.name
}

function firstSentence(value: string): string {
  const plainText = seoDescriptionPlainText(value)
  const sentenceEnd = plainText.search(/[.!?](?=\s|$)/u)
  return sentenceEnd < 0 ? plainText : plainText.slice(0, sentenceEnd + 1)
}

export function tenantSiteDescription(site: TenantSeoSite): string {
  const customDescription = resolveSeoDescription(site.schema.meta.description)
  if (customDescription) return customDescription

  const hero = site.schema.sections.find(
    (section) => section.type === 'hero' && !section.hidden,
  )
  if (hero?.type === 'hero') {
    const heroCopy =
      hero.description?.trim() ||
      hero.slides?.find((slide) => slide.description?.trim())?.description ||
      ''
    const heroDescription = resolveSeoDescription(heroCopy)
    if (heroDescription) return heroDescription
  }

  const about = site.schema.sections.find(
    (section) => section.type === 'about' && !section.hidden,
  )
  if (about?.type === 'about') {
    const aboutDescription = resolveSeoDescription(firstSentence(about.body))
    if (aboutDescription) return aboutDescription
  }

  const name = resolveSeoDescription(site.name) || resolveSeoDescription(site.schema.meta.name)
  const sector = resolveSeoDescription(site.schema.meta.seoTitle ?? '')
  return resolveSeoDescription([name, sector].filter(Boolean).join(' - ')) || name
}

export function buildTenantSocialMetadata(input: TenantSocialMetadataInput): Metadata {
  const title = input.title?.trim() || tenantSiteTitle(input.site)
  const description =
    resolveSeoDescription(input.description) || tenantSiteDescription(input.site)
  const base = new URL(input.origin)
  base.pathname = '/'
  base.search = ''
  base.hash = ''
  const canonicalUrl = new URL(input.canonical ?? '/', base)
  const canonical =
    canonicalUrl.pathname === '/' && !canonicalUrl.search && !canonicalUrl.hash
      ? canonicalUrl.origin
      : canonicalUrl.toString()
  const imageUrl = tenantOgImageUrl(input.origin, input.slug, input.site, input.lastModified)
  const imageAlt = `${input.site.name} — ${title}`
  const sharedOpenGraph = {
    siteName: input.site.name,
    title,
    description,
    url: canonical,
    locale: input.site.schema.meta.language === 'en' ? 'en_US' : 'tr_TR',
    images: [
      {
        url: imageUrl,
        ...OG_IMAGE_SIZE,
        alt: imageAlt,
      },
    ],
  }
  const openGraph =
    input.type === 'article'
      ? {
          ...sharedOpenGraph,
          type: 'article' as const,
          ...(input.article?.publishedTime ? { publishedTime: input.article.publishedTime } : {}),
          ...(input.article?.modifiedTime ? { modifiedTime: input.article.modifiedTime } : {}),
          ...(input.article?.tags?.length ? { tags: input.article.tags } : {}),
        }
      : { ...sharedOpenGraph, type: 'website' as const }

  return {
    title,
    description,
    metadataBase: base,
    alternates: {
      canonical,
      ...(input.alternateTypes ? { types: input.alternateTypes } : {}),
    },
    openGraph,
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
    ...(input.robots ? { robots: input.robots } : {}),
  }
}
