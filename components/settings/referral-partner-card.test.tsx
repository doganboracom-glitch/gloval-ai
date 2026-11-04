// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ReferralPayoutPanelData } from '@/lib/referrals/partner-types'
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

    expect(html.replace(/<[^>]*>/gu, '')).toContain('https://gloval.ai/?ref=PARTNER1234')
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
    expect(html).toContain('KDV hariç tutarın %20')
    expect(html).toContain('1.000 TL')
    expect(html).toContain('Dönüşüm için en az 3 TL gerekir')
    expect(html).toContain('bekleyen ve kullanılabilir komisyonların tamamı')
    expect(html).toContain('14 gün')
    expect(html).toContain('gider belgesi GLOVAL tarafından düzenlenir')
    expect(html).toContain('TCKN veya vergi numarası bu uygulamada toplanmaz')
    expect(html).toContain('Şartların tamamını aç')
    expect(html).toContain('Türkiye IBAN')
  })

  it('explains the separate credit and IBAN thresholds in settings', () => {
    const payoutData: ReferralPayoutPanelData = {
      unavailable: false,
      state: {
        partnerStatus: 'active',
        taxStatus: 'individual',
        taxVerified: true,
        hasIban: true,
        pendingCents: 0,
        availableCents: 300,
        totalCents: 300,
        convertibleCents: 300,
        maxCreditCents: 300,
        maxCashCents: 300,
        hasDebtBucket: false,
        partialPayoutsAvailable: false,
        requestedCents: 0,
        convertedCents: 0,
        paidCents: 0,
        hasOpenCashRequest: false,
      },
    }
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
      payoutData,
      payoutsEnabled: true,
      cashPayoutsEnabled: true,
    }))

    expect(html).toContain('Toplam bakiye en az 3 TL olduğunda beklemeden AI kredisine çevirebilirsiniz.')
    expect(html).toContain('IBAN ödemesi için 14 günlük bekleme tamamlanmalı ve kullanılabilir bakiye en az 1.000 TL olmalıdır.')
  })

  it('blocks partnership closure while referral payout balance remains', () => {
    const payoutData: ReferralPayoutPanelData = {
      unavailable: false,
      state: {
        partnerStatus: 'active',
        taxStatus: 'individual',
        taxVerified: false,
        hasIban: true,
        pendingCents: 12_105,
        availableCents: 0,
        totalCents: 12_105,
        convertibleCents: 12_105,
        maxCreditCents: 12_105,
        maxCashCents: 0,
        hasDebtBucket: false,
        partialPayoutsAvailable: false,
        requestedCents: 0,
        convertedCents: 0,
        paidCents: 0,
        hasOpenCashRequest: false,
      },
    }
    render(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
      payoutData,
      payoutsEnabled: true,
    }))

    const closeButton = screen.getByRole('button', { name: 'Ortaklığı kapat' })
    expect(closeButton.hasAttribute('disabled')).toBe(true)
    expect(closeButton.getAttribute('title')).toBe('Pozitif bekleyen/kullanılabilir bakiye veya açık nakit talebi varken ortaklık kapatılamaz.')
  })

  it('does not treat a fully converted held commission as an outstanding balance', () => {
    const payoutData: ReferralPayoutPanelData = {
      unavailable: false,
      state: {
        partnerStatus: 'active',
        taxStatus: 'individual',
        taxVerified: true,
        hasIban: true,
        pendingCents: 300,
        availableCents: -300,
        totalCents: 0,
        convertibleCents: 0,
        maxCreditCents: 0,
        maxCashCents: 0,
        hasDebtBucket: false,
        partialPayoutsAvailable: false,
        requestedCents: 0,
        convertedCents: 300,
        paidCents: 0,
        hasOpenCashRequest: false,
      },
    }
    render(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: '4321' },
      payoutData,
      payoutsEnabled: true,
    }))

    expect(screen.getByRole('button', { name: 'Ortaklığı kapat' }).hasAttribute('disabled')).toBe(false)
  })

  it('keeps the active referral link and asks for an IBAN after reactivation', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'active', ibanLast4: null },
    }))

    expect(html.replace(/<[^>]*>/gu, '')).toContain('https://gloval.ai/?ref=PARTNER1234')
    expect(html).toContain('IBAN ekleyin')
    expect(html).toContain('id="referral-iban-update"')
    expect(html).toContain('yönlendirme bağlantınız çalışıyor.')
  })

  it('links closed partners to support for reactivation', () => {
    const html = renderToStaticMarkup(createElement(ReferralPartnerCard, {
      enabled: true,
      partner: { referralCode: 'PARTNER1234', status: 'closed', ibanLast4: null },
    }))

    expect(html).toContain('Yeniden etkinleştirme için bize yazın.')
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

  it('keeps join actionable, highlights missing terms acceptance, and focuses the checkbox', () => {
    const view = render(createElement(ReferralPartnerCard, { enabled: true, partner: null }))
    const submit = screen.getByRole('button', { name: 'Programa katıl' })
    const checkbox = screen.getByRole('checkbox')

    expect(submit.hasAttribute('disabled')).toBe(false)
    expect(submit.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(submit)

    expect(screen.getByRole('alert').textContent).toBe('Devam etmek için şartları kabul etmelisiniz.')
    expect(document.activeElement).toBe(checkbox)
    expect(screen.getByLabelText('Satış ortaklığı programı şartları').getAttribute('aria-invalid')).toBe('true')
    expect(checkbox.parentElement?.parentElement?.className).toContain('border-destructive')
    expect(state.activate).not.toHaveBeenCalled()
    view.unmount()
  })

  it('shows inline name and IBAN validation messages', () => {
    render(createElement(ReferralPartnerCard, { enabled: true, partner: null }))
    const name = screen.getByLabelText('Ödeme alacak kişinin / kuruluşun adı')
    const iban = screen.getByLabelText('IBAN')
    const submit = screen.getByRole('button', { name: 'Programa katıl' })

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.change(name, { target: { value: 'Ortak' } })
    fireEvent.click(submit)
    expect(screen.getByText('Devam etmek için Türkiye IBAN’ınızı girin.')).toBeTruthy()
    expect(document.activeElement).toBe(iban)

    fireEvent.change(iban, { target: { value: 'TR123456789012345678901234' } })
    fireEvent.change(name, { target: { value: '' } })
    fireEvent.click(submit)
    expect(screen.getByText('Ödeme alacak kişinin veya kuruluşun adını girin.')).toBeTruthy()
    expect(document.activeElement).toBe(name)
  })

  it('disables the activation pulse for reduced-motion users', () => {
    const css = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')

    expect(css).toContain('@keyframes referral-activated-pulse')
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.referral-activated-dot\s*\{\s*animation:\s*none;/u)
  })
})
