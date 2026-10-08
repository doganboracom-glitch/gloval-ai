'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Sparkles, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { creditNoticeText, type CreditNoticeView } from '@/lib/credit-notice'

const fetchNotice = async (url: string): Promise<CreditNoticeView | null> => {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null
  const json = (await res.json()) as { notice: CreditNoticeView | null }
  return json.notice
}

const AUTO_HIDE_MS = 9000

/**
 * One-time "X AI actions were added to your account" notice, shown on the
 * dashboard and billing pages after the plan credits were granted. Marked as
 * seen server-side (cookie) as soon as it is shown, so it never repeats.
 */
export function CreditNoticeToast() {
  const { lang } = useLanguage()
  const billingCopy = getBillingProfileCopy(lang)
  const { data: notice } = useSWR('/api/credit-notice', fetchNotice, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const visible = notice && notice.id !== dismissedId ? notice : null
  const visibleId = visible?.id

  useEffect(() => {
    if (!visibleId) return
    void fetch('/api/credit-notice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: visibleId }),
    }).catch(() => undefined)
    const timer = window.setTimeout(() => setDismissedId(visibleId), AUTO_HIDE_MS)
    return () => window.clearTimeout(timer)
  }, [visibleId])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-brand/40 bg-card p-4 text-card-foreground shadow-lg sm:left-auto sm:right-4 sm:mx-0"
    >
      <Sparkles className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-relaxed">
          {creditNoticeText(lang === 'tr' ? 'tr' : 'en', visible.amount, visible.firstPeriod)}
        </p>
        {visible.billingProfileIncomplete ? (
          <div className="mt-2 flex flex-col gap-1 text-sm leading-relaxed">
            <p>{billingCopy.creditReminder}</p>
            <Link
              href="/billing#fatura-bilgileri"
              className="font-medium text-brand underline underline-offset-4"
            >
              {billingCopy.bannerCta}
            </Link>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => setDismissedId(visible.id)}
        aria-label={lang === 'tr' ? 'Kapat' : 'Close'}
        className="rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}
