// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  lang: 'tr',
  refresh: vi.fn(),
  actions: vi.fn(),
}))

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('@/lib/referrals/admin-payout-actions', () => ({
  processReferralCashPayout: state.actions,
  recordReferralCashInvoice: state.actions,
  rejectReferralCashPayout: state.actions,
  revealReferralPayoutIban: state.actions,
  verifyReferralPartnerTax: state.actions,
}))

import { ReferralPayoutsAdminTable } from './referral-payouts-admin-table'
import type { ReferralPayoutAdminRequest, ReferralPayoutAdminSummary } from '@/lib/referrals/partner-types'

const PARTNER_ID = '22222222-2222-4222-8222-222222222222'

function request(overrides: Partial<ReferralPayoutAdminRequest> = {}): ReferralPayoutAdminRequest {
  return {
    requestId: '33333333-3333-4333-8333-333333333333',
    partnerId: PARTNER_ID,
    referralCode: 'CASH1234',
    partnerStatus: 'active',
    maskedEmail: 'm***@example.test',
    payeeName: 'Test Partner',
    taxStatus: 'individual',
    taxVerifiedAt: '2026-11-04T12:00:00.000Z',
    ibanLast4: '1234',
    method: 'cash',
    balanceCents: 100_000,
    payoutCents: 100_000,
    creditAmount: null,
    systemTopupCents: 0,
    invoiceRequired: false,
    partial: false,
    vatMode: null,
    invoiceNetCents: null,
    invoiceVatCents: null,
    invoiceGrossCents: null,
    invoiceConfirmed: false,
    invoiceReference: null,
    invoiceReceivedAt: null,
    paymentReference: null,
    adminNote: null,
    status: 'requested',
    requestedAt: '2026-11-04T12:00:00.000Z',
    processedAt: null,
    rejectionReason: null,
    ...overrides,
  }
}

const summary: ReferralPayoutAdminSummary = {
  pendingCents: 10_000,
  availableCents: 100_000,
  convertedCents: 20_000,
  systemTopupCents: 200,
  paidCents: 30_000,
  openCashRequests: 1,
}

beforeEach(() => {
  state.lang = 'tr'
  state.refresh.mockReset()
  state.actions.mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => cleanup())

describe('referral payout admin table', () => {
  it('separates the cash queue from read-only credit conversion history', () => {
    const cashRequest = request()
    const creditConversion = request({
      requestId: '55555555-5555-4555-8555-555555555555',
      referralCode: 'CREDIT12',
      method: 'credit',
      status: 'processed',
      balanceCents: 8_820,
      payoutCents: 8_820,
      creditAmount: 30,
      systemTopupCents: 180,
      requestedAt: '2026-11-03T12:00:00.000Z',
      processedAt: '2026-11-04T12:00:00.000Z',
    })
    render(<ReferralPayoutsAdminTable enabled requests={[cashRequest, creditConversion]} summary={summary} />)

    const tables = screen.getAllByRole('table')
    expect(tables).toHaveLength(2)
    expect(within(tables[0]).getByText('CASH1234')).toBeTruthy()
    expect(within(tables[0]).queryByText('CREDIT12')).toBeNull()
    expect(within(tables[1]).getByText('CREDIT12')).toBeTruthy()
    expect(within(tables[1]).getByText('Dönüştürüldü')).toBeTruthy()
    expect(within(tables[1]).queryByRole('button')).toBeNull()
  })

  it('shows partial commission, VAT mode, and invoice net, VAT, and gross values', () => {
    const companyRequest = request({
      taxStatus: 'company',
      balanceCents: 100_005,
      payoutCents: 120_006,
      partial: true,
      vatMode: 'added',
      invoiceRequired: true,
      invoiceNetCents: 100_005,
      invoiceVatCents: 20_001,
      invoiceGrossCents: 120_006,
    })
    render(<ReferralPayoutsAdminTable enabled requests={[companyRequest]} summary={summary} />)

    const cashTable = screen.getAllByRole('table')[0]
    expect(within(cashTable).getByText('Kısmi tutar')).toBeTruthy()
    expect(within(cashTable).getByText(/KDV hariç \+ %20/u)).toBeTruthy()
    expect(within(cashTable).getAllByText(/1\.000,05 TL/u).length).toBe(2)
    expect(within(cashTable).getAllByText(/200,01 TL/u).length).toBe(1)
    expect(within(cashTable).getAllByText('1.200,06 TL').length).toBeGreaterThan(0)
  })

  it('filters cash request rows by status and masked partner lookup', () => {
    const requested = request()
    const processed = request({
      requestId: '44444444-4444-4444-8444-444444444444',
      referralCode: 'PAID1234',
      status: 'processed',
      paymentReference: 'BANK-REF-01',
      processedAt: '2026-11-04T13:00:00.000Z',
    })
    render(<ReferralPayoutsAdminTable enabled requests={[requested, processed]} summary={summary} />)

    const statusFilter = screen.getByRole('combobox', { name: 'Durum filtresi' })
    fireEvent.change(statusFilter, { target: { value: 'processed' } })
    let cashTable = screen.getAllByRole('table')[0]
    expect(within(cashTable).getByText('PAID1234')).toBeTruthy()
    expect(within(cashTable).queryByText('CASH1234')).toBeNull()

    fireEvent.change(statusFilter, { target: { value: 'all' } })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Kod, maskeli e-posta veya talep kimliği ara' }), {
      target: { value: 'CASH1234' },
    })
    cashTable = screen.getAllByRole('table')[0]
    expect(within(cashTable).getByText('CASH1234')).toBeTruthy()
    expect(within(cashTable).queryByText('PAID1234')).toBeNull()
  })
})
