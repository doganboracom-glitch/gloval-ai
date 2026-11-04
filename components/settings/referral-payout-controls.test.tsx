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
    availableCents: 299,
    totalCents: 299,
    convertibleCents: 299,
    requestedCents: 0,
    convertedCents: 0,
    paidCents: 0,
    hasOpenCashRequest: false,
    maxCreditCents: overrides.convertibleCents ?? 299,
    maxCashCents: Math.max(0, overrides.availableCents ?? 0),
    hasDebtBucket: false,
    partialPayoutsAvailable: true,
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
  it('keeps payout hidden behind the feature flag and disabled below the 3 TL credit minimum', () => {
    const hidden = render(<ReferralPayoutControls enabled={false} cashEnabled={false} data={payoutData()} />)
    expect(hidden.container.textContent).toBe('')
    hidden.unmount()

    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData()} />)
    const requestButton = screen.getByRole('button', { name: 'Ödeme İste' })
    expect(requestButton.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('AI kredisine dönüşüm için toplam bakiyenin en az 3 TL olması gerekir.')).toBeTruthy()
  })

  it('shows the immediate full credit preview after continuing, including zero system top-up at exactly 3 TL', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      pendingCents: 0,
      availableCents: 300,
      totalCents: 300,
      convertibleCents: 300,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    expect(screen.getByRole('button', { name: 'AI kredisi olarak al' })).toBeTruthy()
    expect(screen.getByRole('button', { name: "IBAN'a ödeme iste" }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Bu tutar, 14 günlük bekleme tamamlanmadan da AI kredisi olarak hemen eklenir.')).toBeTruthy()
    expect(screen.getAllByText('3,00 TL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0,00 TL').length).toBeGreaterThan(0)
  })

  it('converts a pending balance immediately while keeping the IBAN option disabled with its hold reason', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      pendingCents: 300,
      availableCents: 0,
      totalCents: 300,
      convertibleCents: 300,
    })} />)

    const requestButton = screen.getByRole('button', { name: 'Ödeme İste' })
    expect(requestButton.hasAttribute('disabled')).toBe(false)
    fireEvent.click(requestButton)
    expect(screen.getByRole('button', { name: "IBAN'a ödeme iste" }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByText(/14 günlük bekleme tamamlandığında ve kullanılabilir bakiye 1\.000 TL'ye ulaştığında/u).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    expect(screen.getByText('Kullanılacak komisyon bakiyesi')).toBeTruthy()
  })

  it('keeps the IBAN option active when the available balance meets cash conditions', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      pendingCents: 0,
      availableCents: 100_000,
      totalCents: 100_000,
      convertibleCents: 100_000,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.getByRole('button', { name: "IBAN'a ödeme iste" }).hasAttribute('disabled')).toBe(false)
  })

  it('hides cash when its separate flag is off and disables it when tax verification is required', () => {
    const view = render(<ReferralPayoutControls enabled={true} cashEnabled={false} data={payoutData({
      availableCents: 100_000,
      totalCents: 100_000,
      convertibleCents: 100_000,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.queryByRole('button', { name: /IBAN'a ödeme iste/u })).toBeNull()
    view.unmount()

    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      availableCents: 100_000,
      totalCents: 100_000,
      convertibleCents: 100_000,
      partnerStatus: 'suspended',
      taxVerified: false,
    })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    expect(screen.getByRole('button', { name: /IBAN'a ödeme iste/u }).hasAttribute('disabled')).toBe(true)
    expect(screen.getAllByText(/Bir sonraki nakit ödeme için vergi bilgilerinizin doğrulanması gerekiyor/u).length).toBeGreaterThan(0)
  })

  it('parses a partial credit amount in Turkish formatting without rounding the entered kuruş', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      pendingCents: 0,
      availableCents: 200_000,
      totalCents: 200_000,
      convertibleCents: 200_000,
      maxCreditCents: 200_000,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    fireEvent.click(screen.getByRole('button', { name: 'Belirli tutar' }))
    fireEvent.change(screen.getByLabelText('Talep edilecek tutar (TL)'), { target: { value: '1.234,50' } })

    expect(screen.getByText('1.234,50 TL')).toBeTruthy()
    expect(screen.getByText('412')).toBeTruthy()
    expect(screen.getByText('1,50 TL')).toBeTruthy()
  })

  it('offers both company VAT modes and recalculates the invoice preview in kuruş', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      taxStatus: 'company',
      pendingCents: 0,
      availableCents: 150_000,
      totalCents: 150_000,
      convertibleCents: 0,
      maxCreditCents: 0,
      maxCashCents: 150_000,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    fireEvent.click(screen.getByRole('radio', { name: /KDV tutara dahil/u }))
    expect(screen.getByText('1.250,00 TL')).toBeTruthy()
    expect(screen.getByText('250,00 TL')).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: /Tutar üzerine %20 KDV eklensin/u }))
    expect(screen.getByText('1.500,00 TL')).toBeTruthy()
    expect(screen.getByText('300,00 TL')).toBeTruthy()
    expect(screen.getAllByText('1.800,00 TL').length).toBeGreaterThan(0)
  })

  it('disables partial credit when a future negative bucket exists', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      pendingCents: 0,
      availableCents: 10_000,
      totalCents: 10_000,
      convertibleCents: 10_000,
      maxCreditCents: 10_000,
      hasDebtBucket: true,
    })} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ödeme İste' }))
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))

    expect(screen.getByRole('button', { name: 'Belirli tutar' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText(/negatif.*yalnızca bakiyenin tamamı/u)).toBeTruthy()
  })

  it('allows credit requests while an open cash request keeps only the IBAN method disabled', () => {
    render(<ReferralPayoutControls enabled={true} cashEnabled={true} data={payoutData({
      availableCents: 5_000,
      totalCents: 5_000,
      convertibleCents: 5_000,
      hasOpenCashRequest: true,
    })} />)

    const requestButton = screen.getByRole('button', { name: 'Ödeme İste' })
    expect(requestButton.hasAttribute('disabled')).toBe(false)
    expect(screen.getAllByText(/AI kredisine dönüşüm kullanılabilir/u).length).toBeGreaterThan(0)
    fireEvent.click(requestButton)
    expect(screen.getByRole('button', { name: "IBAN'a ödeme iste" }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'AI kredisi olarak al' }).hasAttribute('disabled')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }))
    expect(screen.getByText('Kullanılacak komisyon bakiyesi')).toBeTruthy()
  })
})
