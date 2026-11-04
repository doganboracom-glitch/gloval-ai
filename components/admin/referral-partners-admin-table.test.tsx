// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  lang: 'tr',
  refresh: vi.fn(),
  search: vi.fn(),
  update: vi.fn(),
  history: vi.fn(),
}))

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('@/lib/referrals/admin-actions', () => ({
  getReferralPartnerHistory: state.history,
  searchReferralPartners: state.search,
  updateReferralPartnerStatus: state.update,
}))

import { ReferralPartnersAdminTable } from './referral-partners-admin-table'

const partners = [
  {
    partnerId: '22222222-2222-4222-8222-222222222222',
    referralCode: 'ACTIVE1234',
    maskedEmail: 'a***@example.test',
    status: 'active' as const,
    activatedAt: '2026-11-04T12:00:00.000Z',
    lastStatusChangedAt: '2026-11-04T12:00:00.000Z',
    ibanLast4: '4321',
    clicks: 20,
    signups: 2,
    verifiedSignups: 1,
    paidCustomers: 1,
  },
  {
    partnerId: '33333333-3333-4333-8333-333333333333',
    referralCode: 'PAUSED5678',
    maskedEmail: 'b***@example.test',
    status: 'suspended' as const,
    activatedAt: '2026-11-03T12:00:00.000Z',
    lastStatusChangedAt: '2026-11-04T11:00:00.000Z',
    ibanLast4: null,
    clicks: 10,
    signups: 1,
    verifiedSignups: 1,
    paidCustomers: 0,
  },
]

beforeEach(() => {
  state.lang = 'tr'
  state.refresh.mockReset()
  state.search.mockReset().mockResolvedValue([])
  state.update.mockReset().mockResolvedValue({ ok: true })
  state.history.mockReset().mockResolvedValue([])
})

afterEach(() => cleanup())

describe('ReferralPartnersAdminTable', () => {
  it('searches by raw email through the server action and renders only a masked address', async () => {
    state.search.mockResolvedValueOnce([{
      ...partners[0],
      maskedEmail: 'm***@example.test',
    }])
    render(<ReferralPartnersAdminTable partners={partners} />)

    const input = screen.getByLabelText('E-posta veya yönlendirme kodu')
    fireEvent.change(input, { target: { value: 'member@example.test' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => expect(state.search).toHaveBeenCalledWith('member@example.test'))
    expect(screen.getAllByText('m***@example.test')).toHaveLength(2)
    expect(screen.queryByText('member@example.test')).toBeNull()
  })

  it('filters by partner status without losing the complete referral code', () => {
    render(<ReferralPartnersAdminTable partners={partners} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Durum filtresi' }), {
      target: { value: 'suspended' },
    })

    expect(screen.getAllByText('PAUSED5678')).toHaveLength(2)
    expect(screen.queryByText('ACTIVE1234')).toBeNull()
  })

  it('requires confirmation before an admin status action reaches the server', async () => {
    render(<ReferralPartnersAdminTable partners={partners} />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Kapat' })[0])
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog.textContent).toContain('Ortaklık kapatılsın mı?')
    expect(dialog.textContent).toContain('ACTIVE1234')
    expect(state.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))

    await waitFor(() => expect(state.update).toHaveBeenCalledWith(
      partners[0].partnerId,
      'close',
    ))
    expect(state.refresh).toHaveBeenCalledOnce()
  })
})
