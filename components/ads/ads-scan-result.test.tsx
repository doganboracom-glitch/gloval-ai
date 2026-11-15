// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dictionary } from '@/lib/i18n'
import { sampleScanResult } from '@/lib/ads/testing/scan-result-fixture'

vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ lang: 'tr', t: dictionary.tr }),
}))
vi.mock('@/components/ads/ads-handoff-action', () => ({ AdsHandoffAction: () => null }))
vi.mock('@/components/ads/sections/ads-new-scan-button', () => ({ AdsNewScanButton: () => null }))

import { AdsScanResult } from './ads-scan-result'

afterEach(cleanup)

describe('AdsScanResult ad preview overflow handling', () => {
  it('truncates long URLs and wraps long ad copy inside the preview card', () => {
    const displayUrl = 'https://abonesepeti.com/abonelik/yonetim/very-long-campaign-path'
    const headline = 'An exceptionally long headline without spaces that should still wrap safely'
    const description = 'A long description that needs to wrap within the rounded preview card instead of extending beyond its border.'
    const result = {
      ...sampleScanResult,
      ad: { headlines: [headline], descriptions: [description], displayUrl },
    }

    render(<AdsScanResult result={result} onNewScan={() => undefined} />)

    const section = screen.getByRole('region', { name: dictionary.tr.ads.adPreviewTitle })
    const previewCard = section.querySelector('div.rounded-xl')!
    const url = screen.getByTitle(displayUrl)
    const urlRow = url.closest('p')!
    const badge = screen.getByText(dictionary.tr.ads.adLabel)
    const headlineElement = screen.getByText(headline)
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
    expect(headlineElement.className).toContain('min-w-0')
    expect(headlineElement.className).toContain('break-words')
    expect(descriptionElement.className).toContain('min-w-0')
    expect(descriptionElement.className).toContain('break-words')
  })
})
