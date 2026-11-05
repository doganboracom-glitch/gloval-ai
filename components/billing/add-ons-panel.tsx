'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { AddOnAllowanceCards } from '@/components/billing/add-on-allowance-cards'
import { AddOnOutcomeBanner as SharedAddOnOutcomeBanner } from '@/components/billing/add-on-outcome-banner'
import { getMailAddOnCopy } from '@/components/billing/mail-addon-copy'
import { ADD_ONS } from '@/lib/add-ons'
import type { AddOnBillingPeriod, AddOnCode, AddOnOverview } from '@/lib/add-ons'
import { fillTemplate as fill, type AddOnPurchaseOutcome } from '@/lib/addon-purchase-outcome'

type Variant = 'summary' | 'full'

const ADD_ONS_PATH = '/billing#ek-paketler'

function CapacityRow({
  label,
  base,
  addOn,
  total,
  baseLabel,
  addOnLabel,
  totalLabel,
  emptyLabel,
}: {
  label: string
  base: number | null
  addOn: number
  total: number | null
  baseLabel: string
  addOnLabel: string
  totalLabel: string
  emptyLabel: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm font-medium">{label}</p>
      {total === null || base === null ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">{baseLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">{base}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{addOnLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums">+{addOn}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{totalLabel}</dt>
            <dd className="mt-0.5 font-display text-lg font-semibold tabular-nums text-brand">
              {total}
            </dd>
          </div>
        </dl>
      )}
    </div>
  )
}

export function AddOnsPanel({
  overview,
  variant,
  planName,
  userEmail = '',
  outcome = null,
  profileComplete = false,
  planInterval = 'month',
}: {
  overview: AddOnOverview
  variant: Variant
  planName?: string | null
  /** Billing period of the buyer's main plan; preselects the matching add-on period. */
  planInterval?: AddOnBillingPeriod
  userEmail?: string
  /** Server-derived result of the buyer's last purchase, from the stored status. */
  outcome?: AddOnPurchaseOutcome | null
  /** Whether the saved billing profile is complete enough to pay. */
  profileComplete?: boolean
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const a = t.billing.addOns
  const dateFmt = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' })
  const mc = getMailAddOnCopy(lang)

  const unitLabelFor = (code: AddOnCode) => {
    const def = ADD_ONS[code]
    if (def.kind === 'site' && def.siteTarget === 'corporate') {
      return fill(a.corporateSiteUnit, { n: def.capacity })
    }
    if (def.kind === 'site' && def.siteTarget === 'ecommerce') {
      return fill(a.ecommerceSiteUnit, { n: def.capacity })
    }
    if (def.kind === 'site' && def.saleEnabled === false) {
      return fill(a.legacySiteUnit, { n: def.capacity })
    }
    if (def.kind === 'mail' && (code === 'extra_mail_1' || code === 'extra_mail_5')) {
      return fill(def.capacity === 1 ? a.emailUnitOne : a.emailUnitMany, { n: def.capacity })
    }
    if (def.kind === 'mail' && def.saleEnabled === false) {
      return fill(a.legacyMailUnit, { n: def.capacity })
    }
    const template = def.kind === 'site' ? a.siteUnit : def.kind === 'mail' ? mc.unit : a.productUnit
    return fill(template, { n: def.capacity })
  }

  return (
    <section aria-labelledby="addons-heading" className="mt-8">
      {variant === 'full' ? (
        <Link
          href="/billing"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {a.backToBilling}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="addons-heading" className="font-display text-xl font-bold tracking-tight">
            {a.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {variant === 'full' ? a.subtitle : a.summaryHint}
          </p>
          {variant === 'full' && planName ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {a.planLabel}: <span className="font-medium text-foreground">{planName}</span>
            </p>
          ) : null}
        </div>
        {variant === 'summary' ? (
          <Link
            href={ADD_ONS_PATH}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            {a.manage}
          </Link>
        ) : null}
      </div>

      {variant === 'full' && outcome ? (
        <SharedAddOnOutcomeBanner
          outcome={outcome}
          overview={overview}
          onRefresh={() => router.refresh()}
          onDismiss={() => router.replace(ADD_ONS_PATH)}
        />
      ) : null}

      <div className="mt-4 rounded-2xl border border-border bg-card/70 p-5">
        <h3 className="text-sm font-medium text-muted-foreground">{a.capacityTitle}</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CapacityRow
            label={a.siteLimit}
            base={overview.site.base}
            addOn={overview.site.addOn}
            total={overview.site.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
          <CapacityRow
            label={a.productLimit}
            base={overview.product.base}
            addOn={overview.product.addOn}
            total={overview.product.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
          <CapacityRow
            label={mc.mailLimit}
            base={overview.mail.base}
            addOn={overview.mail.addOn}
            total={overview.mail.total}
            baseLabel={a.planLimitLabel}
            addOnLabel={a.addOnLabel}
            totalLabel={a.totalLabel}
            emptyLabel={a.noProductLimit}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {fill(a.ecommerceNote, {
            corporate: overview.corporateSiteLimit,
            ecommerce: overview.ecommerceSiteLimit,
          })}
        </p>
      </div>

      {variant === 'full' ? (
        <div className="mt-4 rounded-2xl border border-border bg-card/70 p-5">
          <h3 className="text-sm font-medium text-muted-foreground">{a.activeTitle}</h3>
          {overview.active.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{a.noneActive}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {overview.active.map((item, index) => (
                <li
                  key={`${item.code}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background/40 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{unitLabelFor(item.code)}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      {a.activeBadge}
                    </span>
                    {item.expiresAt
                      ? fill(a.expiresOn, { date: dateFmt.format(new Date(item.expiresAt)) })
                      : a.noExpiry}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{a.expiredHint}</p>
        </div>
      ) : null}

      {variant === 'full' ? (
        <div className="mt-4">
          <AddOnAllowanceCards
            overview={overview}
            planInterval={planInterval}
            userEmail={userEmail}
            profileComplete={profileComplete}
          />
        </div>
      ) : null}
    </section>
  )
}
