'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowRightLeft, Check, Copy, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import {
  getMyTransferOutStatus,
  revealMyAuthCode,
  type TransferErrorCode,
  type TransferOutStatus,
} from '@/lib/custom-domains/registrar/transfer-actions'
import type { Dict } from '@/lib/i18n'

const CODE_VISIBLE_MS = 60_000

function outErrorText(code: TransferErrorCode, d: Dict['domains']): string {
  switch (code) {
    case 'RATE_LIMITED':
      return d.outErrRateLimited
    case 'RESTRICTED_60_DAYS':
    case 'NOT_TRANSFERABLE':
      return d.outErrNotTransferable
    case 'DOMAIN_LOCKED':
      return d.outLocked
    case 'UNSUPPORTED_TLD':
      return d.outUnsupported
    default:
      return d.outErr
  }
}

/** Lock status / EPP code for a domain registered through us. Renders nothing when not applicable. */
export function TransferOutPanel({ domain }: { domain: string }) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const [status, setStatus] = useState<TransferOutStatus | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearCode = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = null
    setCode(null)
    setCopied(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    getMyTransferOutStatus(domain).then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [domain])

  if (!status) return null
  if (!status.ok || (!status.supported && status.reason === 'NOT_REGISTERED_HERE')) return null

  function showCode() {
    setError(null)
    startTransition(async () => {
      const res = await revealMyAuthCode(domain)
      if (!res.ok) return setError(outErrorText(res.error, d))
      setCode(res.authCode)
      setCopied(false)
      if (hideTimer.current) clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(clearCode, CODE_VISIBLE_MS)
    })
  }

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setError(d.outErr)
    }
  }

  const blocked = status.supported && (status.locked || Boolean(status.restrictedUntil))

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <ArrowRightLeft className="size-4 text-primary" />
        {d.outTitle}
      </h2>

      {!status.supported ? (
        <p className="mt-2 text-sm text-muted-foreground">{d.outUnsupported}</p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{d.outBody}</p>
          <p className="text-sm font-medium" role="status">
            {status.locked ? d.outLocked : d.outUnlocked}
          </p>
          {status.locked && (
            <p className="text-pretty text-sm text-muted-foreground">
              {d.outLockSupport}{' '}
              <Link href="/support/new" className="font-medium text-brand underline underline-offset-4">
                {d.outSupportLink}
              </Link>
            </p>
          )}
          {status.restrictedUntil && (
            <p className="text-sm text-muted-foreground">
              {fill(d.outRestricted, {
                date: new Date(status.restrictedUntil).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US'),
              })}
            </p>
          )}
          <p className="text-pretty text-xs text-muted-foreground">{d.outFeeNote}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={isPending || blocked || Boolean(code)} onClick={showCode}>
              {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
              {d.outShowCode}
            </Button>
          </div>
          {code && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="break-all font-mono text-sm">{code}</code>
                <Button variant="ghost" size="sm" onClick={copyCode}>
                  {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copied ? d.outCopied : d.outCopy}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{d.outCodeNote}</p>
              <p className="text-xs text-muted-foreground">{d.outCodeAutoHide}</p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
