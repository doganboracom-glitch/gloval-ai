// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SiteAddressBanner } from '@/components/editor/site-address-banner'
import { resolveSiteAddress } from '@/lib/site-address'

const LIVE = { url: 'https://kahve.gloval.site', host: 'kahve.gloval.site', published: true }
const DRAFT = { url: 'https://kahve.gloval.site', host: 'kahve.gloval.site', published: false }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SiteAddressBanner (published)', () => {
  it('shows a prominent external link that opens safely in a new tab', () => {
    render(<SiteAddressBanner address={LIVE} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe(LIVE.url)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.textContent).toContain('kahve.gloval.site')
    expect(link.className).toMatch(/text-brand/)
    expect(link.className).toMatch(/font-bold/)
  })

  it('copies the full address and confirms it', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<SiteAddressBanner address={LIVE} />)

    fireEvent.click(screen.getByRole('button', { name: 'Site adresini kopyala' }))
    await waitFor(() => expect(screen.getByText('Kopyalandı')).toBeTruthy())
    expect(writeText).toHaveBeenCalledWith(LIVE.url)
  })

  it('falls back to execCommand when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
      configurable: true,
    })
    const exec = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true })
    render(<SiteAddressBanner address={LIVE} lang="en" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy site address' }))
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy())
    expect(exec).toHaveBeenCalledWith('copy')
  })
})

describe('SiteAddressBanner (unpublished)', () => {
  it('announces the future address and never renders an openable link', () => {
    render(<SiteAddressBanner address={DRAFT} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/adresinde yayınlanacaktır/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /kahve\.gloval\.site/ })).toBeTruthy()
  })

  it('explains itself when the address is clicked', () => {
    render(<SiteAddressBanner address={DRAFT} />)
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /kahve\.gloval\.site/ }))
    expect(screen.getByRole('status').textContent).toBe('Siteyi yayınladığında bu adreste açılır.')
  })
})

describe('resolveSiteAddress', () => {
  it('prefers a live custom domain once published', () => {
    const a = resolveSiteAddress({ published: true, slug: 'kahve', draftSlug: 'x', customOrigin: 'https://kahve.com' })
    expect(a).toEqual({ url: 'https://kahve.com', host: 'kahve.com', published: true })
  })

  it('uses the assigned tenant subdomain when published without a custom domain', () => {
    const a = resolveSiteAddress({ published: true, slug: 'kahve-2', draftSlug: 'kahve' })
    expect(a.host).toBe('kahve-2.gloval.site')
    expect(a.published).toBe(true)
  })

  it('ignores a custom domain while unpublished', () => {
    const a = resolveSiteAddress({ published: false, slug: 'kahve', draftSlug: 'x', customOrigin: 'https://kahve.com' })
    expect(a).toMatchObject({ host: 'kahve.gloval.site', published: false })
  })

  it('falls back to the name-derived slug before the first publish', () => {
    const a = resolveSiteAddress({ published: false, slug: null, draftSlug: 'yeni-site' })
    expect(a).toMatchObject({ host: 'yeni-site.gloval.site', published: false })
  })
})
