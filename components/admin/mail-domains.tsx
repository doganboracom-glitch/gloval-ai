'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Loader2, ShieldCheck, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { StatusBadge, STATUS_TONE } from '@/components/mail/status-badge'
import { adminVerifyDomain } from '@/lib/mail'
import type { MailDomain } from '@/lib/mail/types'

export function MailDomains({ domains }: { domains: MailDomain[] }) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const m = t.mail

  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<string | null>(domains[0]?.id ?? null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
  })

  const statusLabel = (status: MailDomain['status']) =>
    ({
      active: m.stActive,
      verifying: m.stVerifying,
      pending: m.stPending,
      failed: m.stFailed,
    })[status]

  function verify(domainId: string) {
    setError(null)
    setBusyId(domainId)
    startTransition(async () => {
      const res = await adminVerifyDomain(domainId)
      setBusyId(null)
      if (!res.ok) setError(m.errGeneric)
      else router.refresh()
    })
  }

  if (domains.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-14 text-center text-sm text-muted-foreground">
        {m.noDomains}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label={m.close}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {domains.map((domain) => {
        const open = expanded === domain.id
        return (
          <section key={domain.id} className="rounded-2xl border border-border bg-card/70">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-display text-base font-semibold">{domain.domain}</h2>
                  <StatusBadge tone={STATUS_TONE[domain.status]}>
                    {statusLabel(domain.status)}
                  </StatusBadge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {m.created}: {dateFmt.format(new Date(domain.createdAt))}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {domain.status !== 'active' && (
                  <Button
                    size="sm"
                    onClick={() => verify(domain.id)}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    {busyId === domain.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-3.5" />
                    )}
                    {m.verify}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(open ? null : domain.id)}
                  aria-expanded={open}
                  className="gap-1.5"
                >
                  {m.dnsRecords}
                  <ChevronDown
                    className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </Button>
              </div>
            </div>

            {open && (
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="px-4 py-2 font-medium">
                        {m.type}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {m.host}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {m.value}
                      </th>
                      <th scope="col" className="px-4 py-2 font-medium">
                        {m.statusLabel}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.dns.map((record, i) => (
                      <tr key={`${record.type}-${record.host}-${i}`} className="border-t border-border/60">
                        <td className="px-4 py-2.5 font-mono text-xs">
                          {record.type}
                          {record.priority != null && (
                            <span className="text-muted-foreground"> ({record.priority})</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{record.host}</td>
                        <td className="max-w-xs px-4 py-2.5">
                          <code className="block truncate font-mono text-xs text-muted-foreground">
                            {record.value}
                          </code>
                        </td>
                        <td className="px-4 py-2.5">
                          {record.verified ? (
                            <span className="inline-flex items-center gap-1 text-xs text-primary">
                              <Check className="size-3.5" />
                              {m.verified}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <X className="size-3.5" />
                              {m.notVerified}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
