'use client'

import { useState } from 'react'
import { CreditCard, Settings2, Info } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { PaymentSettingsDialog } from '@/components/ecommerce/payment-settings-dialog'
import type { PaymentSummary } from '@/lib/store-checkout-rules'
import { PaymentModuleBadges, closedReasonText, formatTry } from '@/components/ecommerce/payment-summary-parts'

const copy = {
  tr: {
    title: 'Ödeme ve Kargo',
    open: 'Ödeme ve kargo ayarlarını aç',
    on: 'Ödeme açık',
    off: 'Ödeme kapalı',
    unknown: 'Ödeme durumu okunamadı',
    active: 'Aktif sanal pos',
    none: 'Yok',
    guest: 'Misafir alışverişi',
    guestOn: 'Açık',
    guestOff: 'Kapalı (giriş gerekli)',
    codFee: 'Kapıda ödeme ücreti',
    independent:
      'Ödeme ayarları site yayınından bağımsızdır, kaydedince hemen geçerli olur.',
  },
  en: {
    title: 'Payment & Shipping',
    open: 'Open payment and shipping settings',
    on: 'Payments on',
    off: 'Payments off',
    unknown: 'Payment status unavailable',
    active: 'Active card provider',
    none: 'None',
    guest: 'Guest checkout',
    guestOn: 'On',
    guestOff: 'Off (login required)',
    codFee: 'Cash on delivery fee',
    independent:
      'Payment settings are independent from publishing and take effect as soon as you save.',
  },
}

export function SanalPoslarTab({
  projectId,
  summary,
  onSummaryChange,
}: {
  projectId: string
  summary: PaymentSummary | null
  onSummaryChange: (s: PaymentSummary) => void
}) {
  const { lang } = useLanguage()
  const l = lang === 'en' ? 'en' : 'tr'
  const c = copy[l]
  const [open, setOpen] = useState(false)

  const cardModule = summary?.modules.find((m) => m.id === 'card')
  const activeProvider =
    cardModule?.enabled ? (summary!.activeCardProvider === 'iyzico' ? 'iyzico' : 'PayTR') : c.none

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <CreditCard className="size-4 text-brand" />
        <h2 className="font-medium">{c.title}</h2>
        {summary ? (
          <span
            className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-medium ${
              summary.ordersOpen
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-destructive/15 text-destructive'
            }`}
          >
            {summary.ordersOpen ? c.on : c.off}
          </span>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">{c.unknown}</span>
        )}
      </div>

      {summary && (
        <>
          {summary.closedReason && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {closedReasonText(summary.closedReason, l)}
            </p>
          )}
          <PaymentModuleBadges summary={summary} lang={l} />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">{c.active}</dt>
            <dd className="text-right font-medium">{activeProvider}</dd>
            <dt className="text-muted-foreground">{c.guest}</dt>
            <dd className="text-right font-medium">
              {summary.guestCheckout ? c.guestOn : c.guestOff}
            </dd>
            {summary.codFeeCents > 0 && (
              <>
                <dt className="text-muted-foreground">{c.codFee}</dt>
                <dd className="text-right font-medium">{formatTry(summary.codFeeCents, l)}</dd>
              </>
            )}
          </dl>
        </>
      )}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Settings2 className="size-4" />
        {c.open}
      </button>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        {c.independent}
      </p>

      {open && (
        <PaymentSettingsDialog
          projectId={projectId}
          onClose={() => setOpen(false)}
          onSummaryChange={onSummaryChange}
        />
      )}
    </div>
  )
}
