'use client'

import { useState, useTransition } from 'react'
import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import {
  getMyLatestRenewal,
  getMyRenewalQuote,
  startMyDomainRenewal,
} from '@/lib/custom-domains/registrar/renew-actions'
import type { DomainErrorCode } from '@/lib/custom-domains/types'

const YEAR_OPTIONS = [1, 2, 3, 5] as const
const RENEWAL_FINAL = new Set(['completed', 'failed', 'cancelled', 'manual_refund_required'])

export function RenewalCard({
  domain,
  errorText,
}: {
  domain: string
  errorText: (code: DomainErrorCode) => string
}) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const [years, setYears] = useState<number>(1)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const {
    data: latest,
    mutate: refreshLatest,
    isValidating: refreshing,
  } = useSWR(['renewal-latest', domain], () => getMyLatestRenewal(domain), {
    revalidateOnFocus: true,
  })
  const { data: quote, isLoading } = useSWR(['renewal-quote', domain, years], () => getMyRenewalQuote(domain, years), {
    revalidateOnFocus: false,
  })

  const inProgress = latest ? !RENEWAL_FINAL.has(latest.status) : false
  const money = (minor: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)

  const latestText = !latest
    ? null
    : latest.status === 'completed'
      ? d.mgRenewStDone
      : latest.status === 'manual_refund_required'
        ? d.mgRenewStRefund
        : latest.status === 'failed' || latest.status === 'cancelled'
          ? d.mgRenewStFailed
          : d.mgRenewStInProgress

  function pay() {
    setError(null)
    startTransition(async () => {
      const res = await startMyDomainRenewal(domain, years)
      if (!res.ok) {
        setError(errorText(res.error))
        setConfirming(false)
        return
      }
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      setConfirming(false)
      await refreshLatest()
    })
  }

  return (
    <div className="mt-6 rounded-lg border border-border bg-background/60 p-4">
      <h3 className="text-sm font-medium">{d.mgRenewTitle}</h3>
      <p className="mt-1 text-pretty text-xs text-muted-foreground">{d.mgRenewBody}</p>

      {latestText && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p role="status" className="text-sm">
            {latestText}
          </p>
          {inProgress && (
            <Button variant="outline" size="sm" disabled={refreshing} onClick={() => void refreshLatest()}>
              {refreshing && <Loader2 className="size-3.5 animate-spin" />}
              {d.mgRenewRefresh}
            </Button>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor="mg-renew-years" className="text-xs text-muted-foreground">
          {d.mgRenewYears}
        </label>
        <select
          id="mg-renew-years"
          value={years}
          disabled={isPending || inProgress}
          onChange={(e) => {
            setYears(Number(e.target.value))
            setConfirming(false)
            setError(null)
          }}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>
              {fill(d.mgRenewYearOpt, { n: y })}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 text-sm" aria-live="polite">
        {isLoading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : quote && quote.ok ? (
          <p>
            <span className="font-medium">{money(quote.quote.totalGrossMinor, quote.quote.currency)}</span>{' '}
            <span className="text-xs text-muted-foreground">{d.mgRenewVatIncl}</span>
          </p>
        ) : quote && !quote.ok ? (
          <p role="alert" className="text-destructive">
            {errorText(quote.error)}
          </p>
        ) : null}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!confirming ? (
          <Button
            size="sm"
            disabled={isPending || inProgress || !quote || !quote.ok}
            onClick={() => setConfirming(true)}
          >
            {d.mgRenewPay}
          </Button>
        ) : (
          <>
            <Button size="sm" disabled={isPending} onClick={pay}>
              {isPending && <Loader2 className="size-3.5 animate-spin" />}
              {d.mgRenewConfirm}
            </Button>
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setConfirming(false)}>
              {d.cancel}
            </Button>
          </>
        )}
      </div>
      {confirming && <p className="mt-2 text-xs text-muted-foreground">{d.mgRenewNote}</p>}
    </div>
  )
}
