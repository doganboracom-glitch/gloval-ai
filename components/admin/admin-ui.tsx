'use client'

import { StatusBadge as MailStatusBadge, type MailStatusTone } from '@/components/mail/status-badge'
import { cn } from '@/lib/utils'

/**
 * Shared building blocks for admin pages, so every list/detail screen shares
 * one visual language (matching the existing mail admin surface: `rounded-xl
 * border border-border bg-card/70`, `font-display` headings). Kept tiny and
 * presentational — no data access.
 */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-balance">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground text-pretty">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string | number
  hint?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card/70 p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl font-bold tabular-nums">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function Panel({
  title,
  children,
  className,
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-border bg-card/70', className)}>
      {title ? (
        <h3 className="border-b border-border px-4 py-3 font-display text-sm font-semibold">
          {title}
        </h3>
      ) : null}
      {children}
    </section>
  )
}

/** A horizontally scrollable table wrapper with consistent header styling. */
export function DataTable({
  head,
  children,
  empty,
  isEmpty,
}: {
  head: React.ReactNode
  children: React.ReactNode
  empty: string
  isEmpty: boolean
}) {
  if (isEmpty) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-12 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card/70">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn('px-4 py-2.5 font-medium whitespace-nowrap', className)}>{children}</th>
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 align-middle', className)}>{children}</td>
}

export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <tr className={cn('border-b border-border/60 last:border-0 hover:bg-muted/40', className)}>
      {children}
    </tr>
  )
}

/**
 * Admin surfaces call the badge with a `label` string, so wrap the mail
 * `StatusBadge` (which takes `children`) to accept `label` in one place.
 */
export function StatusBadge({
  tone,
  label,
  children,
  className,
}: {
  tone: MailStatusTone
  label?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <MailStatusBadge tone={tone} className={className}>
      {label ?? children}
    </MailStatusBadge>
  )
}

export { type MailStatusTone }
