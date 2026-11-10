// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ lang: 'tr' as 'tr' | 'en' }))

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))

import { HeardFromSummaryCard } from './heard-from-summary-card'
import type { HeardFromSummary } from '@/lib/admin/heard-from-summary'

afterEach(() => cleanup())

const summary: HeardFromSummary = {
  windowDays: 30,
  totalSignups: 20,
  answered: 14,
  unanswered: 6,
  responseRatePct: 70,
  counts: { instagram: 6, facebook: 2, google: 4, friend: 1, press: 0, other: 1 },
}

describe('HeardFromSummaryCard', () => {
  it('renders Turkish counts, rate and the unanswered row', () => {
    state.lang = 'tr'
    render(<HeardFromSummaryCard summary={summary} />)
    expect(screen.getByText(/Bizi nereden duydun\?/)).toBeTruthy()
    expect(screen.getByText(/Son 30 gün/)).toBeTruthy()
    expect(screen.getByText('%70')).toBeTruthy()
    expect(screen.getByText('Instagram').nextElementSibling?.textContent).toBe('6')
    expect(screen.getByText('Cevap vermedi').nextElementSibling?.textContent).toBe('6')
  })

  it('renders English copy', () => {
    state.lang = 'en'
    render(<HeardFromSummaryCard summary={summary} />)
    expect(screen.getByText(/How did you hear about us\?/)).toBeTruthy()
    expect(screen.getByText('70%')).toBeTruthy()
    expect(screen.getByText('Friend')).toBeTruthy()
    expect(screen.getByText('Did not answer')).toBeTruthy()
  })

  it('shows the empty state when nobody answered', () => {
    state.lang = 'tr'
    render(
      <HeardFromSummaryCard
        summary={{
          ...summary,
          answered: 0,
          unanswered: 20,
          responseRatePct: 0,
          counts: { instagram: 0, facebook: 0, google: 0, friend: 0, press: 0, other: 0 },
        }}
      />,
    )
    expect(screen.getByText('Henüz cevap yok')).toBeTruthy()
    expect(screen.queryByText('Instagram')).toBeNull()
  })
})
