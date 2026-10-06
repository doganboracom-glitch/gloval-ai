'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  AtSign,
  Check,
  Copy,
  ExternalLink,
  Forward,
  Globe,
  Info,
  Loader2,
  Lock,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { BrandLogo } from '@/components/brand-logo'
import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import { StatusBadge } from '@/components/mail/status-badge'
import { formatMb, usagePercent } from '@/lib/mail/access'
import {
  createMyAlias,
  createMyMailbox,
  deleteMyAlias,
  deleteMyMailbox,
  resetMyMailboxPassword,
  updateMyMailbox,
  type MailOverview,
} from '@/lib/mail'
import type { MailErrorCode, Mailbox } from '@/lib/mail/types'

export function EmailClient({
  overview,
  userEmail,
}: {
  overview: MailOverview
  userEmail: string
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const m = t.mail

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showNewMailbox, setShowNewMailbox] = useState(false)
  const [showNewAlias, setShowNewAlias] = useState(false)
  const [editing, setEditing] = useState<Mailbox | null>(null)
  const [tempPassword, setTempPassword] = useState<{ address: string; value: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const { domain, gate, mailboxes, aliases, quota } = overview

  /** Localize a provider error code; never surface raw provider text. */
  const errorText = (code: MailErrorCode): string =>
    ({
      MAILBOX_EXISTS: m.errMailboxExists,
      ALIAS_EXISTS: m.errAliasExists,
      INVALID_ADDRESS: m.errInvalidAddress,
      INVALID_DESTINATION: m.errInvalidDestination,
      MAILBOX_LIMIT_REACHED: m.errLimitReached,
      QUOTA_EXCEEDED: m.errQuota,
      DOMAIN_NOT_ACTIVE: m.errDomainNotActive,
      FORBIDDEN: m.errForbidden,
      UNAUTHENTICATED: m.errForbidden,
      NOT_FOUND: m.errGeneric,
    })[code] ?? m.errGeneric

  const atLimit = mailboxes.length >= quota.maxMailboxes

  const shell = (children: React.ReactNode) => (
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
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {m.backToDashboard}
        </Link>

        <div className="mt-4">
          <h1 className="flex items-center gap-2.5 font-display text-3xl font-bold tracking-tight text-balance">
            <Mail className="size-7 text-primary" />
            {m.title}
          </h1>
          <p className="mt-1 text-muted-foreground">{m.subtitle}</p>
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label={m.close}>
              <X className="size-4" />
            </button>
          </div>
        )}

        {children}

        {!overview.live && (
          <div className="mt-10 flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
            <span>{m.mockNotice}</span>
          </div>
        )}
      </div>
    </div>
  )

  /* ---------------------- state 1: not entitled by plan ---------------------- */
  if (!quota.allowed) {
    return shell(
      <section className="mt-8 rounded-2xl border border-border bg-card/70 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-7" />
        </div>
        <h2 className="mt-5 font-display text-xl font-semibold">{m.lockedTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{m.lockedBody}</p>
        <LinkButton href="/billing" size="lg" className="mt-6">
          {m.lockedCta}
        </LinkButton>
      </section>,
    )
  }

  /* --------------------- state 2: entitled, but no domain -------------------- */
  if (!domain) {
    return shell(
      <>
        <section className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Globe className="size-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold">
            {gate.state === 'unverified' ? t.domains.gateUnverified : m.noDomainTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {gate.state === 'unverified' ? t.domains.verificationRequiredBody : m.noDomainBody}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            {/* Domain connection exists now, so this hands off to the shared
                domain flow instead of dead-ending on a disabled button. */}
            {gate.state === 'unverified' ? (
              <>
                <LinkButton href={`/dashboard/domains/${gate.domainId}`} size="lg">
                  {t.domains.gateViewDomain}
                </LinkButton>
                <span className="font-mono text-xs text-muted-foreground">{gate.domain}</span>
              </>
            ) : (
              <LinkButton href="/dashboard/domains" size="lg" className="gap-2">
                <Plus className="size-4" />
                {m.noDomainCta}
              </LinkButton>
            )}
          </div>
        </section>

        {/* Only a preview of what verification will require. Once a domain is
            connected, its detail page shows the real records instead. */}
        {gate.state === 'none' && (
          <section className="mt-6 rounded-2xl border border-border bg-card/70 p-6">
            <h3 className="font-display text-base font-semibold">{m.dnsExplainTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.dnsExplainBody}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {['MX', 'SPF', 'DKIM', 'DMARC'].map((rec) => (
                <li
                  key={rec}
                  className="rounded-md border border-border bg-muted/40 px-2.5 py-1 font-mono text-xs text-muted-foreground"
                >
                  {rec}
                </li>
              ))}
            </ul>
          </section>
        )}
      </>,
    )
  }

  /* ---------------------- state 3: full mailbox management ------------------- */

  function handleCreateMailbox(localPart: string, displayName: string) {
    setError(null)
    startTransition(async () => {
      const res = await createMyMailbox({ domainId: domain!.id, localPart, displayName })
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setShowNewMailbox(false)
      router.refresh()
    })
  }

  function handleUpdateMailbox(box: Mailbox, displayName: string) {
    setError(null)
    startTransition(async () => {
      const res = await updateMyMailbox(box.id, { displayName })
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setEditing(null)
      router.refresh()
    })
  }

  function toggleSuspend(box: Mailbox) {
    setError(null)
    startTransition(async () => {
      const res = await updateMyMailbox(box.id, {
        status: box.status === 'active' ? 'suspended' : 'active',
      })
      if (!res.ok) setError(errorText(res.error))
      else router.refresh()
    })
  }

  function handleDeleteMailbox(box: Mailbox) {
    if (!window.confirm(m.confirmRemoveMailbox)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteMyMailbox(box.id)
      if (!res.ok) setError(errorText(res.error))
      else router.refresh()
    })
  }

  function handleResetPassword(box: Mailbox) {
    setError(null)
    startTransition(async () => {
      const res = await resetMyMailboxPassword(box.id)
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setCopied(false)
      setTempPassword({ address: box.address, value: res.data.tempPassword })
    })
  }

  function handleCreateAlias(localPart: string, destinations: string[]) {
    setError(null)
    startTransition(async () => {
      const res = await createMyAlias({ domainId: domain!.id, localPart, destinations })
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setShowNewAlias(false)
      router.refresh()
    })
  }

  function handleDeleteAlias(aliasId: string) {
    if (!window.confirm(m.confirmRemoveAlias)) return
    setError(null)
    startTransition(async () => {
      const res = await deleteMyAlias(aliasId)
      if (!res.ok) setError(errorText(res.error))
      else router.refresh()
    })
  }

  return shell(
    <>
      {/* Domain + quota summary */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card/70 p-6">
          <h2 className="text-sm font-medium text-muted-foreground">{m.domain}</h2>
          <p className="mt-2 font-display text-2xl font-bold">{domain.domain}</p>
          <div className="mt-3">
            <StatusBadge tone={domain.status === 'active' ? 'success' : 'warning'}>
              {domain.status === 'active' ? m.stActive : m.stVerifying}
            </StatusBadge>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card/70 p-6">
          <h2 className="text-sm font-medium text-muted-foreground">{m.mailboxes}</h2>
          <p className="mt-2 font-display text-2xl font-bold">
            {mailboxes.length}
            <span className="text-base font-normal text-muted-foreground">
              {' / '}
              {quota.maxMailboxes}
            </span>
          </p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={mailboxes.length}
            aria-valuemin={0}
            aria-valuemax={quota.maxMailboxes}
            aria-label={m.mailboxes}
          >
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${usagePercent(mailboxes.length, quota.maxMailboxes)}%`,
              }}
            />
          </div>
          {atLimit && <p className="mt-2 text-xs text-muted-foreground">{m.limitReachedHint}</p>}
        </div>
      </section>

      {/* Mailboxes */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <AtSign className="size-5 text-primary" />
              {m.mailboxes}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.mailboxesHint}</p>
          </div>
          <Button
            onClick={() => setShowNewMailbox(true)}
            disabled={atLimit || isPending}
            className="gap-2"
          >
            <Plus className="size-4" />
            {m.newMailbox}
          </Button>
        </div>

        {mailboxes.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {m.noMailboxes}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {mailboxes.map((box) => (
              <li
                key={box.id}
                className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{box.address}</span>
                    <StatusBadge tone={box.status === 'active' ? 'success' : 'muted'}>
                      {box.status === 'active' ? m.stActive : m.stSuspended}
                    </StatusBadge>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{box.displayName}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${usagePercent(box.usedMb, box.quotaMb)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatMb(box.usedMb)} / {formatMb(box.quotaMb)} {m.quotaUsed}
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(box)} className="gap-1.5">
                    <Pencil className="size-3.5" />
                    <span className="sr-only sm:not-sr-only">{m.edit}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResetPassword(box)}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    <span className="sr-only sm:not-sr-only">{m.resetPassword}</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => toggleSuspend(box)}>
                    <span className="text-xs">
                      {box.status === 'active' ? m.suspend : m.activate}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteMailbox(box)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                    <span className="sr-only">{m.remove}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Aliases */}
      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
              <Forward className="size-5 text-primary" />
              {m.aliases}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.aliasesHint}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => setShowNewAlias(true)}
            disabled={mailboxes.length === 0 || isPending}
            className="gap-2"
          >
            <Plus className="size-4" />
            {m.newAlias}
          </Button>
        </div>

        {aliases.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-border bg-card/40 px-4 py-10 text-center text-sm text-muted-foreground">
            {m.noAliases}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {aliases.map((alias) => (
              <li
                key={alias.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{alias.address}</p>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {alias.destinations.join(', ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteAlias(alias.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{m.remove}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Webmail */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/70 p-6">
        <div>
          <h2 className="font-display text-base font-semibold">{m.webmailTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.webmailBody}</p>
        </div>
        <a
          href={`https://webmail.${domain.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
        >
          <ExternalLink className="size-4" />
          {m.openWebmail}
        </a>
      </section>

      {/* ------------------------------- dialogs ------------------------------- */}
      {showNewMailbox && (
        <MailboxDialog
          title={m.newMailbox}
          domain={domain.domain}
          pending={isPending}
          onCancel={() => setShowNewMailbox(false)}
          onSubmit={handleCreateMailbox}
        />
      )}

      {editing && (
        <MailboxDialog
          title={m.edit}
          domain={domain.domain}
          pending={isPending}
          existing={editing}
          onCancel={() => setEditing(null)}
          onSubmit={(_, displayName) => handleUpdateMailbox(editing, displayName)}
        />
      )}

      {showNewAlias && (
        <AliasDialog
          domain={domain.domain}
          mailboxes={mailboxes}
          pending={isPending}
          onCancel={() => setShowNewAlias(false)}
          onSubmit={handleCreateAlias}
        />
      )}

      {tempPassword && (
        <Modal onClose={() => setTempPassword(null)}>
          <h3 className="font-display text-lg font-semibold">{m.tempPasswordTitle}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{tempPassword.address}</p>
          <p className="mt-3 text-sm text-muted-foreground">{m.tempPasswordBody}</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <code className="flex-1 truncate font-mono text-sm">{tempPassword.value}</code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(tempPassword.value)
                setCopied(true)
              }}
              className="gap-1.5"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? m.copied : m.copy}
            </Button>
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setTempPassword(null)}>{m.close}</Button>
          </div>
        </Modal>
      )}
    </>,
  )
}

