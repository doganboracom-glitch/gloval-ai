'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Building2, Loader2, Mail, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/billing-utils'
import { fillTemplate } from '@/lib/addon-purchase-outcome'
import { addonCardId } from '@/lib/billing-addon-focus'
import type { AddOnBillingPeriod, AddOnCatalogItem, AddOnCode } from '@/lib/add-ons'

type AddOnAllowanceCardProps = {
  kind: 'site' | 'mail' | 'product'
  /** Monthly and yearly rows in display order; each row is its own select option. */
  items: AddOnCatalogItem[]
  /** Which period is preselected: the buyer's main plan period. */
  defaultPeriod: AddOnBillingPeriod
  title: string
  description: string
  yearlyDescription?: string
  selectLabel: string
  optionLabel: string
  currencyLabel: string
  unavailableOptionLabel: string
  availabilityHint: string
  unitLabelFor: (item: AddOnCatalogItem) => string
  notEligible: string
  notEligibleBadge: string
  periodLabels: Record<AddOnBillingPeriod, string>
  yearlyBadge: string
  periodNotes: Record<AddOnBillingPeriod, string>
  vatIncluded: string
  buyLabel: string
  buySelectedAriaLabel: string
  buyingLabel: string
  onBuy: (code: AddOnCode) => void
  busyCode: AddOnCode | null
  purchaseLocked: boolean
  highlightedCode?: string | null
}

const ICONS = { site: Building2, mail: Mail, product: Package } as const

export function pickDefaultItem(
  items: AddOnCatalogItem[],
  defaultPeriod: AddOnBillingPeriod,
): AddOnCatalogItem | null {
  const eligible = items.filter((item) => item.eligible)
  return (
    eligible.find((item) => item.period === defaultPeriod) ?? eligible[0] ?? items[0] ?? null
  )
}

export function AddOnAllowanceCard({
  kind,
  items,
  defaultPeriod,
  title,
  description,
  yearlyDescription,
  selectLabel,
  optionLabel,
  currencyLabel,
  unavailableOptionLabel,
  availabilityHint,
  unitLabelFor,
  notEligible,
  notEligibleBadge,
  periodLabels,
  yearlyBadge,
  periodNotes,
  vatIncluded,
  buyLabel,
  buySelectedAriaLabel,
  buyingLabel,
  onBuy,
  busyCode,
  purchaseLocked,
  highlightedCode = null,
}: AddOnAllowanceCardProps) {
  const id = useId()
  const [selectedCode, setSelectedCode] = useState<AddOnCode | null>(
    () => pickDefaultItem(items, defaultPeriod)?.code ?? null,
  )
  const appliedHighlightRef = useRef<string | null>(null)

  useEffect(() => {
    if (!highlightedCode) {
      appliedHighlightRef.current = null
      return
    }
    if (appliedHighlightRef.current === highlightedCode) return
    if (!items.some((item) => item.code === highlightedCode)) return

    appliedHighlightRef.current = highlightedCode
    setSelectedCode(highlightedCode as AddOnCode)
  }, [highlightedCode, items])

  const isHighlighted =
    highlightedCode !== null && items.some((item) => item.code === highlightedCode)
  const eligible = items.some((item) => item.eligible)
  const selectedItem =
    items.find((item) => item.code === selectedCode && item.eligible) ??
    pickDefaultItem(items, defaultPeriod)
  const displayedDescription =
    selectedItem?.period === 'year' && yearlyDescription ? yearlyDescription : description
  const hasUnavailableOffers = eligible && items.some((item) => !item.eligible)
  const itemLabel = selectedItem ? unitLabelFor(selectedItem) : ''
  const priceLabel = selectedItem ? formatMoney(selectedItem.priceCents, selectedItem.currency) : ''
  const periodLabel = selectedItem ? periodLabels[selectedItem.period] : ''
  const busy = selectedItem !== null && busyCode === selectedItem.code
  const Icon = ICONS[kind]

  return (
    <article
      id={isHighlighted ? addonCardId(highlightedCode) : undefined}
      aria-labelledby={`${id}-title`}
      data-addon-card={kind}
      data-highlighted={isHighlighted ? 'true' : undefined}
      className={`flex h-full min-w-0 flex-col rounded-2xl border bg-card/70 p-4 sm:p-5 ${
        isHighlighted ? 'border-brand ring-2 ring-brand' : 'border-border'
      } ${eligible ? '' : 'opacity-70'}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="font-display text-base font-semibold text-balance">
            {title}
          </h3>
          <p id={`${id}-description`} className="mt-0.5 text-sm text-muted-foreground">
            {displayedDescription}
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
              className="h-10 w-full min-w-0 max-w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:text-sm"
              value={selectedItem.code}
              disabled={purchaseLocked}
              onChange={(event) => setSelectedCode(event.currentTarget.value as AddOnCode)}
            >
              {items.map((item) => {
                const base = fillTemplate(optionLabel, {
                  item: unitLabelFor(item),
                  amount: new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(
                    item.priceCents / 100,
                  ),
                  currency: currencyLabel,
                  period: periodLabels[item.period],
                })
                const label = base
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
            <span className="text-sm text-muted-foreground" data-testid="addon-period">
              {periodLabel}
            </span>
            {selectedItem.period === 'year' ? (
              <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">
                {yearlyBadge}
              </span>
            ) : null}
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
              period: periodLabel,
            })}
            data-addon-code={selectedItem.code}
            onClick={() => onBuy(selectedItem.code)}
          >
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" /> : null}
            {busy ? buyingLabel : buyLabel}
          </Button>
          <p className="text-sm text-muted-foreground" data-testid="addon-period-note">
            {periodNotes[selectedItem.period]}
          </p>
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
