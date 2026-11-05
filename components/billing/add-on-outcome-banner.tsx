'use client'

import {
  CheckCircle2,
  CircleX,
  Clock,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { getMailAddOnCopy } from '@/components/billing/mail-addon-copy'
import { ADD_ONS } from '@/lib/add-ons'
import type { AddOnOverview } from '@/lib/add-ons'
import { fillTemplate } from '@/lib/addon-purchase-outcome'
import type { AddOnPurchaseOutcome } from '@/lib/addon-purchase-outcome'

export function AddOnOutcomeBanner({
  outcome,
  overview,
  onRefresh,
  onDismiss,
}: {
  outcome: AddOnPurchaseOutcome
  overview: AddOnOverview | null
  onRefresh?: () => void
  onDismiss?: () => void
}) {
  const { t, lang } = useLanguage()
  const a = t.billing.addOns
  const mailCopy = getMailAddOnCopy(lang)
  const dateFormat = new Intl.DateTimeFormat(lang, { dateStyle: 'medium' })
  const definition = ADD_ONS[outcome.addonCode]

  const unitLabel = (() => {
    if (definition.kind === 'site' && definition.siteTarget === 'corporate') {
      return fillTemplate(a.corporateSiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'site' && definition.siteTarget === 'ecommerce') {
      return fillTemplate(a.ecommerceSiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'site' && definition.saleEnabled === false) {
      return fillTemplate(a.legacySiteUnit, { n: definition.capacity })
    }
    if (definition.kind === 'mail' && (outcome.addonCode === 'extra_mail_1' || outcome.addonCode === 'extra_mail_5')) {
      return fillTemplate(
        definition.capacity === 1 ? a.emailUnitOne : a.emailUnitMany,
        { n: definition.capacity },
      )
    }
    if (definition.kind === 'mail' && definition.saleEnabled === false) {
      return fillTemplate(a.legacyMailUnit, { n: definition.capacity })
    }
    const template =
      definition.kind === 'site'
        ? a.siteUnit
        : definition.kind === 'mail'
          ? mailCopy.unit
          : a.productUnit
    return fillTemplate(template, { n: definition.capacity })
  })()

  const outcomeSiteTarget = definition.siteTarget
  const successTotal =
    outcome.kind === 'site'
      ? outcomeSiteTarget === 'ecommerce'
        ? a.successTotalEcommerceSite
        : outcomeSiteTarget === 'corporate'
          ? a.successTotalCorporateSite
          : a.successTotalSite
      : outcome.kind === 'mail'
        ? mailCopy.successTotal
        : a.successTotalProduct
  const newTotal = overview
    ? outcome.kind === 'site'
      ? outcomeSiteTarget === 'ecommerce'
        ? overview.ecommerceSiteLimit
        : outcomeSiteTarget === 'corporate'
          ? overview.corporateSiteLimit
          : overview.site.total
      : outcome.kind === 'mail'
        ? overview.mail.total
        : overview.product.total
    : null
  const validUntilLabel = outcome.validUntil
    ? dateFormat.format(new Date(outcome.validUntil))
    : null

  const view = {
    success: {
      Icon: CheckCircle2,
      tone: 'border-emerald-500/40 bg-emerald-500/10',
      icon: 'text-emerald-500',
      title: a.successTitle,
      body: fillTemplate(a.successBody, { item: unitLabel }),
    },
    failed: {
      Icon: CircleX,
      tone: 'border-destructive/40 bg-destructive/10',
      icon: 'text-destructive',
      title: a.failedTitle,
      body: a.failedBody,
    },
    pending: {
      Icon: Clock,
      tone: 'border-border bg-muted/40',
      icon: 'text-muted-foreground',
      title: a.pendingTitle,
      body: a.pendingBody,
    },
    processing: {
      Icon: Loader2,
      tone: 'border-border bg-muted/40',
      icon: 'text-muted-foreground',
      title: a.processingTitle,
      body: a.processingBody,
    },
    review: {
      Icon: ShieldAlert,
      tone: 'border-amber-500/40 bg-amber-500/10',
      icon: 'text-amber-500',
      title: a.reviewTitle,
      body: a.reviewBody,
    },
  }[outcome.state]
  const { Icon } = view
  const showRefresh = outcome.state === 'pending' || outcome.state === 'processing'

  return (
    <div
      role={outcome.state === 'failed' || outcome.state === 'review' ? 'alert' : 'status'}
      data-outcome={outcome.state}
      className={`mt-4 flex items-start gap-3 rounded-2xl border p-4 ${view.tone}`}
    >
      <Icon
        className={`mt-0.5 size-5 shrink-0 ${view.icon} ${outcome.state === 'processing' ? 'animate-spin' : ''}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="font-display text-sm font-semibold">{view.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{view.body}</p>
        {outcome.state === 'success' ? (
          <ul className="mt-2 flex flex-col gap-0.5 text-sm">
            {newTotal !== null ? (
              <li>{fillTemplate(successTotal, { total: newTotal })}</li>
            ) : null}
            {validUntilLabel ? (
              <li>{fillTemplate(a.validUntil, { date: validUntilLabel })}</li>
            ) : null}
            <li className="text-xs text-muted-foreground">{a.validityNote}</li>
          </ul>
        ) : null}
        {showRefresh && onRefresh ? (
          <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRefresh}>
            {a.refreshStatus}
          </Button>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={a.dismiss}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
