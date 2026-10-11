import { CreditCard, Landmark, Truck } from 'lucide-react'
import type { PaymentModuleState, PaymentSummary } from '@/lib/store-checkout-rules'

type Lang = 'tr' | 'en'

const MODULE_LABEL: Record<PaymentModuleState['id'], Record<Lang, string>> = {
  card: { tr: 'Kredi/Banka kartı', en: 'Credit/debit card' },
  bank_transfer: { tr: 'Havale / EFT', en: 'Bank transfer' },
  cash_on_delivery: { tr: 'Kapıda ödeme', en: 'Cash on delivery' },
}

const PROBLEM: Record<NonNullable<PaymentModuleState['problem']>, Record<Lang, string>> = {
  card_not_tested: {
    tr: 'Bağlantı testi geçmedi',
    en: 'Connection test not passed',
  },
  card_unreadable: {
    tr: 'Kimlik bilgisi okunamadı',
    en: 'Credentials unreadable',
  },
  iban_missing: { tr: 'IBAN eksik', en: 'IBAN missing' },
}

const ICON = { card: CreditCard, bank_transfer: Landmark, cash_on_delivery: Truck }

export function closedReasonText(reason: 'none_enabled' | 'none_ready', lang: Lang): string {
  if (reason === 'none_enabled') {
    return lang === 'en'
      ? 'Orders are closed: no payment method is enabled.'
      : 'Siparişler kapalı: hiçbir ödeme yöntemi etkin değil.'
  }
  return lang === 'en'
    ? 'Orders are closed: the enabled methods are not ready yet.'
    : 'Siparişler kapalı: etkin yöntemler henüz hazır değil.'
}

export function formatTry(cents: number, lang: Lang): string {
  return (cents / 100).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR', {
    style: 'currency',
    currency: 'TRY',
  })
}

export function PaymentModuleBadges({ summary, lang }: { summary: PaymentSummary; lang: Lang }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {summary.modules.map((m) => {
        const Icon = ICON[m.id]
        const tone = m.ready
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : m.enabled
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border bg-muted/40 text-muted-foreground'
        return (
          <li
            key={m.id}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}
          >
            <Icon className="size-3.5" />
            {MODULE_LABEL[m.id][lang]}
            {m.problem && <span className="font-normal">· {PROBLEM[m.problem][lang]}</span>}
          </li>
        )
      })}
    </ul>
  )
}
