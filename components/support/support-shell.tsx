'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { getSupportCopy } from '@/components/support/support-copy'
import { TicketStatusPill } from '@/components/support/ticket-status-pill'
import type { TicketStatus } from '@/lib/support/constants'

export function useSupportCopy() {
  const { lang } = useLanguage()
  return getSupportCopy(lang)
}

export function SupportShell({
  title,
  subtitle,
  backHref,
  backLabel,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  backHref: string
  backLabel: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLogo />
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Link
          href={backHref}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold text-balance">{title}</h1>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground text-pretty">{subtitle}</p> : null}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  )
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const c = useSupportCopy()
  return <TicketStatusPill status={status} label={c.status[status]} />
}
