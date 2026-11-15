// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PaketlerPlansSection } from '@/components/paketler-campaign-landing'
import { PLANS } from '@/lib/pricing-config'

describe('Paketler campaign plan cards', () => {
  it('renders every current plan from the shared pricing configuration', () => {
    render(<PaketlerPlansSection />)

    expect(screen.getAllByRole('article')).toHaveLength(PLANS.length)
    for (const plan of PLANS) {
      expect(screen.getByRole('heading', { level: 3, name: plan.name })).toBeTruthy()
    }
  })
})
