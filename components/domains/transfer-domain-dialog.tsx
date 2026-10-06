'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, CheckCircle2, Loader2, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import {
  checkMyTransferIn,
  startMyTransferIn,
  type TransferErrorCode,
} from '@/lib/custom-domains/registrar/transfer-actions'
import type { DomainQuoteView } from '@/lib/custom-domains/pricing/calc'
import type { Dict } from '@/lib/i18n'

type Step = { name: 'form' } | { name: 'confirm'; domain: string; quote: DomainQuoteView } | { name: 'success' }

function transferErrorText(code: TransferErrorCode, d: Dict['domains']): string {
  return (
    {
      NOT_CONFIGURED: d.transferErrNotConfigured,
      INVALID_DOMAIN: d.transferErrInvalidDomain,
      UNSUPPORTED_TLD: d.transferErrUnsupportedTld,
      AUTH_CODE_REQUIRED: d.transferErrAuthRequired,
      NOT_TRANSFERABLE: d.transferErrNotTransferable,
      INVALID_AUTH_CODE: d.transferErrInvalidAuth,
      DOMAIN_LOCKED: d.transferErrLocked,
      ALREADY_OWNED: d.buyErrAlreadyOwned,
      PENDING_EXISTS: d.transferErrPending,
      PRICING_UNAVAILABLE: d.transferErrPricing,
      NOT_FOUND: d.transferErrFailed,
      RESTRICTED_60_DAYS: d.transferErrNotTransferable,
      PROVIDER_ERROR: d.transferErrProvider,
      UNSUPPORTED: d.errFeatureUnsupported,
      FAILED: d.transferErrFailed,
    } satisfies Record<TransferErrorCode, string>
  )[code]
}

export function TransferDomainDialog({ onClose }: { onClose: () => void }) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const d = t.domains
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  const [step, setStep] = useState<Step>({ name: 'form' })
  const [domain, setDomain] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleCheck(event: React.FormEvent) {
    event.preventDefault()
    if (isPending || !domain.trim() || !authCode.trim()) return
    setError(null)
    startTransition(async () => {
      const res = await checkMyTransferIn(domain, authCode)
      if (!res.ok) return setError(transferErrorText(res.error, d))
      setStep({ name: 'confirm', domain: res.domain, quote: res.quote })
    })
  }

  function handlePay() {
    setError(null)
    startTransition(async () => {
      const res = await startMyTransferIn(domain, authCode)
      if (!res.ok) return setError(transferErrorText(res.error, d))
      // The code is only needed in memory until now.
      setAuthCode('')
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      setStep({ name: 'success' })
    })
  }

  const total =
    step.name === 'confirm'
      ? new Intl.NumberFormat(locale, { style: 'currency', currency: 'TRY' }).format(step.quote.grossMinor / 100)
      : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
            <ArrowRightLeft className="size-5 text-primary" />
            {d.transferTitle}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={d.buyClose}
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 min-h-0 overflow-y-auto">
          {step.name === 'form' && (
            <form onSubmit={handleCheck} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">{d.transferIntro}</p>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {d.transferDomainLabel}
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="firmaniz.com"
                  autoComplete="off"
                  spellCheck={false}
                  className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {d.transferAuthLabel}
                <input
                  type="password"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                />
                <span className="text-xs font-normal text-muted-foreground">{d.transferAuthHelp}</span>
              </label>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={isPending || !domain.trim() || !authCode.trim()} className="gap-2">
                {isPending && <Loader2 className="size-4 animate-spin" />}
                {d.transferCheck}
              </Button>
            </form>
          )}

          {step.name === 'confirm' && (
            <div className="flex flex-col gap-4">
              <p className="font-mono text-sm font-medium">{step.domain}</p>
              <div className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
                <span className="text-muted-foreground">{d.transferTotal}</span>
                <span className="font-medium">{total}</span>
              </div>
              <p className="text-xs text-muted-foreground">{d.transferNote}</p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={isPending} onClick={() => setStep({ name: 'form' })}>
                  {d.transferBack}
                </Button>
                <Button onClick={handlePay} disabled={isPending} className="gap-2">
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  {d.transferPay}
                </Button>
              </div>
            </div>
          )}

          {step.name === 'success' && (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="size-12 text-emerald-500" />
              <p className="mt-4 text-pretty text-sm text-muted-foreground">{d.transferSuccess}</p>
              <Button
                className="mt-6"
                onClick={() => {
                  onClose()
                  router.refresh()
                }}
              >
                {d.buyClose}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
