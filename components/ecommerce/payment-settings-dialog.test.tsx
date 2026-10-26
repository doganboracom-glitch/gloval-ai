// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PAYMENT_DIALOG_LAYOUT } from '@/components/ecommerce/payment-settings-layout'

vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ lang: 'tr' }) }))
vi.mock('@/lib/payment-settings', () => ({ getPaymentSettingsForOwner: async () => ({}) }))
vi.mock('@/lib/store-payments/general-settings', () => ({
  getGeneralPaymentSettings: async () => ({ summary: undefined }),
}))
vi.mock('@/lib/store-payments/shipping-settings', () => ({ getShippingSettings: async () => ({}) }))
vi.mock('@/components/ecommerce/general-payment-settings', () => ({
  GeneralPaymentSettings: () => <div>general-panel</div>,
}))
vi.mock('@/components/ecommerce/payment-settings-client', () => ({
  PaymentSettingsClient: () => <div>bank-panel</div>,
}))
vi.mock('@/components/ecommerce/shipping-settings-panel', () => ({
  ShippingSettingsPanel: () => <div>shipping-panel</div>,
}))
vi.mock('@/components/ecommerce/provider-setup/registry', () => {
  const iyzico = { id: 'iyzico', name: 'iyzico' }
  return {
    PAYMENT_PROVIDERS: [iyzico],
    getPaymentProvider: (id: string) => (id === 'iyzico' ? iyzico : undefined),
  }
})
vi.mock('@/components/ecommerce/provider-setup/provider-setup-assistant', () => ({
  ProviderSetupAssistant: () => <div style={{ height: 4000 }}>iyzico-panel</div>,
}))

import { PaymentSettingsDialog } from '@/components/ecommerce/payment-settings-dialog'

afterEach(() => cleanup())

const tokens = (className: string) => className.split(/\s+/)

describe('payment settings window layout contract', () => {
  it('keeps the header, tab bar and info line from shrinking', () => {
    for (const key of ['header', 'tabList', 'info'] as const) {
      expect(tokens(PAYMENT_DIALOG_LAYOUT[key]), key).toContain('shrink-0')
    }
  })

  it('never scrolls the tab bar vertically, only horizontally', () => {
    const tabList = tokens(PAYMENT_DIALOG_LAYOUT.tabList)
    expect(tabList).toContain('overflow-x-auto')
    expect(tabList).toContain('overflow-y-hidden')
    expect(tabList).not.toContain('overflow-y-auto')
    expect(tabList).not.toContain('overflow-auto')
  })

  it('lets only the content area flex and scroll vertically', () => {
    const body = tokens(PAYMENT_DIALOG_LAYOUT.body)
    expect(body).toEqual(expect.arrayContaining(['min-h-0', 'flex-1', 'overflow-y-auto']))
    expect(body).not.toContain('shrink-0')
    expect(tokens(PAYMENT_DIALOG_LAYOUT.panel)).toEqual(
      expect.arrayContaining(['flex', 'flex-col', 'overflow-hidden']),
    )
  })

  it('keeps tab buttons from shrinking or wrapping', () => {
    expect(tokens(PAYMENT_DIALOG_LAYOUT.tab)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']))
  })

  it('uses a fixed panel height so tabs of different length do not resize the frame', () => {
    const panel = tokens(PAYMENT_DIALOG_LAYOUT.panel)
    expect(panel.some((t) => t.startsWith('h-['))).toBe(true)
    expect(panel.some((t) => t.startsWith('max-h-'))).toBe(false)
  })
})

describe('PaymentSettingsDialog tab switching', () => {
  it('keeps frame, tab bar and info line identical across general, shipping and iyzico tabs', async () => {
    render(<PaymentSettingsDialog projectId="p1" onClose={() => {}} />)
    await screen.findByText('general-panel')

    const snapshot = () => ({
      panel: screen.getByRole('dialog').className,
      tabList: screen.getByRole('tablist').className,
      info: screen.getByText(/site yayınından bağımsızdır/).className,
      body: screen.getByRole('tabpanel').className,
      tabs: screen.getAllByRole('tab').map((t) => t.className.replace(/bg-primary text-primary-foreground|text-muted-foreground hover:bg-secondary/, '')),
    })
    const initial = snapshot()

    for (const [name, panelText] of [
      ['Kargo', 'shipping-panel'],
      ['iyzico', 'iyzico-panel'],
      ['Genel Ödeme Ayarları', 'general-panel'],
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name }))
      await waitFor(() => expect(screen.getByText(panelText)).toBeTruthy())
      expect(snapshot()).toEqual(initial)
    }

    expect(tokens(screen.getByRole('tablist').className)).toContain('overflow-y-hidden')
  })
})
