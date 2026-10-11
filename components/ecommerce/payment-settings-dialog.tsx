'use client'

import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { getPaymentSettingsForOwner } from '@/lib/payment-settings'
import { getPaytrSettings } from '@/lib/store-payments/paytr-settings'
import {
  getGeneralPaymentSettings,
  type GeneralPaymentView,
} from '@/lib/store-payments/general-settings'
import type { PaymentSummary } from '@/lib/store-checkout-rules'
import { GeneralPaymentSettings } from '@/components/ecommerce/general-payment-settings'
import { PaymentSettingsClient } from '@/components/ecommerce/payment-settings-client'
import { PaytrPanel } from '@/components/ecommerce/paytr-panel'

type TabId = 'general' | 'paytr' | 'iyzico'

const copy = {
  tr: {
    title: 'Ödeme ayarları',
    close: 'Kapat',
    general: 'Genel Ödeme Ayarları',
    soon: 'Yakında',
    independent:
      'Ödeme ayarları site yayınından bağımsızdır, kaydedince hemen geçerli olur.',
    loadError: 'Ödeme ayarları yüklenemedi. Lütfen tekrar deneyin.',
    retry: 'Tekrar dene',
    back: 'Genel ayarlara dön',
    iyzicoSoon: 'iyzico entegrasyonu yakında eklenecek.',
  },
  en: {
    title: 'Payment settings',
    close: 'Close',
    general: 'General Payment Settings',
    soon: 'Soon',
    independent:
      'Payment settings are independent from publishing and take effect as soon as you save.',
    loadError: 'Payment settings could not be loaded. Please try again.',
    retry: 'Retry',
    back: 'Back to general settings',
    iyzicoSoon: 'The iyzico integration is coming soon.',
  },
}

async function loadAll(projectId: string) {
  const [general, bank, paytr] = await Promise.all([
    getGeneralPaymentSettings(projectId),
    getPaymentSettingsForOwner(projectId),
    getPaytrSettings(projectId),
  ])
  return { general, bank, paytr }
}

/**
 * Wide settings window opened from the editor's Sanal Poslar tab. It reuses the
 * existing payment form components (bank details, PayTR panel) and talks to the
 * server through their own actions, so nothing here touches the site draft,
 * the version history or publishing.
 */
export function PaymentSettingsDialog({
  projectId,
  onClose,
  onSummaryChange,
}: {
  projectId: string
  onClose: () => void
  onSummaryChange?: (s: PaymentSummary) => void
}) {
  const { lang } = useLanguage()
  const c = copy[lang === 'en' ? 'en' : 'tr']
  const [tab, setTab] = useState<TabId>('general')
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
    { id: 'paytr', label: 'PayTR' },
    { id: 'iyzico', label: 'iyzico', disabled: true },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        tabIndex={-1}
        className="flex max-h-[92svh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl outline-none sm:rounded-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-6">
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

        <div role="tablist" aria-label={c.title} className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 sm:px-5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              disabled={t.disabled}
              onClick={() => selectTab(t.id)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
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

        <p className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:px-6">
          {c.independent}
        </p>

        <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
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
              onOpenPaytr={() => selectTab('paytr')}
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
                initialPaytr={data.paytr}
                onSaved={() => {
                  void mutate()
                }}
              />
            </div>
          )}

          {data && tab === 'paytr' && (
            <PaytrPanel key={`paytr-${version}`} projectId={projectId} initial={data.paytr} />
          )}

          {tab === 'iyzico' && <p className="text-sm text-muted-foreground">{c.iyzicoSoon}</p>}
        </div>
      </div>
    </div>
  )
}
