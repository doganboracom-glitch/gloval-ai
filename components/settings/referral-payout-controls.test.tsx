// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  lang: 'tr',
  refresh: vi.fn(),
  createRequest: vi.fn(),
}))

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('@/lib/referrals/payout-actions', () => ({ createReferralPayoutRequest: state.createRequest }))

import { ReferralPayoutControls } from './referral-payout-controls'
import type { ReferralPayoutPanelData } from '@/lib/referrals/partner-types'

function payoutData(overrides: Partial<ReferralPayoutPanelData['state']> = {}): ReferralPayoutPanelData {
  const base: NonNullable<ReferralPayoutPanelData['state']> = {
    partnerStatus: 'active',
    taxStatus: 'individual',
    taxVerified: true,
    hasIban: true,
    pendingCents: 0,
    availableCents: 12_105,
    totalCents: 12_105,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
  }
  const merged = { ...base, ...overrides }
  return { state: merged, unavailable: false }
}

beforeEach(() => {
  state.lang = 'tr'
  state.refresh.mockReset()
  state.createRequest.mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => cleanup())

describe('referral payout controls', () => {
  it('keeps payout hidden behind the feature flag and disabled below the available-balance minimum', () => {
    const hidden = render(<ReferralPayoutControls enabled={false} cashEnabled={false} data={payoutData()} />)
    expect(hidden.container.textContent).toBe('')
    hidden.unmount()

    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData()} />)
    const requestButton = screen.getByRole('button', { name: 'Ödeme İste' })
    expect(requestButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('İstek için kullanılabilir bakiyenin en az 1.000 TL olması gerekir.')).toBeTruthy()
  })

  it('opens the method dialog at the threshold and previews rounded credit contribution', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({ availableCents: 100_001, totalCents: 100_001 })} />)

    const requestButton = screen.getByRole('button', { name: 'Ödeme İste' })
    expect(requestButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(requestButton)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'AI Kredisine Dönüşsün' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nakit IBAN/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    expect(screen.getAllByText('1.000,01 TL')).toHaveLength(3)
    expect(screen.getByText('334')).toBeTruthy()
    expect(screen.getByText('1,99 TL')).toBeTruthy()
    expect(state.createRequest).not.toHaveBeenCalled()
  })

  it('hides the cash option when its separate flag is off and disables it when tax verification is required', () => {
    const view = render(<ReferralPayoutControls enabled={true} cashEnabled={false} data={payoutData({ availableCents: 100_000, totalCents: 100_000 })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.queryByRole('button', { name: /Nakit IBAN/ })).toBeNull()
    view.unmount()

    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      availableCents: 100_000,
      totalCents: 100_000,
      partnerStatus: 'suspended',
      taxVerified: false,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.getByRole('button', { name: /Nakit IBAN/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByText(/Bir sonraki nakit ödeme için vergi bilgilerinizin doğrulanması gerekiyor/u).length).toBeGreaterThan(0)
  })

  it('keeps the request disabled while a cash payout is open', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      availableCents: 100_000,
      totalCents: 100_000,
      hasOpenCashRequest: true,
    })} />)
    expect(screen.getByRole('button', { name: 'Ödeme İste' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/Açık bir nakit ödeme isteğiniz var/u)).toBeTruthy()
  })
})
