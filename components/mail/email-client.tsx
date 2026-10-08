'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  AtSign,
  Check,
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
import { PasswordFields } from '@/components/mail/password-fields'
import { getPasswordCopy } from '@/components/mail/password-copy'
import { getAliasCopy } from '@/components/mail/alias-copy'
import { getForwardingCopy, type ForwardingCopy } from '@/components/mail/forwarding-copy'
import { validateForwardingDestinations } from '@/lib/mail/forwarding'
import {
  MAX_ALIAS_DESTINATIONS,
  isExternalDestination,
  normalizeDestinationAddress,
  validateAliasDestinations,
} from '@/lib/mail/alias-destinations'
import { formatMb, usagePercent } from '@/lib/mail/access'
import { validateMailboxPassword } from '@/lib/mail/password'
import {
  createMyAlias,
  createMyMailbox,
  deleteMyAlias,
  setMyAliasActive,
  deleteMyMailbox,
  setMyMailboxForwarding,
  setMyMailboxPassword,
  updateMyMailbox,
  type MailOverview,
} from '@/lib/mail'
import type { MailErrorCode, MailForwarding, Mailbox } from '@/lib/mail/types'

export function EmailClient({
  overview,
  userEmail,
}: {
  overview: MailOverview
  userEmail: string
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const m = t.mail
  const pc = getPasswordCopy(lang)
  const ac = getAliasCopy(lang)
  const fc = getForwardingCopy(lang)

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Errors from the password-bearing dialogs are shown inside the dialog,
  // because the page-level banner sits behind the modal backdrop.
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [showNewMailbox, setShowNewMailbox] = useState(false)
  const [showNewAlias, setShowNewAlias] = useState(false)
  const [editing, setEditing] = useState<Mailbox | null>(null)
  const [passwordTarget, setPasswordTarget] = useState<Mailbox | null>(null)
  const [forwardTarget, setForwardTarget] = useState<Mailbox | null>(null)

  const { domain, gate, mailboxes, aliases, forwardings, quota } = overview

  /** Localize a provider error code; never surface raw provider text. */
  const errorText = (code: MailErrorCode): string =>
    ({
      MAILBOX_EXISTS: m.errMailboxExists,
      ALIAS_EXISTS: ac.errAliasExists,
      ADDRESS_IS_MAILBOX: ac.errAddressIsMailbox,
      INVALID_ADDRESS: m.errInvalidAddress,
      INVALID_DESTINATION: ac.errInvalidDestination,
      TOO_MANY_DESTINATIONS: ac.errTooMany,
      SELF_DESTINATION: ac.errSelf,
      INVALID_PASSWORD: pc.invalid,
      PASSWORD_UPDATE_FAILED: pc.updateFailed,
      FORWARD_UPDATE_FAILED: fc.errUpdateFailed,
      FORWARD_FILTER_CONFLICT: fc.errConflict,
      FORWARD_UNREADABLE: fc.errUnreadable,
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

        {notice && (
          <div
            role="status"
            className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <Check className="size-4 text-primary" />
              {notice}
            </span>
            <button type="button" onClick={() => setNotice(null)} aria-label={m.close}>
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

  function handleCreateMailbox(
    localPart: string,
    displayName: string,
    password: string,
    passwordConfirm: string,
  ) {
    setError(null)
    setDialogError(null)
    startTransition(async () => {
      const res = await createMyMailbox({
        domainId: domain!.id,
        localPart,
        displayName,
        password,
        passwordConfirm,
      })
      if (!res.ok) {
        setDialogError(errorText(res.error))
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

  function handleSetPassword(box: Mailbox, password: string, passwordConfirm: string) {
    setError(null)
    setDialogError(null)
    startTransition(async () => {
      const res = await setMyMailboxPassword(box.id, { password, passwordConfirm })
      if (!res.ok) {
        setDialogError(errorText(res.error))
        return
      }
      setPasswordTarget(null)
      setNotice(`${pc.updated}: ${box.address}`)
    })
  }

  function handleSetForwarding(
    box: Mailbox,
    destinations: string[],
    keepCopy: boolean,
    overwriteUnreadable: boolean,
  ) {
    setError(null)
    setDialogError(null)
    startTransition(async () => {
      const res = await setMyMailboxForwarding(box.id, { destinations, keepCopy, overwriteUnreadable })
      if (!res.ok) {
        setDialogError(errorText(res.error))
        return
      }
      setForwardTarget(null)
      setNotice(`${destinations.length > 0 ? fc.saved : fc.disabled}: ${box.address}`)
      router.refresh()
    })
  }

  function handleCreateAlias(localPart: string, destinations: string[]) {
    setError(null)
    setDialogError(null)
    startTransition(async () => {
      const res = await createMyAlias({ domainId: domain!.id, localPart, destinations })
      if (!res.ok) {
        // The dialog is modal, so a page-level banner would sit behind its backdrop.
        setDialogError(errorText(res.error))
        // A conflict means the visible list is stale; reload it.
        router.refresh()
        return
      }
      setShowNewAlias(false)
      router.refresh()
    })
  }

  function handleEnableAlias(aliasId: string) {
    setError(null)
    startTransition(async () => {
      const res = await setMyAliasActive(aliasId, true)
      if (!res.ok) setError(errorText(res.error))
      else router.refresh()
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
            onClick={() => {
              setDialogError(null)
              setNotice(null)
              setShowNewMailbox(true)
            }}
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
                  <ForwardingSummary forwarding={forwardings[box.id]} copy={fc} domain={domain.domain} />
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
                    onClick={() => {
                      setDialogError(null)
                      setNotice(null)
                      setPasswordTarget(box)
                    }}
                    className="gap-1.5"
                  >
                    <RotateCcw className="size-3.5" />
                    <span className="sr-only sm:not-sr-only">{m.resetPassword}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDialogError(null)
                      setNotice(null)
                      setForwardTarget(box)
                    }}
                    className="gap-1.5"
                  >
                    <Forward className="size-3.5" />
                    <span className="sr-only sm:not-sr-only">{fc.action}</span>
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
            <p className="mt-1 text-sm text-muted-foreground">{ac.aliasesHint}</p>
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
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{alias.address}</span>
                    <span
                      className={
                        alias.active
                          ? 'shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand'
                          : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
                      }
                    >
                      {alias.active ? ac.statusActive : ac.statusInactive}
                    </span>
                  </p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {alias.destinations.map((dest) => (
                      <li
                        key={dest}
                        className="flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        <span className="truncate">{dest}</span>
                        {isExternalDestination(dest, domain.domain) && (
                          <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-medium uppercase tracking-wide text-brand">
                            {ac.externalBadge}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-1">
                  {!alias.active && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEnableAlias(alias.id)}
                      disabled={isPending}
                    >
                      {ac.enable}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteAlias(alias.id)}
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

      {/* Webmail */}
      <section className="mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/70 p-6">
        <div>
          <h2 className="font-display text-base font-semibold">{m.webmailTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{m.webmailBody}</p>
        </div>
        {overview.webmailBase && (
          <a
            href={overview.webmailBase}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <ExternalLink className="size-4" />
            {m.openWebmail}
          </a>
        )}
      </section>

      {/* ------------------------------- dialogs ------------------------------- */}
      {showNewMailbox && (
        <MailboxDialog
          title={m.newMailbox}
          domain={domain.domain}
          pending={isPending}
          error={dialogError}
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
          aliasAddresses={aliases.map((a) => a.address)}
          pending={isPending}
          error={dialogError}
          onCancel={() => {
            setShowNewAlias(false)
            setDialogError(null)
          }}
          onSubmit={handleCreateAlias}
        />
      )}

      {forwardTarget && (
        <ForwardingDialog
          key={forwardTarget.id}
          mailbox={forwardTarget}
          forwarding={forwardings[forwardTarget.id]}
          domain={domain.domain}
          internalAddresses={
            new Set([...mailboxes.map((b) => b.address), ...aliases.map((a) => a.address)].map((a) => a.toLowerCase()))
          }
          pending={isPending}
          error={dialogError}
          onCancel={() => {
            setForwardTarget(null)
            setDialogError(null)
          }}
          onSubmit={(destinations, keepCopy, overwrite) =>
            handleSetForwarding(forwardTarget, destinations, keepCopy, overwrite)
          }
        />
      )}

      {passwordTarget && (
        <SetPasswordDialog
          mailbox={passwordTarget}
          pending={isPending}
          error={dialogError}
          onCancel={() => setPasswordTarget(null)}
          onSubmit={(password, confirm) => handleSetPassword(passwordTarget, password, confirm)}
        />
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
  error,
  onCancel,
  onSubmit,
}: {
  title: string
  domain: string
  pending: boolean
  existing?: Mailbox
  error?: string | null
  onCancel: () => void
  onSubmit: (localPart: string, displayName: string, password: string, passwordConfirm: string) => void
}) {
  const { t, lang } = useLanguage()
  const m = t.mail
  const pc = getPasswordCopy(lang)
  const [localPart, setLocalPart] = useState(existing?.localPart ?? '')
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '')
  const [passwords, setPasswords] = useState({ password: '', confirm: '' })

  // Mirror the provider's own rule so the user gets feedback before a round trip.
  const addressValid =
    Boolean(existing) || (/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) && !localPart.includes('..'))
  const passwordValid =
    Boolean(existing) || validateMailboxPassword(passwords.password, passwords.confirm).length === 0
  const valid = addressValid && passwordValid

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

        {!existing && (
          <PasswordFields
            copy={pc}
            password={passwords.password}
            confirm={passwords.confirm}
            onChange={setPasswords}
            labels={{ password: pc.password, confirm: pc.passwordConfirm }}
          />
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {m.cancel}
        </Button>
        <Button
          onClick={() => onSubmit(localPart, displayName, passwords.password, passwords.confirm)}
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

function SetPasswordDialog({
  mailbox,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mailbox: Mailbox
  pending: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (password: string, passwordConfirm: string) => void
}) {
  const { t, lang } = useLanguage()
  const m = t.mail
  const pc = getPasswordCopy(lang)
  const [passwords, setPasswords] = useState({ password: '', confirm: '' })
  const valid = validateMailboxPassword(passwords.password, passwords.confirm).length === 0

  return (
    <Modal onClose={onCancel}>
      <h3 className="font-display text-lg font-semibold">{pc.resetTitle}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{mailbox.address}</p>
      <p className="mt-3 text-sm text-muted-foreground">{pc.resetBody}</p>

      <div className="mt-4 flex flex-col gap-4">
        <PasswordFields
          copy={pc}
          password={passwords.password}
          confirm={passwords.confirm}
          onChange={setPasswords}
          labels={{ password: pc.newPassword, confirm: pc.newPasswordConfirm }}
          autoFocus
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {m.cancel}
        </Button>
        <Button
          onClick={() => onSubmit(passwords.password, passwords.confirm)}
          disabled={!valid || pending}
          className="gap-2"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pc.save}
        </Button>
      </div>
    </Modal>
  )
}

function ForwardingSummary({
  forwarding,
  copy,
  domain,
}: {
  forwarding: MailForwarding | undefined
  copy: ForwardingCopy
  domain: string
}) {
  if (!forwarding || forwarding.state === 'none') return null

  if (forwarding.state === 'unreadable') {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0 text-accent" />
        {copy.unreadableTitle}
      </p>
    )
  }

  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span
          className={
            forwarding.active
              ? 'shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand'
              : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground'
          }
        >
          {forwarding.active ? copy.badgeOn : copy.badgeOff}
        </span>
        {forwarding.keepCopy && <span>{copy.keepsCopy}</span>}
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label={copy.forwardsTo}>
        {forwarding.destinations.map((dest) => (
          <li
            key={dest}
            className="flex max-w-full items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          >
            <span className="truncate">{dest}</span>
            {isExternalDestination(dest, domain) && (
              <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-medium uppercase tracking-wide text-brand">
                {copy.externalBadge}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ForwardingDialog({
  mailbox,
  forwarding,
  domain,
  internalAddresses,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  mailbox: Mailbox
  forwarding: MailForwarding | undefined
  domain: string
  internalAddresses: ReadonlySet<string>
  pending: boolean
  error: string | null
  onCancel: () => void
  onSubmit: (destinations: string[], keepCopy: boolean, overwriteUnreadable: boolean) => void
}) {
  const { t, lang } = useLanguage()
  const m = t.mail
  const fc = getForwardingCopy(lang)
  const current = forwarding?.state === 'forwarding' ? forwarding : null
  const unreadable = forwarding?.state === 'unreadable'

  const [destinations, setDestinations] = useState<string[]>(current?.destinations ?? [])
  const [keepCopy, setKeepCopy] = useState(current?.keepCopy ?? true)
  const [overwrite, setOverwrite] = useState(false)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)

  function check(list: string[]) {
    return validateForwardingDestinations({
      mailboxAddress: mailbox.address,
      domain,
      destinations: list,
      internalAddresses,
    })
  }

  function addAddress() {
    const address = normalizeDestinationAddress(input)
    if (!address) {
      setInputError(fc.invalidAddress)
      return
    }
    if (destinations.includes(address)) {
      setInput('')
      setInputError(null)
      return
    }
    const result = check([...destinations, address])
    if (!result.ok) {
      setInputError(
        {
          INVALID_DESTINATION: fc.unknownInternal,
          SELF_DESTINATION: fc.selfAddress,
          TOO_MANY_DESTINATIONS: fc.tooMany,
        }[result.code],
      )
      return
    }
    setDestinations((prev) => [...prev, address])
    setInput('')
    setInputError(null)
  }

  const needsOverwrite = unreadable && !overwrite
  const canSave = destinations.length > 0 && check(destinations).ok && !needsOverwrite

  return (
    <Modal onClose={onCancel}>
      <h3 className="font-display text-lg font-semibold">{fc.title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{mailbox.address}</p>
      <p className="mt-3 text-sm text-muted-foreground">{fc.body}</p>

      <div className="mt-4 flex flex-col gap-4">
        {unreadable && (
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm">
            <p className="font-medium">{fc.unreadableTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground">{fc.unreadableBody}</p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="size-4 accent-primary"
              />
              {fc.overwrite}
            </label>
          </div>
        )}

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">{fc.destinationsLabel}</legend>
          <span className="text-xs text-muted-foreground">{fc.destinationsHint}</span>
          {destinations.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">{fc.noDestinations}</p>
          ) : (
            <div className="mt-1 flex flex-col gap-1.5">
              {destinations.map((address) => (
                <div
                  key={address}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate">{address}</span>
                    {isExternalDestination(address, domain) && (
                      <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-medium uppercase tracking-wide text-brand">
                        {fc.externalBadge}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDestinations((prev) => prev.filter((a) => a !== address))}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`${fc.remove}: ${address}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="forward-address" className="text-sm font-medium">
            {fc.addLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="forward-address"
              type="email"
              inputMode="email"
              value={input}
              onChange={(e) => {
                setInput(e.target.value)
                setInputError(null)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                addAddress()
              }}
              placeholder={fc.addPlaceholder}
              aria-invalid={inputError ? true : undefined}
              aria-describedby={inputError ? 'forward-address-error' : undefined}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addAddress}
              disabled={input.trim() === '' || destinations.length >= MAX_ALIAS_DESTINATIONS}
            >
              {fc.add}
            </Button>
          </div>
          {inputError && (
            <p id="forward-address-error" role="alert" className="text-xs text-destructive">
              {inputError}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={keepCopy}
            onChange={(e) => setKeepCopy(e.target.checked)}
            className="mt-0.5 size-4 accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-medium">{fc.keepCopy}</span>
            <span className="text-xs text-muted-foreground">{fc.keepCopyHint}</span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {current || unreadable ? (
          <Button
            variant="ghost"
            onClick={() => {
              if (window.confirm(fc.turnOffConfirm)) onSubmit([], false, overwrite)
            }}
            disabled={pending || needsOverwrite}
            className="text-muted-foreground hover:text-destructive"
          >
            {fc.turnOff}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {m.cancel}
          </Button>
          <Button onClick={() => onSubmit(destinations, keepCopy, overwrite)} disabled={!canSave || pending} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {fc.save}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function AliasDialog({
  domain,
  mailboxes,
  aliasAddresses,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  domain: string
  mailboxes: Mailbox[]
  aliasAddresses: string[]
  pending: boolean
  error?: string | null
  onCancel: () => void
  onSubmit: (localPart: string, destinations: string[]) => void
}) {
  const { t, lang } = useLanguage()
  const m = t.mail
  const ac = getAliasCopy(lang)
  const [localPart, setLocalPart] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [externals, setExternals] = useState<string[]>([])
  const [externalInput, setExternalInput] = useState('')
  const [externalError, setExternalError] = useState<string | null>(null)

  const aliasAddress = `${localPart}@${domain}`
  const internalAddresses = useMemo(
    () => new Set([...mailboxes.map((b) => b.address), ...aliasAddresses].map((a) => a.toLowerCase())),
    [mailboxes, aliasAddresses],
  )

  function check(destinations: string[]) {
    return validateAliasDestinations({ aliasAddress, domain, destinations, internalAddresses })
  }

  const destinations = [...selected, ...externals]
  const localPartValid =
    /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) && !localPart.includes('..')
  const addressConflict: string | null = !localPartValid
    ? null
    : mailboxes.some((b) => b.address.toLowerCase() === aliasAddress)
      ? ac.warnMailboxAddress
      : aliasAddresses.some((a) => a.toLowerCase() === aliasAddress)
        ? ac.warnAliasAddress
        : null
  const valid = localPartValid && !addressConflict && check(destinations).ok

  function toggle(address: string) {
    setSelected((prev) =>
      prev.includes(address) ? prev.filter((a) => a !== address) : [...prev, address],
    )
  }

  function addExternal() {
    const address = normalizeDestinationAddress(externalInput)
    if (!address) {
      setExternalError(ac.invalidAddress)
      return
    }
    if (destinations.includes(address)) {
      setExternalInput('')
      setExternalError(null)
      return
    }
    const result = check([...destinations, address])
    if (!result.ok) {
      setExternalError(
        {
          INVALID_DESTINATION: ac.unknownInternal,
          SELF_DESTINATION: ac.selfAddress,
          TOO_MANY_DESTINATIONS: ac.tooMany,
        }[result.code],
      )
      return
    }
    setExternals((prev) => [...prev, address])
    setExternalInput('')
    setExternalError(null)
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
          {addressConflict && (
            <span role="alert" className="text-xs text-destructive">
              {addressConflict}
            </span>
          )}
        </label>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-medium">{m.destinations}</legend>
          <span className="text-xs text-muted-foreground">{ac.destinationsHint}</span>
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
            {externals.map((address) => (
              <div
                key={address}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{address}</span>
                  <span className="shrink-0 rounded bg-brand/15 px-1 text-[10px] font-medium uppercase tracking-wide text-brand">
                    {ac.externalBadge}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setExternals((prev) => prev.filter((a) => a !== address))}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  aria-label={`${ac.removeExternal}: ${address}`}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="alias-external" className="text-sm font-medium">
            {ac.externalLabel}
          </label>
          <div className="flex gap-2">
            <input
              id="alias-external"
              type="email"
              inputMode="email"
              value={externalInput}
              onChange={(e) => {
                setExternalInput(e.target.value)
                setExternalError(null)
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return
                e.preventDefault()
                addExternal()
              }}
              placeholder={ac.externalPlaceholder}
              aria-invalid={externalError ? true : undefined}
              aria-describedby={externalError ? 'alias-external-error' : undefined}
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="outline"
              onClick={addExternal}
              disabled={externalInput.trim() === '' || destinations.length >= MAX_ALIAS_DESTINATIONS}
            >
              {ac.add}
            </Button>
          </div>
          {externalError && (
            <p id="alias-external-error" role="alert" className="text-xs text-destructive">
              {externalError}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          {m.cancel}
        </Button>
        <Button
          onClick={() => onSubmit(localPart, destinations)}
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
