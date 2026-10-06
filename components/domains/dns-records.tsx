'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { StatusBadge } from '@/components/mail/status-badge'
import { cn } from '@/lib/utils'
import type { DnsRecord, DomainPurpose } from '@/lib/custom-domains/types'

/**
 * DNS record list, grouped by what each record is for.
 *
 * Built to grow: it renders whatever record types the provider returns
 * (`A`, `AAAA`, `CNAME`, `TXT`, `MX` today) and shows the optional role label
 * (`SPF`, `DKIM`, `DMARC`) next to the type, so the email record set needs no
 * component change when a real provider starts returning it.
 *
 * When records are placeholders it says so, loudly, above the table. Showing a
 * fabricated DNS value as if it were publishable would send customers to their
 * registrar to enter something that cannot work.
 */

const GROUP_ORDER: DomainPurpose[] = ['verification', 'website', 'email']

export function DnsRecords({ records }: { records: DnsRecord[] }) {
  const { t } = useLanguage()
  const d = t.domains

  const groupLabel: Record<DomainPurpose, string> = {
    verification: d.dnsGroupVerification,
    website: d.dnsGroupWebsite,
    email: d.dnsGroupEmail,
  }

  // Only website/verification placeholders mean the real DNS records were not
  // fetched. Placeholder email rows must not trigger the notice on their own.
  const hasPlaceholders = records.some((r) => r.placeholder && r.purpose !== 'email')

  const groups = GROUP_ORDER.map((purpose) => ({
    purpose,
    records: records.filter((r) => r.purpose === purpose),
  })).filter((group) => group.records.length > 0)

  if (groups.length === 0) return null

  return (
    <div>
      {hasPlaceholders && (
        <div
          role="note"
          className="flex items-start gap-2.5 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-pretty"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-accent" />
          <span className="text-muted-foreground">{d.dnsPlaceholderNotice}</span>
        </div>
      )}

      <div className={cn('flex flex-col gap-6', hasPlaceholders && 'mt-5')}>
        {groups.map((group) => (
          <section key={group.purpose}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {groupLabel[group.purpose]}
            </h4>
            {group.purpose === 'email' ? (
              <div className="mt-2 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Host</th>
                      <th className="px-3 py-2 font-medium">Value</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.records.map((record, index) => (
                      <EmailRecordRow key={`${record.type}-${record.host}-${index}`} record={record} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {group.records.map((record, index) => (
                  <RecordRow key={`${record.type}-${record.host}-${index}`} record={record} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { t } = useLanguage()
  const d = t.domains
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${d.dnsCopy}: ${label}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      <span className="sr-only sm:not-sr-only">{copied ? d.dnsCopied : d.dnsCopy}</span>
    </button>
  )
}

function EmailRecordRow({ record }: { record: DnsRecord }) {
  const { t } = useLanguage()
  const d = t.domains

  return (
    <tr>
      <td className="px-3 py-3 align-top font-mono text-xs font-medium">
        {record.label ?? record.type}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex min-w-32 items-start gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{record.host}</code>
          <CopyButton value={record.host} label={record.host} />
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex min-w-56 items-start gap-2">
          <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{record.value}</code>
          <CopyButton value={record.value} label={record.value} />
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <StatusBadge tone={record.verified ? 'success' : 'muted'}>
          {record.verified ? t.mail.verified : t.mail.notVerified}
        </StatusBadge>
      </td>
    </tr>
  )
}

function RecordRow({ record }: { record: DnsRecord }) {
  const { t } = useLanguage()
  const d = t.domains
  const sourceLabel = record.source ? d.recordSource[record.source] : null

  return (
    <li className="rounded-xl border border-border bg-card/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs font-medium">
          {record.type}
        </span>
        {record.label && (
          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
            {record.label}
          </span>
        )}
        {typeof record.priority === 'number' && (
          <span className="text-xs text-muted-foreground">
            {d.dnsPriority}: {record.priority}
          </span>
        )}
        <span className="ml-auto">
          <StatusBadge tone={record.verified ? 'success' : 'muted'}>
            {record.verified ? t.mail.verified : t.mail.notVerified}
          </StatusBadge>
        </span>
      </div>

      <dl className="mt-3 grid gap-2 sm:grid-cols-[7rem_1fr]">
        <dt className="text-xs text-muted-foreground sm:pt-1.5">{d.dnsHost}</dt>
        <dd className="flex items-start gap-2">
          <code className="min-w-0 flex-1 font-mono text-sm break-all">{record.host}</code>
          <CopyButton value={record.host} label={record.host} />
        </dd>

        <dt className="text-xs text-muted-foreground sm:pt-1.5">{d.dnsValue}</dt>
        <dd className="flex items-start gap-2">
          <code className="min-w-0 flex-1 font-mono text-sm break-all text-muted-foreground">
            {record.value}
          </code>
          <CopyButton value={record.value} label={record.value} />
        </dd>
      </dl>
      {sourceLabel && <p className="mt-2 text-xs text-muted-foreground">{sourceLabel}</p>}
    </li>
  )
}
