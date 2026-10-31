import 'server-only'

import { ImageResponse } from 'next/og'
import {
  GEIST_BOLD_BASE64,
  GEIST_REGULAR_BASE64,
} from '@/lib/seo/og-assets'
import {
  getTenantOgImageCandidates,
  trustedSupabaseImageUrl,
  type TenantSeoSite,
} from '@/lib/seo/site-sharing'

const IMAGE_SIZE = { width: 1200, height: 630 }
const MAX_IMAGE_BYTES = 3_000_000
const MAX_REMOTE_IMAGE_ATTEMPTS = 2
const CACHE_CONTROL = 'public, max-age=300, s-maxage=1800, stale-while-revalidate=86400'
const SAFE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif'])

function toArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const fonts = [
  { name: 'Geist', data: toArrayBuffer(GEIST_REGULAR_BASE64), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: toArrayBuffer(GEIST_BOLD_BASE64), weight: 700 as const, style: 'normal' as const },
]

function hasImageSignature(mime: string, bytes: Uint8Array): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  }
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mime === 'image/webp') {
    return (
      bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    )
  }
  if (mime === 'image/avif') {
    return (
      bytes.length >= 12 &&
      bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
      ((bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66) ||
        (bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x73))
    )
  }
  return false
}

function safeRasterDataUri(source: string): string | null {
  const match = /^data:(image\/(?:png|jpeg|webp|avif));base64,([a-z0-9+/]+=*)$/i.exec(source)
  if (!match || match[2].length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3)) return null

  const mime = match[1].toLowerCase()
  const bytes = Buffer.from(match[2], 'base64')
  if (bytes.length > MAX_IMAGE_BYTES || !hasImageSignature(mime, bytes)) return null
  return `data:${mime};base64,${bytes.toString('base64')}`
}

async function readLimitedBody(response: Response): Promise<Uint8Array | null> {
  const declaredSize = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredSize) && declaredSize > MAX_IMAGE_BYTES) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return null

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalSize = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalSize += value.byteLength
      if (totalSize > MAX_IMAGE_BYTES) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } catch {
    await reader.cancel().catch(() => undefined)
    return null
  }

  const result = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

async function safeSiteImageDataUri(source: string | undefined): Promise<string | null> {
  if (!source || source.length > 2_500_000) return null
  const inlineImage = safeRasterDataUri(source)
  if (inlineImage) return inlineImage

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const trustedUrl = trustedSupabaseImageUrl(source, supabaseUrl)
  if (!trustedUrl) return null

  try {
    const response = await fetch(trustedUrl, {
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(2500),
    })
    if (!response.ok || new URL(response.url).origin !== new URL(trustedUrl).origin) return null

    const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (!mime || !SAFE_IMAGE_MIME_TYPES.has(mime)) return null

    const bytes = await readLimitedBody(response)
    if (!bytes || !hasImageSignature(mime, bytes)) return null
    return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  }
}

async function loadTenantHeroImage(site: TenantSeoSite): Promise<string | null> {
  const candidates = getTenantOgImageCandidates(site.schema)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  let remoteAttempts = 0

  for (const candidate of candidates) {
    const inlineImage = safeRasterDataUri(candidate)
    if (inlineImage) return inlineImage
    if (!trustedSupabaseImageUrl(candidate, supabaseUrl)) continue
    if (remoteAttempts >= MAX_REMOTE_IMAGE_ATTEMPTS) break
    remoteAttempts += 1

    const image = await safeSiteImageDataUri(candidate)
    if (image) return image
  }
  return null
}

function isHexColor(value: string | undefined): value is string {
  return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

function paletteColor(site: TenantSeoSite, name: string, fallback: string): string {
  const color = site.schema.theme.palette.find((entry) => entry.name.toLowerCase() === name.toLowerCase())?.hex
  return isHexColor(color) ? color : fallback
}

function colorWithAlpha(hex: string, alpha: number): string {
  const normalized = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex
  const red = Number.parseInt(normalized.slice(1, 3), 16)
  const green = Number.parseInt(normalized.slice(3, 5), 16)
  const blue = Number.parseInt(normalized.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function headingFontSize(heading: string): number {
  if (heading.length <= 26) return 62
  if (heading.length <= 48) return 54
  if (heading.length <= 72) return 46
  return 40
}

export async function renderTenantOgImage(site: TenantSeoSite): Promise<ImageResponse> {
  const hero = site.schema.sections.find((section) => section.type === 'hero')
  const heroTitle = hero?.type === 'hero' ? hero.title : ''
  const [heroImage, logoImage] = await Promise.all([
    loadTenantHeroImage(site),
    safeSiteImageDataUri(site.schema.navigation.logo?.src),
  ])

  const background = paletteColor(
    site,
    'background',
    site.schema.theme.mode === 'dark' ? '#18161d' : '#f8f7f4',
  )
  const foreground = paletteColor(
    site,
    'text',
    site.schema.theme.mode === 'dark' ? '#f5f4f6' : '#18161d',
  )
  const accent = paletteColor(site, 'accent', paletteColor(site, 'primary', '#6552a3'))
  const heading = (site.schema.meta.seoTitle?.trim() || heroTitle || site.name).slice(0, 100)
  const tagline = (site.schema.meta.tagline.trim() || site.schema.meta.description.trim()).slice(0, 150)
  const logoText = (site.schema.navigation.logoText.trim() || site.name).slice(0, 64)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: background,
          color: foreground,
          fontFamily: 'Geist',
        }}
      >
        {heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={heroImage}
            alt={`${site.name} hero`}
            width={IMAGE_SIZE.width}
            height={IMAGE_SIZE.height}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : null}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: heroImage ? '74%' : '100%',
            display: 'flex',
            backgroundColor: heroImage ? colorWithAlpha(background, 0.9) : background,
          }}
        >
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '54px 68px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
              {logoImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoImage}
                  alt={site.schema.navigation.logo?.alt || site.name}
                  width={80}
                  height={80}
                  style={{ objectFit: 'contain', borderRadius: 12 }}
                />
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', fontSize: 28, fontWeight: 700 }}>{logoText}</div>
                {logoText !== site.name ? (
                  <div style={{ display: 'flex', fontSize: 19, opacity: 0.8 }}>{site.name}</div>
                ) : null}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 950 }}>
              <div style={{ display: 'flex', width: 72, height: 6, borderRadius: 3, backgroundColor: accent }} />
              <div
                style={{
                  display: 'flex',
                  fontSize: headingFontSize(heading),
                  fontWeight: 700,
                  lineHeight: 1.08,
                  letterSpacing: '-0.03em',
                }}
              >
                {heading}
              </div>
              <div style={{ display: 'flex', fontSize: 27, lineHeight: 1.35, maxWidth: 860 }}>
                {tagline}
              </div>
            </div>

            <div style={{ display: 'flex', fontSize: 19, opacity: 0.82 }}>{site.name}</div>
          </div>
        </div>
      </div>
    ),
    {
      ...IMAGE_SIZE,
      fonts,
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  )
}
