// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSection } from '@/components/website-renderer/sections/hero-section'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { buildSampleSite } from '@/lib/__fixtures__/sample-site'

type HeroData = Parameters<typeof HeroSection>[0]['data']
type Layout = 'split' | 'light-cover' | 'full-bleed'

const LAYOUTS: Layout[] = ['split', 'light-cover', 'full-bleed']

function slide(n: number) {
  return {
    title: `Slayt ${n}`,
    description: `Açıklama ${n}`,
    image: { imagePrompt: `p${n}`, src: `/hero-${n}.webp`, alt: `Görsel ${n}`, aspectRatio: '16/9' as const },
  }
}

function heroData(count: number, layout: Layout): HeroData {
  const slides = Array.from({ length: count }, (_, i) => slide(i + 1))
  return {
    type: 'hero',
    title: 'Ana başlık',
    description: 'Ana açıklama',
    layout,
    ...(count > 1 ? { variant: 'slider', slides } : { image: slides[0].image }),
  } as HeroData
}

function stubMotion(reduce: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

function activeDot(): number {
  const dots = screen.getAllByRole('button', { name: /Go to slide/ })
  return dots.findIndex((d) => d.getAttribute('aria-current') === 'true')
}

const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  stubMotion(false)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe.each(LAYOUTS)('multi-slide hero carousel (%s)', (layout) => {
  it('is an ARIA carousel region with dots and prev/next buttons', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    const region = screen.getByRole('region')
    expect(region.getAttribute('aria-roledescription')).toBe('carousel')
    expect(region.getAttribute('aria-label')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Go to slide/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Previous slide' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Next slide' })).toBeTruthy()
    expect(region.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3)
  })

  it('dots, buttons and arrow keys all change the slide', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    const region = screen.getByRole('region')
    expect(activeDot()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(activeDot()).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Previous slide' }))
    expect(activeDot()).toBe(0)
    fireEvent.click(screen.getAllByRole('button', { name: /Go to slide/ })[2])
    expect(activeDot()).toBe(2)
    fireEvent.keyDown(region, { key: 'ArrowRight' })
    expect(activeDot()).toBe(0)
    fireEvent.keyDown(region, { key: 'ArrowLeft' })
    expect(activeDot()).toBe(2)
    expect(region.getAttribute('tabindex')).toBe('0')
  })

  it('advances automatically every 6 seconds', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    tick(5999)
    expect(activeDot()).toBe(0)
    tick(1)
    expect(activeDot()).toBe(1)
    tick(6000)
    expect(activeDot()).toBe(2)
  })

  it('pauses on hover and resumes on leave', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    const region = screen.getByRole('region')
    fireEvent.mouseEnter(region)
    tick(20000)
    expect(activeDot()).toBe(0)
    fireEvent.mouseLeave(region)
    tick(6000)
    expect(activeDot()).toBe(1)
  })

  it('pauses while focus is inside and resumes on blur', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    const next = screen.getByRole('button', { name: 'Next slide' })
    fireEvent.focusIn(next)
    tick(20000)
    expect(activeDot()).toBe(0)
    fireEvent.focusOut(next)
    tick(6000)
    expect(activeDot()).toBe(1)
  })

  it('stops for good once the screen is touched', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    fireEvent.touchStart(screen.getByRole('region'), { touches: [{ clientX: 10, clientY: 10 }] })
    tick(30000)
    expect(activeDot()).toBe(0)
  })

  it('has a pause button that stops and restarts autoplay', () => {
    render(<HeroSection data={heroData(3, layout)} />)
    const pause = screen.getByRole('button', { name: 'Pause slideshow' })
    fireEvent.click(pause)
    tick(20000)
    expect(activeDot()).toBe(0)
    const play = screen.getByRole('button', { name: 'Play slideshow' })
    expect(play.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(play)
    tick(6000)
    expect(activeDot()).toBe(1)
  })

  it('is OFF under prefers-reduced-motion (no autoplay, no pause button, manual nav still works)', () => {
    stubMotion(true)
    render(<HeroSection data={heroData(3, layout)} />)
    tick(60000)
    expect(activeDot()).toBe(0)
    expect(screen.queryByRole('button', { name: /slideshow/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next slide' }))
    expect(activeDot()).toBe(1)
  })

  it('a single slide shows no dots, arrows, pause button, carousel role or timer', () => {
    const { container } = render(<HeroSection data={heroData(1, layout)} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryByRole('region')).toBeNull()
    expect(container.querySelector('[aria-roledescription]')).toBeNull()
    expect(container.querySelector('[tabindex]')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe.each(LAYOUTS)('hero loading and headings (%s)', (layout) => {
  it('only the first slide image is high priority; the rest load lazily', () => {
    const html = renderToStaticMarkup(<HeroSection data={heroData(3, layout)} />)
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0])
    expect(imgs).toHaveLength(3)
    const preloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/g)].map((m) => m[0])
    expect(preloads).toHaveLength(1)
    expect(preloads[0]).toContain('hero-1.webp')
    expect(imgs[0]).not.toMatch(/loading="lazy"/)
    for (const img of imgs.slice(1)) expect(img).toMatch(/loading="lazy"/)
  })

  it('the page has exactly one h1 (extra slides are h2)', () => {
    const site = buildSampleSite()
    const index = site.sections.findIndex((s) => s.type === 'hero')
    site.sections[index] = heroData(4, layout) as never
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} />)
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
    expect(html).toContain('Slayt 4')
  })

  it('a single-slide hero also renders exactly one h1', () => {
    const site = buildSampleSite()
    const index = site.sections.findIndex((s) => s.type === 'hero')
    site.sections[index] = heroData(1, layout) as never
    const html = renderToStaticMarkup(<WebsiteRenderer site={site} />)
    expect(html.match(/<h1[\s>]/g) ?? []).toHaveLength(1)
  })
})
