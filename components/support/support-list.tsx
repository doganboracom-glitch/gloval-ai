'use client'

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { LinkButton } from '@/components/link-button'
import { SupportShell, TicketStatusBadge, useSupportCopy } from '@/components/support/support-shell'
import type { SupportTicketSummary } from '@/lib/support/queries'

export function SupportList({ tickets }: { tickets: SupportTicketSummary[] }) {
  const c = useSupportCopy()
  return (
    <SupportShell
      title={c.title}
      subtitle={c.subtitle}
      backHref="/dashboard"
      backLabel={c.back}
      actions={
        <LinkButton href="/support/new" variant="brand" size="sm" className="gap-1.5">
          <Plus className="size-4" />
          {c.newTicket}
        </LinkButton>
      }
    >
      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {c.empty}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/support/${t.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject}</p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {t.ticketNumber} · {c.departments[t.department]} ·{' '}
                    {new Date(t.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <TicketStatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SupportShell>
  )
}
