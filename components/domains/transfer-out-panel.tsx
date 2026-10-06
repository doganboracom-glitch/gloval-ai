'use client'

import { useEffect, useState, useTransition } from 'react'
import { ArrowRightLeft, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { fill } from '@/components/domains/domain-chrome'
import {
  getMyTransferOutStatus,
  revealMyAuthCode,
  type TransferOutStatus,
} from '@/lib/custom-domains/registrar/transfer-actions'

/** Lock / unlock / EPP code for a domain registered through us. Renders nothing when not applicable. */
export function TransferOutPanel({ domain }: { domain: string }) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const [status, setStatus] = useState<TransferOutStatus | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getMyTransferOutStatus(domain).then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [domain])

  if (!status) return null
  if (!status.ok || (!status.supported && status.reason === 'NOT_REGISTERED_HERE')) return null

  function showCode() {
    setError(null)
    startTransition(async () => {
      const res = await revealMyAuthCode(domain)
      if (!res.ok) return setError(d.outErr)
      setCode(res.authCode)
    })
  }

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
          <p className="text-sm font-medium">{status.locked ? d.outLocked : d.outUnlocked}</p>
          {status.restrictedUntil && (
            <p className="text-sm text-muted-foreground">
              {fill(d.outRestricted, {
                date: new Date(status.restrictedUntil).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US'),
              })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={isPending || status.locked || Boolean(status.restrictedUntil)}
              onClick={showCode}
            >
              {isPending && <Loader2 className="mr-2 size-3.5 animate-spin" />}
              {d.outShowCode}
            </Button>
          </div>
          <p className="text-pretty text-xs text-muted-foreground">{d.outLockUnsupported}</p>
          {code && (
            <div className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <code className="break-all font-mono text-sm">{code}</code>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(code)}>
                  {d.outCopy}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{d.outCodeNote}</p>
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