/* --------------------------------- helpers -------------------------------- */

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
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

function MailboxDialog({
  title,
  domain,
  pending,
  existing,
  onCancel,
  onSubmit,
}: {
  title: string
  domain: string
  pending: boolean
  existing?: Mailbox
  onCancel: () => void
  onSubmit: (localPart: string, displayName: string) => void
}) {
  const { t } = useLanguage()
  const m = t.mail
  const [localPart, setLocalPart] = useState(existing?.localPart ?? '')
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '')

  // Mirror the provider's own rule so the user gets feedback before a round trip.
  const valid =
    Boolean(existing) || (/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) && !localPart.includes('..'))

  return (
    <Modal onClose={onCancel}>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{m.localPart}</span>
          <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
              disabled={Boolean(existing)}
              autoFocus={!existing}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none disabled:text-muted-foreground"
              placeholder="info"
            />
            <span className="shrink-0 pr-3 text-sm text-muted-foreground">@{domain}</span>
          </div>
          {!existing && <span className="text-xs text-muted-foreground">{m.localPartHint}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{m.displayName}</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoFocus={Boolean(existing)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Bilgi"
          />
        </label>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {m.cancel}
        </Button>
        <Button
          onClick={() => onSubmit(localPart, displayName)}
          disabled={!valid || pending}
          className="gap-2"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {existing ? m.save : m.create}
        </Button>
      </div>
    </Modal>
  )
}

function AliasDialog({
  domain,
  mailboxes,
  pending,
  onCancel,
  onSubmit,
}: {
  domain: string
  mailboxes: Mailbox[]
  pending: boolean
  onCancel: () => void
  onSubmit: (localPart: string, destinations: string[]) => void
}) {
  const { t } = useLanguage()
  const m = t.mail
  const [localPart, setLocalPart] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const valid = useMemo(
    () =>
      /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) &&
      !localPart.includes('..') &&
      selected.length > 0,
    [localPart, selected],
  )

  function toggle(address: string) {
    setSelected((prev) =>
      prev.includes(address) ? prev.filter((a) => a !== address) : [...prev, address],
    )
  }

  return (
    <Modal onClose={onCancel}>
      <h3 className="font-display text-lg font-semibold">{m.newAlias}</h3>
      <div className="mt-4 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{m.localPart}</span>
          <div className="flex items-center rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring">
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value.toLowerCase())}
              autoFocus
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              placeholder="iletisim"
            />
            <span className="shrink-0 pr-3 text-sm text-muted-foreground">@{domain}</span>
          </div>
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">{m.destinations}</legend>
          <span className="text-xs text-muted-foreground">{m.selectDestinations}</span>
          <div className="mt-1 flex flex-col gap-1.5">
            {mailboxes.map((box) => (
              <label
                key={box.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(box.address)}
                  onChange={() => toggle(box.address)}
                  className="size-4 accent-primary"
                />
                <span className="truncate">{box.address}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {m.cancel}
        </Button>
        <Button
          onClick={() => onSubmit(localPart, selected)}
          disabled={!valid || pending}
          className="gap-2"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {m.create}
        </Button>
      </div>
    </Modal>
  )
}
