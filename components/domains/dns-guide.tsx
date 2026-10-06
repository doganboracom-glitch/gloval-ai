'use client'

import { Info, ListChecks, MailWarning } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { CustomDomain } from '@/lib/custom-domains/types'

export function DnsGuide({ domain }: { domain: CustomDomain }) {
  const { t } = useLanguage()
  const c = t.domains.guide

  const usable = domain.status === 'active'
  const actionable = domain.dns.filter((r) => r.purpose !== 'email' && !r.placeholder)
  const hasWebsiteRecords = domain.dns.some((r) => r.purpose === 'website')
  const hostingMissing = !domain.connection.legacy && domain.connection.vercel === 'not_configured'

  const websiteNote = !usable
    ? c.needsOwnership
    : hasWebsiteRecords || domain.connection.legacy
      ? null
      : hostingMissing
        ? c.hostingMissing
        : c.recordsPending

  const hasEmailRecords = domain.dns.some((r) => r.purpose === 'email')

  return (
    <div className="flex flex-col gap-4">
      {websiteNote && (
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="text-pretty text-muted-foreground">{websiteNote}</span>
        </div>
      )}

      {actionable.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ListChecks className="size-4 text-muted-foreground" />
            {c.stepsTitle}
          </h3>
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
            {c.steps.map((step) => (
              <li key={step} className="text-pretty">
                {step}
              </li>
            ))}
          </ol>
          {hasWebsiteRecords && <p className="mt-3 text-pretty text-xs text-muted-foreground">{c.sameNameNote}</p>}
        </section>
      )}

      {hasEmailRecords && (
        <div role="note" className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <MailWarning className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">{c.emailTitle}</p>
            <p className="mt-0.5 text-pretty text-muted-foreground">{c.emailBody}</p>
          </div>
        </div>
      )}
    </div>
  )
}
