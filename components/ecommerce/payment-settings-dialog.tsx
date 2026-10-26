'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { getPaymentSettingsForOwner } from '@/lib/payment-settings'
import {
  getGeneralPaymentSettings,
  type GeneralPaymentView,
} from '@/lib/store-payments/general-settings'
import type { PaymentSummary } from '@/lib/store-checkout-rules'
import { GeneralPaymentSettings } from '@/components/ecommerce/general-payment-settings'
import { PaymentSettingsClient } from '@/components/ecommerce/payment-settings-client'
import { ShippingSettingsPanel } from '@/components/ecommerce/shipping-settings-panel'
import { getShippingSettings } from '@/lib/store-payments/shipping-settings'
import { PAYMENT_PROVIDERS, getPaymentProvider } from '@/components/ecommerce/provider-setup/registry'
import { ProviderSetupAssistant } from '@/components/ecommerce/provider-setup/provider-setup-assistant'
import { PAYMENT_DIALOG_LAYOUT } from '@/components/ecommerce/payment-settings-layout'

/** `general`, `shipping`, or the id of a registered payment provider. */
export type PaymentSettingsTabId = string
type TabId = PaymentSettingsTabId

const copy = {
  tr: {
    title: 'Ödeme ve kargo ayarları',
    shipping: 'Kargo',
    close: 'Kapat',
    general: 'Genel Ödeme Ayarları',
    soon: 'Yakında',
    independent:
      'Ödeme ayarları site yayınından bağımsızdır, kaydedince hemen geçerli olur.',
    loadError: 'Ödeme ayarları yüklenemedi. Lütfen tekrar deneyin.',
    retry: 'Tekrar dene',
    back: 'Genel ayarlara dön',
     },
  en: {
    title: 'Payment and shipping settings',
    shipping: 'Shipping',
    close: 'Close',
    general: 'General Payment Settings',
    soon: 'Soon',
    independent:
      'Payment settings are independent from publishing and take effect as soon as you save.',
    loadError: 'Payment settings could not be loaded. Please try again.',
    retry: 'Retry',
    back: 'Back to general settings',
     },
}

async function loadAll(projectId: string) {
  const [general, bank, shipping] = await Promise.all([
    getGeneralPaymentSettings(projectId),
    getPaymentSettingsForOwner(projectId),
    getShippingSettings(projectId),
  ])
  return { general, bank, shipping }
}

/**
 * Wide settings window opened from the editor's Sanal Poslar tab. It reuses the
 * existing payment form components (bank details, shipping) and talks to the
 * server through their own actions, so nothing here touches the site draft,
 * the version history or publishing.
 */
export function PaymentSettingsDialog({
  projectId,
  onClose,
  onSummaryChange,
  initialTab = 'general',
  onOpenDesign,
  recheckKey = 0,
}: {
  projectId: string
  onClose: () => void
  onSummaryChange?: (s: PaymentSummary) => void
  initialTab?: PaymentSettingsTabId
  /** Closes the window and takes the owner to the editor's Design tab. */
  onOpenDesign?: () => void
  recheckKey?: number
}) {
  const { lang } = useLanguage()
  const l = lang === 'en' ? 'en' : 'tr'
  const c = copy[l]
  const [tab, setTab] = useState<TabId>(initialTab)
  const [bankOpen, setBankOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const { data, error, isLoading, mutate } = useSWR(
    ['payment-dialog', projectId],
    () => loadAll(projectId),
    { revalidateOnFocus: false },
  )

  const summary = data?.general.summary
  useEffect(() => {
    if (summary) onSummaryChange?.(summary)
  }, [summary, onSummaryChange])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function selectTab(next: TabId) {
    if (next === tab) return
    setTab(next)
    setBankOpen(false)
    // Other tabs change state through their own actions; refetch so the
    // general tab never shows stale readiness.
    void mutate()
    setVersion((v) => v + 1)
  }

  function handleGeneralSaved(view: GeneralPaymentView) {
    void mutate(
      (prev) => (prev ? { ...prev, general: view } : prev),
      { revalidate: true },
    )
    setVersion((v) => v + 1)
  }

  const tabs: { id: TabId; label: string; disabled?: boolean }[] = [
    { id: 'general', label: c.general },
    { id: 'shipping', label: c.shipping },
    ...PAYMENT_PROVIDERS.map((p) => ({ id: p.id, label: p.name })),
  ]
  const activeProvider = getPaymentProvider(tab)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        tabIndex={-1}
        className={PAYMENT_DIALOG_LAYOUT.panel}
      >
        <header className={PAYMENT_DIALOG_LAYOUT.header}>
          <h2 className="font-display text-lg font-semibold">{c.title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={c.close}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </header>

        <div role="tablist" aria-label={c.title} className={PAYMENT_DIALOG_LAYOUT.tabList}>
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              disabled={t.disabled}
              onClick={() => selectTab(t.id)}
              className={`${PAYMENT_DIALOG_LAYOUT.tab} ${
                tab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              {t.label}
              {t.disabled && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {c.soon}
                </span>
              )}
            </button>
          ))}
        </div>

        <p className={PAYMENT_DIALOG_LAYOUT.info}>{c.independent}</p>

        <div role="tabpanel" className={PAYMENT_DIALOG_LAYOUT.body}>
          {isLoading && (
            <div className="flex justify-center py-16" role="status">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {error && !data && (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-destructive">{c.loadError}</p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-secondary"
              >
                {c.retry}
              </button>
            </div>
          )}

          {data && tab === 'general' && !bankOpen && (
            <GeneralPaymentSettings
              key={`general-${version}-${JSON.stringify(data.general)}`}
              projectId={projectId}
              initial={data.general}
              onSaved={handleGeneralSaved}
              onOpenBank={() => setBankOpen(true)}
            />
          )}

          {data && tab === 'general' && bankOpen && (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setBankOpen(false)}
                className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                {c.back}
              </button>
              <PaymentSettingsClient
                key={`bank-${version}`}
                embedded
                onlyMethods={['bank_transfer']}
                projectId={projectId}
                projectName=""
                initial={data.bank}
                onSaved={() => {
                  void mutate()
                }}
              />
            </div>
          )}

          {data && tab === 'shipping' && (
            <ShippingSettingsPanel
              key={`shipping-${version}`}
              projectId={projectId}
              initial={data.shipping}
              onSaved={(view) =>
                void mutate((prev) => (prev ? { ...prev, shipping: view } : prev), {
                  revalidate: false,
                })
              }
            />
          )}

          {data && activeProvider && (
            <ProviderSetupAssistant
              key={activeProvider.id}
              config={activeProvider}
              projectId={projectId}
              lang={l}
              recheckKey={recheckKey}
              onOpenDesign={
                onOpenDesign
                  ? () => {
                      onClose()
                      onOpenDesign()
                    }
                  : undefined
              }
              onSettingsChanged={() => void mutate()}
            />
          )}
        </div>
      </div>
    </div>
  )
}
