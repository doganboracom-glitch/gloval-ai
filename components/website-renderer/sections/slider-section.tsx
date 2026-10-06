'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Section } from '@/lib/website-schema'
import { onSiteNavClick, SectionHeading } from '@/components/website-renderer/primitives'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'

type SliderData = Extract<Section, { type: 'slider' }>
type SliderSlide = SliderData['slides'][number]

/**
 * SliderSection
 * -------------
 * A standalone, auto-rotating image slider — a "second slider" independent of
 * the hero. Each slide is a full-bleed photo (graceful themed gradient when no
 * `src` is resolved) with an overlaid caption / title / description / CTA.
 *
 * Accessibility: labelled as a carousel, arrow + dot controls, pauses on hover
 * and focus, and never auto-advances when the user prefers reduced motion.
 */
export function SliderSection({ data }: { data: SliderData }) {
  const slides = data.slides ?? []
  const variant = data.variant ?? 'card'
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = slides.length
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    prefersReducedMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  const go = useCallback((next: number) => setIndex((prev) => (next + count) % count), [count])

  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion.current) return
    const id = window.setInterval(() => setIndex((prev) => (prev + 1) % count), 5500)
    return () => window.clearInterval(id)
  }, [count, paused])

  // Keep the active index valid if slides are removed in the editor.
  useEffect(() => {
    if (index > count - 1) setIndex(Math.max(0, count - 1))
  }, [count, index])

  if (count === 0) return null

  const rounded = variant === 'card'

  return (
    <section
      id="slider"
      className={variant === 'card' ? 'px-6 py-16 sm:py-20' : ''}
      aria-roledescription="carousel"
      aria-label={data.title || 'Slider'}
    >
      <div className={variant === 'card' ? 'mx-auto w-full max-w-5xl' : ''}>
        {(data.title || data.subtitle) && variant === 'card' ? (
          <div className="mb-8">
            <SectionHeading title={data.title || ''} subtitle={data.subtitle} />
          </div>
        ) : null}

        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: rounded ? 'var(--site-radius)' : 0,
            border: rounded ? '1px solid var(--site-border)' : 'none',
            minHeight: 'clamp(320px, 46vh, 520px)',
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          {slides.map((slide, i) => (
            <SlideView key={i} slide={slide} active={i === index} seed={i + 1} total={count} order={i} />
          ))}

          {count > 1 ? (
            <>
              <button
                type="button"
                onClick={() => go(index - 1)}
                aria-label="Previous slide"
                className="absolute left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.35)' }}
              >
                <Chevron dir="left" />
              </button>
              <button
                type="button"
                onClick={() => go(index + 1)}
                aria-label="Next slide"
                className="absolute right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.35)' }}
              >
                <Chevron dir="right" />
              </button>

              <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
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
                      backgroundColor: i === index ? '#ffffff' : 'rgba(255,255,255,0.55)',
                    }}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SlideView({
  slide,
  active,
  seed,
  total,
  order,
}: {
  slide: SliderSlide
  active: boolean
  seed: number
  total: number
  order: number
}) {
  const nav = useSiteNav()
  const hue = (seed * 47) % 360
  return (
    <div
      className="absolute inset-0 flex items-center transition-opacity duration-700 ease-out"
      style={{ opacity: active ? 1 : 0, pointerEvents: active ? 'auto' : 'none' }}
      role="group"
      aria-roledescription="slide"
      aria-label={`${order + 1} / ${total}`}
      aria-hidden={active ? undefined : true}
    >
      {/* Backdrop: themed gradient + optional real photo + legibility overlay */}
      <div className="absolute inset-0" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(135deg, color-mix(in srgb, var(--site-primary) 55%, var(--site-bg)), color-mix(in srgb, var(--site-accent) 45%, var(--site-bg)))',
          }}
        />
        {slide.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={slide.src || '/placeholder.svg'}
            alt={slide.alt || slide.imagePrompt || ''}
            className="absolute inset-0 h-full w-full object-cover"
            loading={order === 0 ? 'eager' : 'lazy'}
            decoding="async"
          />
        ) : null}
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background: `radial-gradient(60% 60% at 75% 20%, hsl(${hue} 70% 60% / 0.4), transparent 70%)`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0.2) 100%)',
          }}
        />
      </div>

      <div className="relative w-full px-8 sm:px-12">
        <div className="max-w-xl">
          {slide.caption ? (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold backdrop-blur"
              style={{
                backgroundColor: 'rgba(255,255,255,0.16)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              {slide.caption}
            </span>
          ) : null}
          <h3
            className={`text-balance text-3xl font-bold leading-tight text-white sm:text-4xl ${
              slide.caption ? 'mt-4' : ''
            }`}
            style={{ fontFamily: 'var(--site-heading-font)' }}
          >
            {slide.title}
          </h3>
          {slide.description ? (
            <p className="mt-4 max-w-md text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
              {slide.description}
            </p>
          ) : null}
          {slide.buttonText ? (
            <a
              href={slide.href || '#'}
              onClick={(e) => onSiteNavClick(e, slide.href, nav)}
              className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                borderRadius: 'var(--site-radius)',
                fontFamily: 'var(--site-body-font)',
                backgroundColor: 'var(--site-primary)',
                color: 'var(--site-primary-fg)',
              }}
            >
              {slide.buttonText}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === 'left' ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  )
}
