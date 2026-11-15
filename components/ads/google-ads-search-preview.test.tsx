// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: 'en' }) }))

import { GoogleAdsSearchPreview } from '@/components/ads/google-ads-search-preview'

afterEach(cleanup)

describe('GoogleAdsSearchPreview overflow handling', () => {
  it('truncates long URLs while preserving their full title and wraps ad copy', () => {
    const displayUrl = 'https://abonesepeti.com/abonelik/yonetim/very-long-campaign-path'
    const headline = 'An exceptionally long headline without spaces that should still wrap safely'
    const description = 'A long description that needs to wrap within the rounded preview card instead of extending beyond its border.'

    render(
      <GoogleAdsSearchPreview
        headlines={[headline]}
        descriptions={[description]}
        displayUrl={displayUrl}
        finalUrl={displayUrl}
        keywords={['subscription']}
      />,
    )

    const section = screen.getByRole('region', { name: 'Ad preview' })
    const previewCard = screen.getByTestId('ad-preview')
    const url = screen.getByTitle(displayUrl)
    const urlRow = url.closest('p')!
    const badge = screen.getByText('Sponsored')
    const headlineElement = screen.getByTestId('preview-headline')
    const descriptionElement = screen.getByText(description)

    expect(section.className).toContain('min-w-0')
    expect(section.className).toContain('overflow-hidden')
    expect(previewCard.className).toContain('min-w-0')
    expect(previewCard.className).toContain('overflow-hidden')
    expect(urlRow.className).toContain('min-w-0')
    expect(badge.className).toContain('shrink-0')
    expect(url.className).toContain('min-w-0')
    expect(url.className).toContain('flex-1')
    expect(url.className).toContain('truncate')
    expect(url.className).toContain('break-all')
    expect(url.title).toBe(displayUrl)
    expect(headlineElement.className).toContain('break-words')
    expect(headlineElement.textContent).toBe(headline)
    expect(descriptionElement.className).toContain('break-words')
  })
})
