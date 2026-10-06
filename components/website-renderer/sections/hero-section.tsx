'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CTAButton, Section, SiteImageRef } from '@/lib/website-schema'
import { SiteButton, SiteImage } from '@/components/website-renderer/primitives'

type HeroData = Extract<Section, { type: 'hero' }>
type HeroSlide = NonNullable<HeroData['slides']>[number]

/** Normalized shape every hero variant renders from. */
type Slide = {
  badge?: string
  title: string
  description?: string
  primaryButton?: CTAButton
  secondaryButton?: CTAButton
  trustText?: string
  image: SiteImageRef | { imagePrompt: string; aspectRatio: '4/3' } | null
}

/** Prefer the structured `image`, fall back to the legacy `imagePrompt`. */
function resolveImage(
  image?: SiteImageRef,
  imagePrompt?: string,
): Slide['image'] {
  if (image) return image
  if (imagePrompt) return { imagePrompt, aspectRatio: '4/3' as const }
  return null
}

function heroToSlide(data: HeroData): Slide {
  return {
    badge: data.badge,
    title: data.title,
    description: data.description,
    primaryButton: data.primaryButton,
    secondaryButton: data.secondaryButton,
    trustText: data.trustText,
    image: resolveImage(data.image, data.imagePrompt),
  }
}

function slideToSlide(slide: HeroSlide): Slide {
  return {
    badge: slide.badge,
    title: slide.title,
    description: slide.description,
    primaryButton: slide.primaryButton,
    secondaryButton: slide.secondaryButton,
    image: resolveImage(slide.image, slide.imagePrompt),
  }
}

/**
 * Chooses the effective variant. Explicit `variant` always wins; otherwise fall
 * back to a sensible default so older schemas keep working: `slider` when
 * multiple slides exist, `split` when an image is present, else `centered`.
 */
function resolveVariant(data: HeroData): NonNullable<HeroData['variant']> {
  if (data.variant) return data.variant
  if (data.slides && data.slides.length > 1) return 'slider'
  if (resolveImage(data.image, data.imagePrompt)) return 'split'
  return 'centered'
}

export function HeroSection({ data }: { data: HeroData }) {
  const variant = resolveVariant(data)

  if (variant === 'slider') {
    const slides =
      data.slides && data.slides.length > 0
        ? data.slides.map(slideToSlide)
        : [heroToSlide(data)]
    return <HeroSlider slides={slides} />
  }

  if (variant === 'showcase') {
    return <HeroShowcase slide={heroToSlide(data)} />
  }

  if (variant === 'centered') {
    return <HeroCentered slide={heroToSlide(data)} />
  }

  return <HeroSplit slide={heroToSlide(data)} />
}

/* -------------------------------------------------------------------------- */
/*  Shared bits                                                               */
/* -------------------------------------------------------------------------- */

function Badge({ text, onImage = false }: { text: string; onImage?: boolean }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold backdrop-blur"
      style={
        onImage
          ? {
              backgroundColor: 'rgba(255,255,255,0.14)',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.28)',
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

/** Buttons rendered over a dark image overlay need guaranteed contrast. */
function OverlayButtons({ slide }: { slide: Slide }) {
  if (!slide.primaryButton && !slide.secondaryButton) return null
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-3">
      {slide.primaryButton && <SiteButton button={slide.primaryButton} />}
      {slide.secondaryButton && (
        <a
          href={slide.secondaryButton.href || '#'}
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{
            borderRadius: 'var(--site-radius)',
            fontFamily: 'var(--site-body-font)',
            backgroundColor: 'rgba(255,255,255,0.10)',
            border: '1px solid rgba(255,255,255,0.55)',
          }}
        >
          {slide.secondaryButton.label}
        </a>
      )}
    </div>
  )
}

/**
 * The large visual area used by showcase + slider heroes. Renders a themed
 * gradient backdrop (the graceful fallback until a real image backend is wired
 * up) plus a dark overlay so overlaid text stays legible on any theme.
 */
