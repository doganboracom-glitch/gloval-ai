'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { getMyBillingProfileStatusAction } from '@/lib/billing-profile-actions'

export const BILLING_PROFILE_HREF = '/billing?fatura=1#fatura-bilgileri'

/**
 * Whether the signed-in buyer still has to complete the billing profile.
 * Stays `false` while loading or when profile storage is unavailable, because
 * the server action enforces the same rule and is the real gate.
 */
export function useBillingProfileMissing(): boolean {
  const { data } = useSWR('billing-profile-status', () => getMyBillingProfileStatusAction(), {
    revalidateOnFocus: true,
  })
  return Boolean(data?.available && !data.complete)
}

type BillingProfileGateProps = {
  /** When set the CTA runs in place (e.g. opens the form); otherwise it links to /billing. */
  onEnter?: () => void
  disabled?: boolean
}

export function BillingProfileGate({ onEnter, disabled }: BillingProfileGateProps) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-brand/40 bg-brand/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-foreground">{copy.gateTitle}</p>
          <p className="text-pretty text-muted-foreground">{copy.gateBody}</p>
        </div>
      </div>
      {onEnter ? (
        <Button type="button" variant="brand" size="sm" onClick={onEnter} disabled={disabled} className="shrink-0">
          {copy.gateCta}
        </Button>
      ) : (
        <Link
          href={BILLING_PROFILE_HREF}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copy.gateCta}
        </Link>
      )}
    </div>
  )
}
