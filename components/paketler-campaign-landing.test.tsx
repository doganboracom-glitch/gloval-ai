// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PaketlerCampaignLanding, PaketlerPlansSection } from '@/components/paketler-campaign-landing'
import { PLANS } from '@/lib/pricing-config'

afterEach(cleanup)

describe('Paketler campaign landing', () => {
  it('keeps the hero title as one accessible sentence', () => {
    render(<PaketlerCampaignLanding />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Bütçene uygun web sitesi çözümleri' }),
    ).toBeTruthy()
  })

  it('links the final campaign CTA to the FAQ in the same tab', () => {
    render(<PaketlerCampaignLanding />)

    const faqLink = screen.getByRole('link', { name: 'Sıkça Sorulan Sorular' })
    expect(faqLink.getAttribute('href')).toBe('/sss')
    expect(faqLink.getAttribute('target')).toBeNull()
  })
})

describe('Paketler campaign plan cards', () => {
  it('renders every current plan from the shared pricing configuration', () => {
    render(<PaketlerPlansSection />)

    expect(screen.getAllByRole('article')).toHaveLength(PLANS.length)
    for (const plan of PLANS) {
      expect(screen.getByRole('heading', { level: 3, name: plan.name })).toBeTruthy()
    }
  })
})
