'use client'

import { useId, useState } from 'react'
import { Building2, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/billing-utils'
import { fillTemplate } from '@/lib/addon-purchase-outcome'
import type { AddOnCatalogItem, AddOnCode } from '@/lib/add-ons'

type AddOnAllowanceCardProps = {
  kind: 'site' | 'mail'
  items: AddOnCatalogItem[]
  title: string
  description: string
  selectLabel: string
  optionLabel: string
  currencyLabel: string
  unavailableOptionLabel: string
  availabilityHint: string
  unitLabelFor: (item: AddOnCatalogItem) => string
  notEligible: string
  notEligibleBadge: string
  perMonth: string
  periodNote: string
  vatIncluded: string
  buyLabel: string
  buySelectedAriaLabel: string
  buyingLabel: string
  onBuy: (code: AddOnCode) => void
  busyCode: AddOnCode | null
  purchaseLocked: boolean
}

export function AddOnAllowanceCard({
  kind,
  items,
  title,
  description,
  selectLabel,
  optionLabel,
  currencyLabel,
  unavailableOptionLabel,
  availabilityHint,
  unitLabelFor,
  notEligible,
  notEligibleBadge,
  perMonth,
  periodNote,
  vatIncluded,
  buyLabel,
  buySelectedAriaLabel,
  buyingLabel,
  onBuy,
  busyCode,
  purchaseLocked,
}: AddOnAllowanceCardProps) {
  const id = useId()
  const firstEligibleItem = items.find((item) => item.eligible)
  const [selectedCode, setSelectedCode] = useState<AddOnCode | null>(
    firstEligibleItem?.code ?? items[0]?.code ?? null,
  )
  const eligible = items.some((item) => item.eligible)
  const selectedItem =
    items.find((item) => item.code === selectedCode && item.eligible) ??
    firstEligibleItem ??
    items[0] ??
    null
  const hasUnavailableOffers = eligible && items.some((item) => !item.eligible)
  const itemLabel = selectedItem ? unitLabelFor(selectedItem) : ''
  const priceLabel = selectedItem
    ? formatMoney(selectedItem.priceCents, selectedItem.currency)
    : ''
  const busy = selectedItem !== null && busyCode === selectedItem.code
  const Icon = kind === 'site' ? Building2 : Mail

  return (
    <article
      aria-labelledby={`${id}-title`}
      className={`rounded-2xl border border-border bg-card/70 p-5 ${eligible ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-base font-semibold">
            {title}
          </h3>
          <p id={`${id}-description`} className="mt-0.5 text-sm text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {eligible && selectedItem ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-offer`} className="text-sm font-medium">
              {selectLabel}
            </label>
            <select
              id={`${id}-offer`}
              aria-describedby={`${id}-description`}
              className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={selectedItem.code}
              disabled={purchaseLocked}
              onChange={(event) => setSelectedCode(event.currentTarget.value as AddOnCode)}
            >
              {items.map((item) => {
                const label = fillTemplate(optionLabel, {
                  item: unitLabelFor(item),
                  amount: new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(item.priceCents / 100),
                  currency: currencyLabel,
                  period: perMonth,
                })
                return (
                  <option key={item.code} value={item.code} disabled={!item.eligible}>
                    {item.eligible ? label : `${label} — ${unavailableOptionLabel}`}
                  </option>
                )
              })}
            </select>
          </div>
          {hasUnavailableOffers ? (
            <p className="text-sm text-muted-foreground">{availabilityHint}</p>
          ) : null}

          <div aria-live="polite" className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="font-display text-3xl font-bold tabular-nums text-foreground">
              {priceLabel}
            </p>
            <span className="text-sm text-muted-foreground">{perMonth}</span>
            <span className="basis-full text-sm text-muted-foreground">{vatIncluded}</span>
          </div>

          <Button
            type="button"
            className="w-full gap-2"
            disabled={purchaseLocked || !selectedItem.eligible}
            aria-busy={busy}
            aria-label={fillTemplate(buySelectedAriaLabel, {
              item: itemLabel,
              price: priceLabel,
              period: perMonth,
            })}
            data-addon-code={selectedItem.code}
            onClick={() => onBuy(selectedItem.code)}
          >
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : null}
            {busy ? buyingLabel : buyLabel}
          </Button>
          <p className="text-sm text-muted-foreground">{periodNote}</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-foreground">
            {notEligibleBadge}
          </span>
          <span>{notEligible}</span>
        </div>
      )}
    </article>
  )
}
