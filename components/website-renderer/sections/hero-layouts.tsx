'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import type { CTAButton, SiteImageRef } from '@/lib/website-schema'
import { SiteButton } from '@/components/website-renderer/primitives'
import { ThemedImagePlaceholder } from '@/components/themed-image-placeholder'
import { useCarouselGestures } from '@/components/website-renderer/use-carousel-gestures'
import { KEEP_INTERACTIVE_PROPS } from '@/lib/preview-interactive'
import {
  overlayGradient,
  type HeroAlign,
  type ResolvedHeroLayout,
} from '@/lib/hero-layout'

/**
 * The three owner-selectable hero styles. Every layout shows the same four
 * things in the same order: title (h1), subtitle, one button, plus an optional
 * badge above. Slides share one CSS grid cell so the section is always as tall
 * as its tallest slide; nothing is absolutely positioned against a fixed height.
 */

export type LayoutSlide = {
  badge?: string
  title: string
  description?: string
  primaryButton?: CTAButton
  image: SiteImageRef | { imagePrompt: string; aspectRatio: '4/3' } | null
}

const AUTOPLAY_MS = 6000

const ALIGN_TEXT: Record<HeroAlign, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}

function imageOf(slide: LayoutSlide): { src?: string; alt: string } {
  const img = slide.image
  const src = img && 'src' in img ? (img.src as string | undefined) : undefined
  const alt = img && 'alt' in img ? ((img.alt as string | undefined) ?? '') : ''
  return { src: src || undefined, alt }
}