function Backdrop({ seed = 0, src, alt }: { seed?: number; src?: string; alt?: string }) {
  const hue = (seed * 47) % 360
  return (
    <div className="absolute inset-0" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 55%, var(--site-bg)), color-mix(in srgb, var(--site-accent) 45%, var(--site-bg)))',
        }}
      />
      {src ? (
        // Real generated image covers the whole hero; the gradient + dark
        // overlay below guarantee overlaid text stays legible.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src || '/placeholder.svg'}
          alt={alt || ''}
          className="absolute inset-0 h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      ) : null}
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: `radial-gradient(60% 60% at 75% 20%, hsl(${hue} 70% 60% / 0.45), transparent 70%)`,
        }}
      />
      {/* Legibility overlay: darker toward the bottom where text sits. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 45%, rgba(0,0,0,0.25) 100%)',
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Variant: split (text + image)                                            */
/* -------------------------------------------------------------------------- */

function HeroSplit({ slide }: { slide: Slide }) {
  const hasImage = Boolean(slide.image)
  return (
    <section id="hero" className="relative overflow-hidden px-6 py-20 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 50% 0%, color-mix(in srgb, var(--site-primary) 22%, transparent), transparent 70%)',
        }}
      />
      <div
        className={`relative mx-auto grid w-full max-w-5xl items-center gap-10 ${
          hasImage ? 'lg:grid-cols-2' : 'max-w-3xl text-center'
        }`}
      >
        {/* On mobile the image must sit ABOVE the copy (image -> title ->
            description -> CTA); on desktop it returns to the right column. */}
        <div className={hasImage ? 'order-2 lg:order-1' : 'mx-auto'}>
          {slide.badge ? (
            <div className={hasImage ? '' : 'flex justify-center'}>
              <Badge text={slide.badge} />
            </div>
          ) : null}
          <h1
            className={`text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl ${
              slide.badge ? 'mt-4' : ''
            }`}
            style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
          >
            {slide.title}
          </h1>
          {slide.description ? (
            <p
              className={`mt-5 text-pretty text-base leading-relaxed sm:text-lg ${
                hasImage ? '' : 'mx-auto max-w-xl'
              }`}
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {slide.description}
            </p>
          ) : null}
          {(slide.primaryButton || slide.secondaryButton) && (
            <div className={`mt-8 flex flex-wrap gap-3 ${hasImage ? '' : 'justify-center'}`}>
              {slide.primaryButton && <SiteButton button={slide.primaryButton} />}
              {slide.secondaryButton && (
                <SiteButton button={slide.secondaryButton} variant="outline" />
              )}
            </div>
          )}
          {slide.trustText ? (
            <p
              className={`mt-5 text-xs font-medium ${hasImage ? '' : 'mx-auto'}`}
              style={{ color: 'var(--site-muted-fg)' }}
            >
              {slide.trustText}
            </p>
          ) : null}
        </div>

        {hasImage && slide.image ? (
          <SiteImage
            image={slide.image}
            seed={3}
            className="order-1 min-h-[240px] w-full sm:min-h-[300px] lg:order-2 lg:min-h-0"
          />
        ) : null}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Variant: centered (text only)                                            */
/* -------------------------------------------------------------------------- */

function HeroCentered({ slide }: { slide: Slide }) {
  return (
    <section id="hero" className="relative overflow-hidden px-6 py-20 sm:py-28">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 50% 0%, color-mix(in srgb, var(--site-primary) 22%, transparent), transparent 70%)',
        }}
      />
      <div className="relative mx-auto w-full max-w-3xl text-center">
        {slide.badge ? (
          <div className="flex justify-center">
            <Badge text={slide.badge} />
          </div>
        ) : null}
        <h1
          className={`text-balance text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl md:text-6xl ${
            slide.badge ? 'mt-4' : ''
          }`}
          style={{ fontFamily: 'var(--site-heading-font)', color: 'var(--site-fg)' }}
        >
          {slide.title}
        </h1>
        {slide.description ? (
          <p
            className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed sm:text-lg"
            style={{ color: 'var(--site-muted-fg)' }}
          >
            {slide.description}
          </p>
        ) : null}
        {(slide.primaryButton || slide.secondaryButton) && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {slide.primaryButton && <SiteButton button={slide.primaryButton} />}
            {slide.secondaryButton && (
              <SiteButton button={slide.secondaryButton} variant="outline" />
            )}
          </div>
        )}
        {slide.trustText ? (
          <p className="mx-auto mt-5 text-xs font-medium" style={{ color: 'var(--site-muted-fg)' }}>
            {slide.trustText}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Variant: showcase (full-width background image)                          */
/* -------------------------------------------------------------------------- */

function ShowcaseContent({ slide, seed = 0 }: { slide: Slide; seed?: number }) {
  const bgSrc =
    slide.image && 'src' in slide.image ? (slide.image.src as string | undefined) : undefined
  const bgAlt =
    slide.image && 'alt' in slide.image ? (slide.image.alt as string | undefined) : undefined
  return (
    <>
      <Backdrop seed={seed} src={bgSrc} alt={bgAlt} />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        {slide.badge ? <Badge text={slide.badge} onImage /> : null}
        <h1
          className={`text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-6xl ${
            slide.badge ? 'mt-4' : ''
          }`}
          style={{ fontFamily: 'var(--site-heading-font)' }}
        >
          {slide.title}
        </h1>
        {slide.description ? (
          <p
            className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/85 sm:text-lg"
          >
            {slide.description}
          </p>
        ) : null}
        <OverlayButtons slide={slide} />
        {slide.trustText ? (
          <p className="mt-5 text-xs font-medium text-white/75">{slide.trustText}</p>
        ) : null}
      </div>
    </>
  )
}

function HeroShowcase({ slide }: { slide: Slide }) {
  return (
    <section
      id="hero"
      className="relative flex items-center overflow-hidden px-6 py-24 sm:py-32"
      style={{ minHeight: 'clamp(440px, 70vh, 680px)' }}
    >
      <ShowcaseContent slide={slide} seed={2} />
    </section>
  )
}

/* -------------------------------------------------------------------------- */
/*  Variant: slider (rotating full-bleed slides)                             */
/* -------------------------------------------------------------------------- */

function HeroSlider({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    prefersReducedMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const go = useCallback(
    (next: number) => setIndex((prev) => (next + count) % count),
    [count],
  )

  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion.current) return
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % count)
    }, 6000)
    return () => window.clearInterval(id)
  }, [count, paused])

  return (
    <section
      id="hero"
      className="relative flex items-center overflow-hidden px-6 py-24 sm:py-32"
      style={{ minHeight: 'clamp(460px, 72vh, 700px)' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {slides.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0 flex items-center px-6 py-24 transition-opacity duration-700 ease-out sm:py-32"
          style={{
            opacity: i === index ? 1 : 0,
            pointerEvents: i === index ? 'auto' : 'none',
          }}
          aria-hidden={i === index ? undefined : true}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} / ${count}`}
        >
          <ShowcaseContent slide={slide} seed={i + 1} />
        </div>
      ))}

      {count > 1 ? (
        <>
          {/* Prev / next controls */}
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
            className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <ChevronLeft />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
            className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <ChevronRight />
          </button>

          {/* Dots */}
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className="h-2 rounded-full transition-all"
                style={{
                  width: i === index ? 24 : 8,
                  backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
