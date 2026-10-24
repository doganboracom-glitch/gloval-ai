// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { HeroSection } from '@/components/website-renderer/sections/hero-section'
import { SiteNavProvider } from '@/components/website-renderer/site-nav-context'

type HeroData = Parameters<typeof HeroSection>[0]['data']

function showcaseHero(secondaryHref: string): HeroData {
  return {
    type: 'hero',
    variant: 'showcase',
    title: 'Ana başlık',
    description: 'Ana açıklama',
    image: { imagePrompt: 'p', src: '/hero.webp', alt: 'Görsel', aspectRatio: '16/9' },
    primaryButton: { label: 'Birincil', href: '/iletisim' },
    secondaryButton: { label: 'Galeri', href: secondaryHref },
  } as HeroData
}

function mount(href: string, { preview, handler }: { preview: boolean; handler?: (h: string) => boolean }) {
  return render(
    <SiteNavProvider handler={handler ?? (() => false)} preview={preview}>
      <HeroSection data={showcaseHero(href)} />
    </SiteNavProvider>,
  )
}

afterEach(cleanup)

/** fireEvent.click returns false exactly when preventDefault was called. */
const clickAllowed = (el: HTMLElement) => fireEvent.click(el)

describe('hero overlay secondary button', () => {
  it('published: a real route keeps the browser default (navigates)', () => {
    mount('/galeri', { preview: false })
    expect(clickAllowed(screen.getByRole('link', { name: 'Galeri' }))).toBe(true)
  })

  it('published: a route the renderer handles in memory is intercepted by the nav handler', () => {
    const handler = vi.fn(() => true)
    mount('/galeri', { preview: false, handler })
    expect(clickAllowed(screen.getByRole('link', { name: 'Galeri' }))).toBe(false)
    expect(handler).toHaveBeenCalledWith('/galeri')
  })

  it('published: an #anchor smooth-scrolls to its section instead of being dead', () => {
    const scrollIntoView = vi.fn()
    const target = document.createElement('section')
    target.id = 'services'
    target.scrollIntoView = scrollIntoView
    document.body.appendChild(target)
    mount('#services', { preview: false })
    expect(clickAllowed(screen.getByRole('link', { name: 'Galeri' }))).toBe(false)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    target.remove()
  })

  it('preview: every click is blocked and never reaches the nav handler or scroll', () => {
    const handler = vi.fn(() => false)
    mount('/galeri', { preview: true, handler })
    const link = screen.getByRole('link', { name: 'Galeri' })
    expect(clickAllowed(link)).toBe(false)
    expect(handler).not.toHaveBeenCalled()
  })

  it('preview: anchors are blocked too', () => {
    mount('#services', { preview: true })
    expect(clickAllowed(screen.getByRole('link', { name: 'Galeri' }))).toBe(false)
  })

  it('rendered HTML is identical in preview and published mode (only onClick differs)', () => {
    const html = (preview: boolean) =>
      renderToStaticMarkup(
        <SiteNavProvider handler={() => false} preview={preview}>
          <HeroSection data={showcaseHero('/galeri')} />
        </SiteNavProvider>,
      )
    expect(html(false)).toBe(html(true))
    expect(html(false)).toContain('href="/galeri"')
  })
})
