'use client'

import { Check } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
  SiteButton,
} from '@/components/website-renderer/primitives'
import { announcementTextColor } from '@/components/website-renderer/sections/announcement-contrast'
import { resolveAboutMedia, type ResolvedAbout } from '@/lib/about-media'

/** Text on the primary chip / figure block. Falls back to the shared token when the theme is unknown. */
const ON_PRIMARY = 'var(--about-on-primary, var(--site-primary-fg))'

type AboutData = Extract<Section, { type: 'about' }>
type Frame = { src: string; alt: string }

function Picture({
  image,
  className = '',
  style,
  sizes,
}: {
  image: Frame
  className?: string
  style?: React.CSSProperties
  sizes?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.src}
      alt={image.alt}
      sizes={sizes}
      loading="lazy"
      decoding="async"
      className={`h-full w-full object-cover ${className}`}
      style={style}
    />
  )
}

function Highlights({ items }: { items?: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <ul className="grid content-start gap-3">
      {items.map((h) => (
        <li
          key={h}
          className="flex items-start gap-3 p-3 text-sm"
          style={{
            backgroundColor: 'var(--site-card)',
            border: '1px solid var(--site-border)',
            borderRadius: 'var(--site-radius)',
            color: 'var(--site-fg)',
          }}
        >
          <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--site-primary)' }} />
          <span>{h}</span>
        </li>
      ))}
    </ul>
  )
}

function Copy({
  data,
  label,
  subtitle,
  cta,
}: {
  data: AboutData
  label?: string
  subtitle?: string
  cta?: ResolvedAbout['cta']
}) {
  return (
    <div>
      {label ? (
        <span
          className="mb-4 inline-block px-3 py-1 text-xs font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: 'var(--site-primary)',
            color: ON_PRIMARY,
            borderRadius: 'var(--site-radius)',
          }}
        >
          {label}
        </span>
      ) : null}
      <SectionHeading title={data.title} subtitle={subtitle} center={false} />
      <p
        className="mt-4 text-pretty text-sm leading-relaxed sm:text-base"
        style={{ color: 'var(--site-muted-fg)' }}
      >
        {data.body}
      </p>
      {cta ? (
        <div className="mt-6">
          <SiteButton button={cta} />
        </div>
      ) : null}
    </div>
  )
}

/** Primary-colored square tucked behind the image corner, so the photo looks pinned to the page. */
function CornerVisual({ image }: { image: Frame }) {
  return (
    <div className="relative mx-auto w-full max-w-md pb-4 pl-4 pt-0 lg:max-w-none">
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-3/4 w-3/4"
        style={{ backgroundColor: 'var(--site-primary)', borderRadius: 'var(--site-radius)' }}
      />
      <div
        className="relative aspect-[4/3] overflow-hidden"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
      >
        <Picture image={image} sizes="(min-width: 1024px) 40vw, 90vw" />
      </div>
    </div>
  )
}

/** One large tile plus two stacked tiles; two images fall back to a side-by-side pair. */
function CollageVisual({ images }: { images: Frame[] }) {
  const radius = { borderRadius: 'var(--site-radius)' }
  const [first, second, third] = images
  return (
    <div className="grid grid-cols-2 gap-3">
      <div
        className={`overflow-hidden ${third ? 'row-span-2 aspect-[3/4]' : 'aspect-[3/4]'}`}
        style={radius}
      >
        <Picture image={first} sizes="(min-width: 1024px) 20vw, 45vw" />
      </div>
      <div className="aspect-[4/3] overflow-hidden" style={radius}>
        <Picture image={second} sizes="(min-width: 1024px) 20vw, 45vw" />
      </div>
      {third ? (
        <div className="aspect-[4/3] overflow-hidden" style={radius}>
          <Picture image={third} sizes="(min-width: 1024px) 20vw, 45vw" />
        </div>
      ) : null}
    </div>
  )
}

/** Circular portrait with an offset accent ring. */
function RoundVisual({ image }: { image: Frame }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs sm:max-w-sm">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-full"
        style={{ border: '3px solid var(--site-accent)' }}
      />
      <div className="relative h-full w-full overflow-hidden rounded-full" style={{ border: '1px solid var(--site-border)' }}>
        <Picture image={image} sizes="(min-width: 640px) 384px, 80vw" />
      </div>
    </div>
  )
}

/** Image with the owner-supplied figure on a solid block overlapping its corner. */
function FigureVisual({ image, figure }: { image: Frame; figure: NonNullable<ResolvedAbout['figure']> }) {
  return (
    <div className="relative mx-auto w-full max-w-md pb-10 lg:max-w-none">
      <div
        className="aspect-[4/3] overflow-hidden"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
      >
        <Picture image={image} sizes="(min-width: 1024px) 40vw, 90vw" />
      </div>
      <div
        className="absolute bottom-0 right-4 px-6 py-4 text-center"
        style={{
          backgroundColor: 'var(--site-primary)',
          color: ON_PRIMARY,
          borderRadius: 'var(--site-radius)',
        }}
      >
        <p className="text-3xl font-bold leading-none" style={{ fontFamily: 'var(--site-heading-font)' }}>
          {figure.value}
        </p>
        <p className="mt-1 text-xs font-medium">{figure.label}</p>
      </div>
    </div>
  )
}

export function AboutSection({
  data,
  siteName,
  colors = null,
}: {
  data: AboutData
  siteName?: string
  colors?: { primary: string } | null
}) {
  const resolved = resolveAboutMedia(data, siteName ? `${siteName} - ${data.title}` : data.title)

  if (resolved.layout === 'text') {
    return (
      <SectionShell id="about">
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <SectionHeading title={data.title} center={false} />
            <p
              className="mt-4 text-pretty text-sm leading-relaxed sm:text-base"
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {data.body}
            </p>
          </div>
          <Highlights items={data.highlights} />
        </div>
      </SectionShell>
    )
  }

  const { layout, images, figure, label, cta } = resolved
  const subtitle = layout === 'collage' ? siteName : undefined

  let visual: React.ReactNode
  if (layout === 'collage') visual = <CollageVisual images={images} />
  else if (layout === 'round') visual = <RoundVisual image={images[0]} />
  else if (layout === 'figure' && figure) visual = <FigureVisual image={images[0]} figure={figure} />
  else visual = <CornerVisual image={images[0]} />

  return (
    <SectionShell id="about">
      <div
        data-about-layout={layout}
        style={
          colors
            ? ({ '--about-on-primary': announcementTextColor(colors.primary) } as React.CSSProperties)
            : undefined
        }
        className={`grid items-center gap-10 lg:gap-14 ${
          layout === 'round' ? 'lg:grid-cols-[1fr_1.2fr]' : 'lg:grid-cols-2'
        }`}
      >
        <div className={layout === 'corner' || layout === 'figure' ? 'order-2 lg:order-1' : 'order-2'}>
          <Copy data={data} label={label} subtitle={subtitle} cta={cta} />
          {data.highlights && data.highlights.length > 0 ? (
            <div className="mt-6">
              <Highlights items={data.highlights} />
            </div>
          ) : null}
        </div>
        <div className={layout === 'corner' || layout === 'figure' ? 'order-1 lg:order-2' : 'order-1'}>
          {visual}
        </div>
      </div>
    </SectionShell>
  )
}
