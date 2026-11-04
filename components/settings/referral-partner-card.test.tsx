// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  lang: 'tr',
  refresh: vi.fn(),
  activate: vi.fn(),
  close: vi.fn(),
  saveIban: vi.fn(),
}))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: state.lang }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }))
vi.mock('@/lib/referrals/partner-actions', () => ({
  activateReferralPartner: state.activate,
  closeReferralPartner: state.close,
  saveReferralPartnerIban: state.saveIban,
}))

import { ReferralPartnerCard } from '@/components/settings/referral-partner-card'

beforeEach(() => {
  state.lang = 'tr'
  state.refresh.mockReset()
  state.activate.mockReset()
  state.close.mockReset()
  state.saveIban.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('referral partner settings card', () => {
  it('renders no referral menu or card while the feature flag is off', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, { enabled: false, partner: null }))
    expect(html).toBe('')
    expect(html).not.toContain('Satış Ortaklığı')
    expect(html).not.toContain('Referral Partner')
  })

  it('shows the active link and only the IBAN last four digits', () => {
    state.lang = 'en'
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
    }))

    expect(html).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('Copy link')
    expect(html).toContain('4321')
    expect(html).not.toContain('TR123456789012345678901234')
    expect(html).toContain('Close partnership')
  })

  it('places a scrollable terms box before the required acceptance checkbox', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, { enabled: true, partner: null }))
    const termsPosition = html.indexOf('aria-label="Satış ortaklığı programı şartları"')
    const checkboxPosition = html.indexOf('id="referral-terms-accepted"')

    expect(termsPosition).toBeGreaterThanOrEqual(0)
    expect(checkboxPosition).toBeGreaterThan(termsPosition)
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('Ödeme koşulları ayrıca duyurulacaktır.')
    expect(html).not.toContain('%20')
    expect(html).not.toContain('1.000 TL')
    expect(html).not.toContain('14 günlük')
    expect(html).toContain('Şartların tamamını aç')
    expect(html).toContain('Türkiye IBAN')
  })

  it('keeps the active referral link and asks for an IBAN after reactivation', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: null },
    }))

    expect(html).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('IBAN ekleyin')
    expect(html).toContain('id="referral-iban-update"')
    expect(html).toContain('yönlendirme bağlantınız çalışıyor.')
  })

  it('links closed partners to support for reactivation', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'closed', ibanLast4: null },
    }))

    expect(html).toContain('Yeniden etkinleştirme için destek ekibiyle iletişime geçin.')
    expect(html).toContain('href="/support"')
    expect(html).toContain('Destek sayfası')
  })

  it('saves a missing IBAN without showing the activation indicator', async () => {
    state.saveIban.mockResolvedValueOnce({ ok: true, ibanLast4: '4321' })
    const { container } = render(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: null },
    }))

    fireEvent.change(screen.getByLabelText('IBAN'), { target: { value: 'TR123456789012345678901234' } })
    fireEvent.submit(container.querySelector('form')!)

    await waitFor(() => expect(state.saveIban).toHaveBeenCalledWith({ iban: 'TR123456789012345678901234' }))
    expect(screen.getByText('IBAN kaydedildi.')).toBeTruthy()
    expect(container.querySelector('.referral-activated-dot')).toBeNull()
  })

  it('shows the pulsing dot only on the activation success notice', async () => {
    state.activate.mockResolvedValueOnce({ ok: true, referralCode: 'PARTNER1234', ibanLast4: '4321' })
    const view = render(createElement(ReferralPartnerCard, { enabled: true, partner: null }))

    fireEvent.change(screen.getByLabelText('Ödeme alacak kişinin / kuruluşun adı'), { target: { value: 'Örnek Ortak' } })
    fireEvent.change(screen.getByLabelText('IBAN'), { target: { value: 'TR123456789012345678901234' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.submit(view.container.querySelector('form')!)

    await waitFor(() => expect(state.activate).toHaveBeenCalled())
    view.rerender(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
    }))

    expect(screen.getByText('Satış ortaklığı etkinleştirildi.')).toBeTruthy()
    expect(view.container.querySelector('.referral-activated-dot')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('disables the activation pulse for reduced-motion users', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

    expect(css).toContain('@keyframes referral-activated-pulse')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.referral-activated-dot\s*\{\s*animation:\s*none;/u)
  })
})
