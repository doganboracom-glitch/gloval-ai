'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe, Loader2, Mail, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import {
  DomainModal,
  DomainShell,
  DomainStatusBadge,
  fill,
} from '@/components/domains/domain-chrome'
import { DnsRecords } from '@/components/domains/dns-records'
import { DnsGuide } from '@/components/domains/dns-guide'
import { TransferOutPanel } from '@/components/domains/transfer-out-panel'
import { RegistrarManagePanel } from '@/components/domains/registrar-manage-panel'
import {
  bindMyDomainWebsite,
  removeMyDomain,
  startMyDomainVerification,
  verifyMyDomain,
  verifyMyEmailDns,
  type DomainDetail,
} from '@/lib/custom-domains/actions'
import { ConnectionStatus } from '@/components/domains/connection-status'
import { getRecheckCopy } from '@/components/domains/recheck-copy'
import { isDomainLive, isDomainUsable, type DomainErrorCode } from '@/lib/custom-domains/types'

/**
 * Detail view for a single custom domain.
 *
 * Layout follows the requested order: DNS/verification first (it blocks
 * everything else), then the two products that consume the domain — website
 * and email. The email section is the hand-off into the mail module rather
 * than a second mailbox UI.
 */
export function DomainDetailClient({
  detail,
  userEmail,
  publishableProjects,
}: {
  detail: DomainDetail
  userEmail: string
  publishableProjects: { id: string; name: string; slug: string }[]
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const d = t.domains
  const { domain, live, website, email } = detail

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState(website.projectId ?? '')

  const [action, setAction] = useState<'start' | 'check' | 'email' | 'recheck' | null>(null)
  const [recheckError, setRecheckError] = useState<string | null>(null)
  const [emailDnsNotice, setEmailDnsNotice] = useState<string | null>(null)

  const usable = isDomainUsable(domain)
  // An external domain the customer has not started verifying yet: no technical
  // DNS details are shown until they press "Doğrulamayı Başlat".
  const notStarted = domain.source === 'external' && domain.status === 'pending'
  const failedCheck = !usable && domain.status === 'failed'

  const errorText = (code: DomainErrorCode): string => {
    switch (code) {
      case 'DNS_VERIFICATION_UNAVAILABLE':
        return d.errVerifyNotFound
      case 'TEMPORARY_FAILURE':
        return d.errVerifyTemporary
      case 'NOT_ENTITLED':
        return d.errNotEntitled
      case 'DOMAIN_NOT_VERIFIED':
        return d.errDomainNotVerified
      case 'PROJECT_NOT_PUBLISHED':
        return d.errProjectNotPublished
      case 'FORBIDDEN':
        return d.errGeneric
      default:
        return d.errGeneric
    }
  }

  function handleBindWebsite(projectId: string) {
    setError(null)
    setSelectedProjectId(projectId)
    startTransition(async () => {
      const result = await bindMyDomainWebsite(domain.id, projectId || null)
      if (!result.ok) {
        setError(errorText(result.error))
        setSelectedProjectId(website.projectId ?? '')
        return
      }
      router.refresh()
    })
  }

  function handleStart() {
    setError(null)
    setAction('start')
    startTransition(async () => {
      const result = await startMyDomainVerification(domain.id)
      if (!result.ok) setError(errorText(result.error))
      else router.refresh()
      setAction(null)
    })
  }

  function handleVerify() {
    setError(null)
    setAction('check')
    startTransition(async () => {
      const result = await verifyMyDomain(domain.id)
      if (!result.ok) {
        setError(errorText(result.error))
        // A failed lookup is persisted as "failed"; refresh so the badge and card reflect it.
        router.refresh()
      } else {
        router.refresh()
      }
      setAction(null)
    })
  }

  function handleRecheck() {
    if (isPending) return
    setRecheckError(null)
    setAction('recheck')
    startTransition(async () => {
      try {
        const result = await verifyMyDomain(domain.id)
        if (!result.ok) setRecheckError(getRecheckCopy(lang).error)
      } catch {
        setRecheckError(getRecheckCopy(lang).error)
      }
      // Refresh on every outcome so the card and "Son kontrol" time reflect what was persisted.
      router.refresh()
      setAction(null)
    })
  }

  function handleVerifyEmailDns() {
    setError(null)
    setEmailDnsNotice(null)
    setAction('email')
    startTransition(async () => {
      const result = await verifyMyEmailDns(domain.id)
      if (!result.ok) {
        setError(errorText(result.error))
      } else {
        setEmailDnsNotice(
          result.data.status === 'verified'
            ? d.emailDnsVerified
            : result.data.status === 'not_issued'
              ? d.emailDnsNotIssued
              : d.emailDnsIncomplete,
        )
        router.refresh()
      }
      setAction(null)
    })
  }

  function handleRemove() {
    setError(null)
    startTransition(async () => {
      const result = await removeMyDomain(domain.id)
      if (!result.ok) {
        setError(errorText(result.error))
        setConfirmRemove(false)
        return
      }
      router.push('/dashboard/domains')
    })
  }

  const verifiedLine =
    domain.verifiedAt && usable
      ? fill(d.verifiedAt, {
          date: new Date(domain.verifiedAt).toLocaleDateString(),
        })
      : null

  return (
    <DomainShell
      userEmail={userEmail}
      backHref="/dashboard/domains"
      backLabel={d.backToDomains}
      title={<span className="font-mono">{domain.domain}</span>}
      icon={<Globe className="size-7 shrink-0 text-accent" />}
      error={error}
      onDismissError={() => setError(null)}
      notice={live ? null : d.mockNotice}
    >
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <DomainStatusBadge status={domain.status} />
        {domain.isPrimary && (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            {d.primary}
          </span>
        )}
        {verifiedLine && <span className="text-sm text-muted-foreground">{verifiedLine}</span>}
      </div>

      {/* Verification — gates both products, so it leads. */}
      <section className="mt-8">
        {!usable && (
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-semibold">
                  {notStarted
                    ? d.verifyIntroTitle
                    : failedCheck
                      ? d.verifyFailedTitle
                      : d.verificationRequiredTitle}
                </h2>
                <p className="mt-1 text-pretty text-sm text-muted-foreground">
                  {notStarted
                    ? d.verifyIntroBody
                    : failedCheck
                      ? d.verifyFailedBody
                      : d.verificationRequiredBody}
                </p>
              </div>
            </div>
            <div className="mt-4">
              {notStarted ? (
                <Button onClick={handleStart} disabled={isPending}>
                  {isPending && action === 'start' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Play className="size-4" />
                  )}
                  {isPending && action === 'start' ? d.verifyStarting : d.verifyStart}
                </Button>
              ) : (
                <Button onClick={handleVerify} disabled={isPending}>
                  {isPending && action === 'check' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {isPending && action === 'check'
                    ? d.verifyChecking
                    : failedCheck
                      ? d.verifyRetry
                      : d.verify}
                </Button>
              )}
            </div>
          </div>
        )}

        {usable && (
          <div className="mt-4">
            <ConnectionStatus
              domain={domain}
              live={isDomainLive(domain)}
              checking={isPending}
              onRecheck={handleRecheck}
              rechecking={isPending && action === 'recheck'}
              recheckError={recheckError}
            />
          </div>
        )}

        {!notStarted && (
          <>
            <div className="mt-4">
              <DnsRecords records={domain.dns} />
            </div>
            <div className="mt-4">
              <DnsGuide domain={domain} />
            </div>
          </>
        )}
      </section>

      {/* The two consumers of a verified domain. */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Globe className="size-4 text-muted-foreground" />
            {d.websiteTitle}
          </h2>

          {!usable ? (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">
              {d.websiteNeedsVerification}
            </p>
          ) : (
            <>
              {website.projectName && (
                <div className="mt-3">
                  <p className="truncate text-sm font-medium">{website.projectName}</p>
                  <span className="mt-1 inline-block text-xs text-accent">{d.websiteLive}</span>
                </div>
              )}

              {publishableProjects.length === 0 ? (
                <p className="mt-3 text-pretty text-sm text-muted-foreground">
                  {website.projectName ? d.websiteNoOtherSites : d.websiteEmpty}
                </p>
              ) : (
                <div className="mt-3">
                  <label htmlFor="website-project" className="text-xs text-muted-foreground">
                    {d.websiteSelectLabel}
                  </label>
                  <select
                    id="website-project"
                    value={selectedProjectId}
                    disabled={isPending}
                    onChange={(e) => handleBindWebsite(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
                  >
                    <option value="">{d.websiteSelectNone}</option>
                    {publishableProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Mail className="size-4 text-muted-foreground" />
            {d.emailTitle}
          </h2>

          {!email.entitled ? (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">{d.emailNotEntitled}</p>
          ) : !usable ? (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">
              {d.emailNeedsVerification}
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                {email.mailboxCount === 0
                  ? d.emailEmpty
                  : fill(d.emailMailboxCount, {
                      count: email.mailboxCount,
                      max: email.maxMailboxes,
                    })}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <LinkButton href="/dashboard/email" variant="secondary" size="sm">
                  {d.emailManage}
                </LinkButton>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleVerifyEmailDns}
                  disabled={isPending}
                >
                  {isPending && action === 'email' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {d.emailDnsVerify}
                </Button>
              </div>
              {emailDnsNotice && (
                <p role="status" className="mt-3 text-pretty text-sm text-muted-foreground">
                  {emailDnsNotice}
                </p>
              )}
            </>
          )}
        </section>
      </div>

      <div className="mt-10 border-t border-border pt-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmRemove(true)}
          disabled={isPending}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          {d.remove}
        </Button>
      </div>

      {confirmRemove && (
        <DomainModal onClose={() => setConfirmRemove(false)}>
          <h2 className="font-display text-lg font-semibold">{d.removeConfirm}</h2>
          <p className="mt-2 text-pretty text-sm text-muted-foreground">
            {fill(d.removeBody, { domain: domain.domain })}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={isPending}>
              {d.cancel}
            </Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {d.removeCta}
            </Button>
          </div>
        </DomainModal>
      )}
      {domain.source === 'registrar' && <RegistrarManagePanel domain={domain.domain} />}
      <TransferOutPanel domain={domain.domain} />
    </DomainShell>
  )
}
