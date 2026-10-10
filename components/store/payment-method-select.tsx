'use client'

import type { PaymentProviderId } from '@/lib/payments/types'
import { buyerMethodName, buyerMethodBlurb, isCardProviderMethod } from '@/lib/payments/methods'
import { CreditCard, Landmark, ShieldCheck, Truck } from 'lucide-react'
import { formatIban } from '@/lib/iban'

/**
 * Buyer-facing payment-method picker for the real store checkout. Renders only
 * the methods the owner enabled, COLLAPSING every card-based PSP (PayTR,
 * iyzico, ...) into a single provider-agnostic "Kredi Kartı" option — the
 * buyer must never see which PSP a store actually uses, only the owner's
 * settings screen does. `mock` (the built-in test provider) is shown as a
 * single "test payment" option so a store with no real provider still has a
 * working checkout. Selection is validated again server-side in createOrder.
 */
export function PaymentMethodSelect({
  methods,
  value,
  onChange,
  publicConfig,
  demo = false,
}: {
  methods: PaymentProviderId[]
  value: PaymentProviderId
  onChange: (id: PaymentProviderId) => void
  publicConfig?: Record<string, unknown>
  /** Server-verified demo store: the mock card is labelled as a demo. */
  demo?: boolean
}) {
  // Collapse multiple enabled card PSPs into a single buyer-facing row that
  // submits whichever card provider comes first (createOrder still receives a
  // concrete PaymentProviderId, so the backend contract is unchanged).
  const seenCard = new Set<string>()
  const visibleMethods = methods.filter((id) => {
    if (!isCardProviderMethod(id)) return true
    if (seenCard.has('card')) return false
    seenCard.add('card')
    return true
  })

  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm font-medium">Ödeme yöntemi</legend>
      {visibleMethods.map((id) => {
        const selected = value === id
        const isBank = id === 'bank_transfer'
        const isCod = id === 'cash_on_delivery'
        const Icon = isBank ? Landmark : isCod ? Truck : id === 'mock' ? ShieldCheck : CreditCard
        const name =
          id === 'mock'
            ? demo
              ? 'Kredi/Banka kartı (demo)'
              : 'Test Ödeme'
            : buyerMethodName(id, 'tr')
        const blurb =
          id === 'mock'
            ? demo
              ? 'Bu bir demo mağazadır, gerçek ödeme alınmaz.'
              : 'Bu mağaza henüz gerçek bir ödeme sağlayıcısı bağlamadı; test ödemesi kullanılır.'
            : buyerMethodBlurb(id, 'tr')
        return (
          <label
            key={id}
            className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
              selected
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-border hover:border-primary/50'
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={id}
              checked={selected}
              onChange={() => onChange(id)}
              className="mt-1 size-4 accent-[var(--color-primary)]"
            />
            <span className="flex flex-1 flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {name}
              </span>
              {blurb && <span className="text-xs text-muted-foreground">{blurb}</span>}
              {/* Bank-transfer instructions come from the owner's public config. */}
              {isBank && selected && publicConfig ? (
                <BankDetails config={publicConfig} />
              ) : null}
              {isCod && selected ? (
                <span className="mt-1 text-xs text-muted-foreground">
                  Ödemeyi siparişiniz teslim edilirken yaparsınız. Ek ücret alınmaz.
                </span>
              ) : null}
            </span>
          </label>
        )
      })}
    </fieldset>
  )
}

function BankDetails({ config }: { config: Record<string, unknown> }) {
  const rows: { label: string; value: string }[] = []
  const push = (label: string, key: string) => {
    const v = config[key]
    if (typeof v === 'string' && v.trim()) rows.push({ label, value: v.trim() })
  }
  push('Banka', 'bank_name')
  push('Hesap Sahibi', 'account_holder')
  const iban = config.iban
  if (typeof iban === 'string' && iban.trim()) rows.push({ label: 'IBAN', value: formatIban(iban) })
  push('Açıklama', 'instructions')
  if (rows.length === 0) return null
  return (
    <span className="mt-2 grid gap-1 rounded-lg border border-border bg-muted/40 p-3 text-xs">
      <span className="mb-1 text-muted-foreground">
        Siparişiniz alındıktan sonra ödemeyi yapın, açıklamaya sipariş numarasını yazın.
      </span>
      {rows.map((r) => (
        <span key={r.label} className="flex justify-between gap-3">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="font-medium tabular-nums">{r.value}</span>
        </span>
      ))}
    </span>
  )
}

/** Ordered, de-duplicated list with a sensible default selection. */
export function normalizeMethods(methods: PaymentProviderId[]): PaymentProviderId[] {
  const order: PaymentProviderId[] = ['paytr', 'iyzico', 'bank_transfer', 'cash_on_delivery', 'stripe', 'mock']
  const set = new Set(methods.length > 0 ? methods : (['mock'] as PaymentProviderId[]))
  return order.filter((id) => set.has(id))
}