export function HeroLayoutView({
  slides,
  settings,
}: {
  slides: LayoutSlide[]
  settings: ResolvedHeroLayout
}) {
  const count = slides.length
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const fullBleed = settings.layout === 'full-bleed'

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const go = useCallback((next: number) => setIndex((count + next) % count), [count])

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion) return
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(id)
  }, [count, paused, reducedMotion])

  useEffect(() => {
    if (index > count - 1) setIndex(0)
  }, [count, index])

  const gestures = useCarouselGestures((dir) => go(index + dir), count > 1)

  return (
    <section
      id="hero"
      className="relative overflow-hidden"
      style={{ backgroundColor: 'var(--site-bg)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      {...(count > 1 ? { 'aria-roledescription': 'carousel' } : {})}
      {...gestures}
    >
      <div className="grid">
        {slides.map((slide, i) => {
          const active = i === index
          return (
            <div
              key={i}
              className="col-start-1 row-start-1 transition-opacity duration-700 ease-out motion-reduce:transition-none"
              style={{ opacity: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none' }}
              inert={!active}
              aria-hidden={active ? undefined : true}
              {...(count > 1
                ? {
                    role: 'group',
                    'aria-roledescription': 'slide',
                    'aria-label': `${i + 1} / ${count}`,
                  }
                : {})}
            >
              {settings.layout === 'full-bleed' ? (
                <FullBleedSlide slide={slide} settings={settings} first={i === 0} />
              ) : settings.layout === 'light-cover' ? (
                <LightCoverSlide slide={slide} settings={settings} first={i === 0} />
              ) : (
                <SplitSlide slide={slide} settings={settings} first={i === 0} />
              )}
            </div>
          )
        })}
      </div>

      {count > 1 ? (
        <Controls count={count} index={index} go={go} dark={fullBleed} />
      ) : null}
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Shared copy block                                                         */
/* -------------------------------------------------------------------------- */

function Badge({ text, onImage }: { text: string; onImage: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold"
      style={
        onImage
          ? {
              backgroundColor: 'rgba(0,0,0,0.35)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.45)',
            }
          : {
              backgroundColor: 'color-mix(in srgb, var(--site-primary) 14%, transparent)',
              color: 'var(--site-primary)',
              border: '1px solid color-mix(in srgb, var(--site-primary) 30%, transparent)',
            }
      }
    >
      {text}
    </span>
  )
}

function Copy({
  slide,
  align,
  onImage,
  first,
}: {
  slide: LayoutSlide
  align: HeroAlign
  onImage: boolean
  first: boolean
}) {
  const Heading = first ? 'h1' : 'h2'
  return (
    <div className={`flex w-full flex-col ${ALIGN_TEXT[align]}`}>
      {slide.badge ? <Badge text={slide.badge} onImage={onImage} /> : null}
      <Heading
        className={`text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl ${
          slide.badge ? 'mt-4' : ''
        }`}
        style={{
          fontFamily: 'var(--site-heading-font)',
          color: onImage ? '#ffffff' : 'var(--site-fg)',
        }}
      >
        {slide.title}
      </Heading>
      {slide.description ? (
        <p
          className="mt-5 max-w-xl text-pretty text-base leading-relaxed sm:text-lg"
          style={{ color: onImage ? 'rgba(255,255,255,0.92)' : 'var(--site-muted-fg)' }}
        >
          {slide.description}
        </p>
      ) : null}
      {slide.primaryButton?.label ? (
        <div className="mt-8">
          <SiteButton button={slide.primaryButton} />
        </div>
      ) : null}
    </div>
  )
}

function Photo({
  slide,
  first,
  fit,
  sizes,
}: {
  slide: LayoutSlide
  first: boolean
  fit: 'cover' | 'contain'
  sizes: string
}) {
  const { src, alt } = imageOf(slide)
  if (!src) {
    return (
      <div className="absolute inset-0">
        <ThemedImagePlaceholder name={slide.title} />
      </div>
    )
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={first}
      className={fit === 'contain' ? 'object-contain' : 'object-cover'}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*  Layout: split (copy + framed image)                                       */
/* -------------------------------------------------------------------------- */

function SplitSlide({
  slide,
  settings,
  first,
}: {
  slide: LayoutSlide
  settings: ResolvedHeroLayout
  first: boolean
}) {
  const textRight = settings.align === 'right'
  return (
    <div className="flex min-h-[420px] items-center px-6 py-14 md:min-h-[560px] md:py-20">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 md:grid-cols-2 md:gap-12">
        <div
          className={`relative order-1 aspect-[4/3] w-full overflow-hidden ${
            textRight ? '' : 'md:order-2'
          }`}
          style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)' }}
        >
          <Photo slide={slide} first={first} fit="cover" sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
        <div className={`order-2 ${textRight ? '' : 'md:order-1'}`}>
          <Copy slide={slide} align={settings.align} onImage={false} first={first} />
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Layout: light-cover (copy on a light half, image bleeds to the edge)      */
/* -------------------------------------------------------------------------- */

function LightCoverSlide({
  slide,
  settings,
  first,
}: {
  slide: LayoutSlide
  settings: ResolvedHeroLayout
  first: boolean
}) {
  const textRight = settings.align === 'right'
  return (
    <div
      className="grid min-h-[420px] md:min-h-[560px] md:grid-cols-2"
      style={{ backgroundColor: 'var(--site-card)' }}
    >
      <div
        className={`relative order-1 aspect-[4/3] w-full md:aspect-auto md:min-h-[560px] ${
          textRight ? '' : 'md:order-2'
        }`}
        style={{ backgroundColor: 'var(--site-bg)' }}
      >
        <Photo
          slide={slide}
          first={first}
          fit={settings.imageFit}
          sizes="(min-width: 768px) 50vw, 100vw"
        />
      </div>
      <div
        className={`order-2 flex items-center px-6 py-12 md:px-12 lg:px-16 ${
          textRight ? '' : 'md:order-1'
        }`}
      >
        <Copy slide={slide} align={settings.align} onImage={false} first={first} />
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Layout: full-bleed (image behind, scrim guarantees text contrast)         */
/* -------------------------------------------------------------------------- */

function FullBleedSlide({
  slide,
  settings,
  first,
}: {
  slide: LayoutSlide
  settings: ResolvedHeroLayout
  first: boolean
}) {
  const { align, overlay } = settings
  const justify =
    align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-start'
  return (
    <div className="relative flex min-h-[420px] items-center md:min-h-[640px]">
      <div className="absolute inset-0" style={{ backgroundColor: 'var(--site-primary)' }}>
        <Photo slide={slide} first={first} fit="cover" sizes="100vw" />
      </div>
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{ background: overlayGradient(align, overlay) }}
      />
      <div className={`relative mx-auto flex w-full max-w-6xl px-6 py-16 md:py-24 ${justify}`}>
        <div className="w-full max-w-2xl">
          <Copy slide={slide} align={align} onImage first={first} />
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Controls                                                                  */
/* -------------------------------------------------------------------------- */

function Controls({
  count,
  index,
  go,
  dark,
}: {
  count: number
  index: number
  go: (i: number) => void
  dark: boolean
}) {
  const pill: React.CSSProperties = dark
    ? { backgroundColor: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.5)', color: '#ffffff' }
    : {
        backgroundColor: 'var(--site-bg)',
        border: '1px solid var(--site-border)',
        color: 'var(--site-fg)',
      }
  const dotOn = dark ? '#ffffff' : 'var(--site-primary)'
  const dotOff = dark ? 'rgba(255,255,255,0.55)' : 'var(--site-border)'
  return (
    <>
      <button
        type="button"
        {...KEEP_INTERACTIVE_PROPS}
        onClick={() => go(index - 1)}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={pill}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        {...KEEP_INTERACTIVE_PROPS}
        onClick={() => go(index + 1)}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        style={pill}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            type="button"
            {...KEEP_INTERACTIVE_PROPS}
            onClick={() => go(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className="h-2 rounded-full transition-all"
            style={{ width: i === index ? 24 : 8, backgroundColor: i === index ? dotOn : dotOff }}
          />
        ))}
      </div>
    </>
  )
}
