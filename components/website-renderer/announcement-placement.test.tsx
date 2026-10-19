// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { SWRConfig } from 'swr'
import { WebsiteRenderer } from '@/components/website-renderer/website-renderer'
import { applyOperation } from '@/lib/website-edit-operations'
import type { WebsiteSchema } from '@/lib/website-schema'

vi.mock('@/lib/store-session-client', () => ({
  fetchStoreSession: async () => ({ loggedIn: false }),
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
})

afterEach(() => cleanup())

function baseSite(): WebsiteSchema {
  return {
    meta: {
      name: 'Acme',
      tagline: 'Acme tagline',
      description: 'Acme',
      language: 'tr',
      tone: 'sade, güvenilir',
      audience: 'küçük işletmeler',
    },
    theme: {
      mode: 'light',
      radius: 'medium',
      palette: [
        { name: 'primary', hex: '#7c3aed' },
        { name: 'background', hex: '#ffffff' },
        { name: 'foreground', hex: '#111111' },
      ],
    },
    typography: { headingFont: 'Inter', bodyFont: 'Inter' },
    navigation: { logoText: 'Acme', links: [{ label: 'SSS', href: '#faq' }] },
    pages: [{ slug: 'home', title: 'Ana Sayfa', isHome: true }],
    sections: [
      { type: 'hero', title: 'HERO-MARK', description: 'Alt başlık' },
      {
        type: 'faq',
        title: 'FAQ-MARK',
        items: [
          { question: 'Soru bir?', answer: 'Cevap bir.' },
          { question: 'Soru iki?', answer: 'Cevap iki.' },
        ],
      },
      { type: 'footer', tagline: 'FOOTER-MARK' },
    ],
  } as unknown as WebsiteSchema
}

function withBandAt(position: 'top' | 'after-hero' | 'after-faq'): WebsiteSchema {
  let next = applyOperation(baseSite(), { op: 'addSection', sectionType: 'announcement' })
  const moves = position === 'top' ? 0 : position === 'after-hero' ? 1 : 2
  for (let i = 0; i < moves; i++) {
    next = applyOperation(next, { op: 'moveSection', index: i, direction: 'down' })
  }
  return next
}

function mount(site: WebsiteSchema) {
  return render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <WebsiteRenderer site={site} preview={{ onStoreRoute: () => {}, slug: 'acme' } as never} />
    </SWRConfig>,
  )
}

function position(container: HTMLElement, selector: string) {
  const all = Array.from(container.querySelectorAll<HTMLElement>('*'))
  const el = container.querySelector<HTMLElement>(selector)
  return el ? all.indexOf(el) : -1
}

function positionOfText(container: HTMLElement, text: string) {
  const all = Array.from(container.querySelectorAll<HTMLElement>('*'))
  const el = all.find((node) => node.children.length === 0 && node.textContent?.includes(text))
  return el ? all.indexOf(el) : -1
}

describe('announcement band in the rendered page', () => {
  it('renders between the FAQ and the footer after being moved below the FAQ', () => {
    const { container } = mount(withBandAt('after-faq'))
    const band = position(container, '[data-gv-announcement]')
    expect(band).toBeGreaterThan(-1)
    expect(band).toBeGreaterThan(positionOfText(container, 'FAQ-MARK'))
    expect(band).toBeLessThan(positionOfText(container, 'FOOTER-MARK'))
  })

  it('renders in the flow right after the hero, below the header', () => {
    const { container } = mount(withBandAt('after-hero'))
    const band = position(container, '[data-gv-announcement]')
    expect(band).toBeGreaterThan(positionOfText(container, 'HERO-MARK'))
    expect(band).toBeLessThan(positionOfText(container, 'FAQ-MARK'))
  })

  it('renders above the header when it is the first section', () => {
    const { container } = mount(withBandAt('top'))
    expect(position(container, '[data-gv-announcement]')).toBeLessThan(position(container, 'header'))
  })

  it('renders exactly one band in every position', () => {
    for (const where of ['top', 'after-hero', 'after-faq'] as const) {
      const { container } = mount(withBandAt(where))
      expect(container.querySelectorAll('[data-gv-announcement]')).toHaveLength(1)
      cleanup()
    }
  })
})
