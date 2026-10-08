'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'

type BillingProfileBannerProps = {
  show: boolean
}

export function BillingProfileBanner({ show }: BillingProfileBannerProps) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)

  if (!show) return null

  return (
    <aside
      role="status"
      aria-label={copy.bannerTitle}
      className="mt-6 flex flex-col gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-4 text-foreground sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{copy.bannerTitle}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.bannerBody}</p>
      </div>
      <Link
        href="/billing#fatura-bilgileri"
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copy.bannerCta}
        <ArrowRight aria-hidden="true" data-icon="inline-end" />
      </Link>
    </aside>
  )
}
