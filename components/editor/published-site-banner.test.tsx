// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PublishedSiteBanner } from '@/components/editor/published-site-banner'
import { SAMPLE_PUBLISH_COPY } from '@/components/editor/sample-publish-dialog'

const URL = 'https://kahve.gloval.site'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PublishedSiteBanner', () => {
  it('shows a prominent external link that opens safely in a new tab', () => {
    render(<PublishedSiteBanner url={URL} label="Siten yayında:" />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toContain('kahve.gloval.site')
    expect(link.className).toMatch(/text-brand/)
    expect(link.className).toMatch(/font-bold/)
    expect(link.className).toMatch(/underline/)
    expect(link.querySelector('svg')).not.toBeNull()
  })

  it('copies the full address and confirms it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<PublishedSiteBanner url={URL} label="Siten yayında:" />)

    fireEvent.click(screen.getByRole('button', { name: 'Site adresini kopyala' }))
    await waitFor(() => expect(screen.getByText('Kopyalandı')).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(URL)
  })

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    })
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    render(<PublishedSiteBanner url={URL} label="Your site is live:" lang="en" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy site address' }))
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
    expect(exec).toHaveBeenCalledWith('copy')
  })
})

describe('sample publish dialog section names', () => {
  const TYPES = [
    'services', 'testimonials', 'references', 'team', 'about', 'faq', 'stats', 'pricing',
    'products', 'contact', 'features', 'gallery', 'portfolio', 'categories', 'process',
    'announcement', 'heroStrip', 'slider', 'blogLatest', 'cta',
  ]

  it('has a human-readable name for every section type in both languages', () => {
    for (const lang of ['tr', 'en'] as const) {
      const names = SAMPLE_PUBLISH_COPY[lang].sections as Record<string, string>
      for (const type of TYPES) {
        expect(names[type], `${lang}:${type}`).toBeTruthy()
        expect(names[type]).not.toBe(type)
      }
    }
  })

  it('uses the requested Turkish names', () => {
    const tr = SAMPLE_PUBLISH_COPY.tr.sections as Record<string, string>
    expect(tr).toMatchObject({
      services: 'Hizmetler',
      testimonials: 'Müşteri yorumları',
      references: 'Referanslar',
      team: 'Kadromuz',
    })
  })
})
