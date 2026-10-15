import { ImageResponse } from 'next/og'
import {
  GEIST_BOLD_BASE64,
  GEIST_REGULAR_BASE64,
  LOGO_PNG_BASE64,
  LOGO_SIZE,
} from '@/lib/seo/og-assets'
import { OG_IMAGE_SIZE } from '@/lib/seo/page-seo'

const BACKGROUND = '#1a1426'
const BACKGROUND_LIFT = '#2a1f45'
const BRAND = '#8b5cf6'
const TEXT = '#ffffff'
const TEXT_MUTED = '#b9b0cf'

/** Short on purpose: previews are cheap to regenerate and copy edits should show up quickly. */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=1800'

function toArrayBuffer(base64: string): ArrayBuffer {
  const bytes = Buffer.from(base64, 'base64')
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const fonts = [
  { name: 'Geist', data: toArrayBuffer(GEIST_REGULAR_BASE64), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: toArrayBuffer(GEIST_BOLD_BASE64), weight: 700 as const, style: 'normal' as const },
]

/** Longer headings step down so they stay within three lines. */
function headingFontSize(heading: string): number {
  if (heading.length <= 12) return 120
  if (heading.length <= 34) return 88
  if (heading.length <= 60) return 72
  return 60
}

export type OgImageContent = {
  heading: string
  tagline: string
}

export function renderOgImage({ heading, tagline }: OgImageContent): ImageResponse {
  const logoWidth = 360
  const logoHeight = Math.round((logoWidth * LOGO_SIZE.height) / LOGO_SIZE.width)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px',
          backgroundColor: BACKGROUND,
          backgroundImage: `linear-gradient(135deg, ${BACKGROUND} 0%, ${BACKGROUND_LIFT} 100%)`,
          fontFamily: 'Geist',
          color: TEXT,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${LOGO_PNG_BASE64}`}
            width={logoWidth}
            height={logoHeight}
            alt="GLOVAL AI"
          />
          <div style={{ display: 'flex', fontSize: 28, color: TEXT_MUTED }}>gloval.ai</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              width: 96,
              height: 8,
              borderRadius: 4,
              backgroundColor: BRAND,
              marginBottom: 36,
            }}
          />
          <div
            style={{
              display: 'flex',
              fontSize: headingFontSize(heading),
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              maxWidth: 1000,
            }}
          >
            {heading}
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 36, color: TEXT_MUTED }}>{tagline}</div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts,
      headers: { 'Cache-Control': CACHE_CONTROL },
    },
  )
}
