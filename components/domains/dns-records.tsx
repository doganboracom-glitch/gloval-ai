'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Copy } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { StatusBadge } from '@/components/mail/status-badge'
import { getEmailDnsCopy, hostNoteFor, type EmailDnsCopy } from '@/components/domains/email-dns-copy'
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
              <>
                <div className="mt-2 hidden overflow-x-auto rounded-xl border border-border md:block">
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
                <ul className="mt-2 flex flex-col gap-2 md:hidden">
                  {group.records.map((record, index) => (
                    <EmailRecordCard key={`${record.type}-${record.host}-${index}`} record={record} />
                  ))}
                </ul>
              </>
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

/** Real DNS type plus, for TXT records, a small note on what the record is for. */
function EmailTypeCell({ record, copy }: { record: DnsRecord; copy: EmailDnsCopy }) {
  const role = record.label ? copy.roles[record.label] : null
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs font-medium">
        {record.type}
      </span>
      {role && <span className="text-pretty text-xs text-muted-foreground">{role}</span>}
    </div>
  )
}

function EmailHostCell({ record, copy }: { record: DnsRecord; copy: EmailDnsCopy }) {
  const note = hostNoteFor(record, copy)
  return (
    <div className="min-w-0">
      <div className="flex min-w-32 items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{record.host}</code>
        <CopyButton value={record.host} label={record.host} />
      </div>
      {note && <p className="mt-1 text-pretty text-xs text-muted-foreground">{note}</p>}
    </div>
  )
}

function EmailValueCell({ record, copy }: { record: DnsRecord; copy: EmailDnsCopy }) {
  const priority = typeof record.priority === 'number' ? String(record.priority) : null
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {priority && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{copy.priority}:</span>
          <code className="font-mono text-xs">{priority}</code>
          <CopyButton value={priority} label={`${copy.priority} ${priority}`} />
        </div>
      )}
      <div className="flex min-w-0 items-start gap-2 md:min-w-56">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">{record.value}</code>
        <CopyButton value={record.value} label={record.value} />
      </div>
    </div>
  )
}

function EmailRecordRow({ record }: { record: DnsRecord }) {
  const { t, lang } = useLanguage()
  const copy = getEmailDnsCopy(lang)

  return (
    <tr>
      <td className="px-3 py-3 align-top">
        <EmailTypeCell record={record} copy={copy} />
      </td>
      <td className="px-3 py-3 align-top">
        <EmailHostCell record={record} copy={copy} />
      </td>
      <td className="px-3 py-3 align-top">
        <EmailValueCell record={record} copy={copy} />
      </td>
      <td className="px-3 py-3 align-top">
        <StatusBadge tone={record.verified ? 'success' : 'muted'}>
          {record.verified ? t.mail.verified : t.mail.notVerified}
        </StatusBadge>
      </td>
    </tr>
  )
}

function EmailRecordCard({ record }: { record: DnsRecord }) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const copy = getEmailDnsCopy(lang)

  return (
    <li className="rounded-xl border border-border bg-card/70 p-3">
      <div className="flex items-start justify-between gap-2">
        <EmailTypeCell record={record} copy={copy} />
        <StatusBadge tone={record.verified ? 'success' : 'muted'}>
          {record.verified ? t.mail.verified : t.mail.notVerified}
        </StatusBadge>
      </div>
      <dl className="mt-3 flex flex-col gap-3">
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">{d.dnsHost}</dt>
          <dd>
            <EmailHostCell record={record} copy={copy} />
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-xs text-muted-foreground">{d.dnsValue}</dt>
          <dd>
            <EmailValueCell record={record} copy={copy} />
          </dd>
        </div>
      </dl>
    </li>
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
