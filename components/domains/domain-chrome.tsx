'use client'

import Link from 'next/link'
import { ArrowLeft, Info, X } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { StatusBadge, type MailStatusTone } from '@/components/mail/status-badge'
import type { DomainStatus } from '@/lib/custom-domains/types'

/**
 * Shared chrome for the domain screens.
 *
 * Reuses the existing dashboard/email page furniture (grid background, brand
 * header, page title, mock notice) and the existing `StatusBadge` so a status
 * reads identically on the domains, email and admin surfaces. No new design
 * language is introduced here.
 */

export function DomainShell({
  userEmail,
  backHref,
  backLabel,
  title,
  subtitle,
  icon,
  error,
  onDismissError,
  notice,
  children,
}: {
  userEmail: string
  backHref: string
  backLabel: string
  title: React.ReactNode
  subtitle?: string
  icon?: React.ReactNode
  error?: string | null
  onDismissError?: () => void
  /** Rendered at the bottom, e.g. the test-provider disclosure. */
  notice?: string | null
  children: React.ReactNode
}) {
  const { t } = useLanguage()

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
          </div>
        </header>

        <Link
          href={backHref}
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Link>

        <div className="mt-4">
          <h1 className="flex items-center gap-2.5 font-display text-3xl font-bold tracking-tight text-balance">
            {icon}
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-pretty text-muted-foreground">{subtitle}</p>}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{error}</span>
            {onDismissError && (
              <button type="button" onClick={onDismissError} aria-label={t.mail.close}>
                <X className="size-4" />
              </button>
            )}
          </div>
        )}

        {children}

        {notice && (
          <div className="mt-10 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>{notice}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const STATUS_TONE: Record<DomainStatus, MailStatusTone> = {
  active: 'success',
  verifying: 'warning',
  pending: 'warning',
  failed: 'danger',
  disabled: 'muted',
}

/** Localized status pill for a custom domain. */
export function DomainStatusBadge({ status }: { status: DomainStatus }) {
  const { t } = useLanguage()
  const d = t.domains

  const label: Record<DomainStatus, string> = {
    pending: d.statusPending,
    verifying: d.statusVerifying,
    active: d.statusActive,
    failed: d.statusFailed,
    disabled: d.statusDisabled,
  }

  return <StatusBadge tone={STATUS_TONE[status]}>{label[status]}</StatusBadge>
}

/** Same lightweight modal shape the email screens already use. */
export function DomainModal({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="float-right text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  )
}

/** Fills `{token}` placeholders in a dictionary string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    key in values ? String(values[key]) : match,
  )
}
