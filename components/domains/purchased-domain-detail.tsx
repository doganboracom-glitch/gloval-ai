'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Globe, Loader2, Mail, RefreshCw } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import { DomainShell, fill } from '@/components/domains/domain-chrome'
import { ConnectionStatus } from '@/components/domains/connection-status'
import { TransferOutPanel } from '@/components/domains/transfer-out-panel'
import { RegistrarManagePanel } from '@/components/domains/registrar-manage-panel'
import {
  syncMyDomainToProject,
  type ConnectableProject,
  type DomainDetail,
} from '@/lib/custom-domains/actions'
import { isDomainLive, type DomainErrorCode } from '@/lib/custom-domains/types'

/**
 * Detail view for a domain bought through GLOVAL.
 *
 * Ownership is already proven by the registration itself, so none of the
 * TXT-verification / manual DNS steps used for external domains are shown.
 * The only connection step is the one-click "sync to project".
 */
export function PurchasedDomainDetail({
  detail,
  userEmail,
  projects,
}: {
  detail: DomainDetail
  userEmail: string
  projects: ConnectableProject[]
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const d = t.domains
  const { domain, live, website, email } = detail

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const publishedProjects = projects.filter((p) => p.published)
  const [projectId, setProjectId] = useState(
    website.projectId && publishedProjects.some((p) => p.id === website.projectId)
      ? website.projectId
      : (publishedProjects[0]?.id ?? ''),
  )
  const connected = Boolean(website.projectId)

  const errorText = (code: DomainErrorCode): string => {
    switch (code) {
      case 'SYNC_FAILED':
        return d.errSyncFailed
      case 'PROJECT_NOT_PUBLISHED':
        return d.errProjectNotPublished
      case 'DOMAIN_NOT_VERIFIED':
        return d.errDomainNotVerified
      default:
        return d.errGeneric
    }
  }

  function handleSync() {
    if (!projectId) return
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const res = await syncMyDomainToProject(domain.id, projectId)
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setSuccess(d.pdSynced)
      router.refresh()
    })
  }

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
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
          <CheckCircle2 className="size-3.5" />
          {d.statusRegistered}
        </span>
        {domain.isPrimary && (
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2.5 py-0.5 text-xs font-medium text-accent">
            {d.primary}
          </span>
        )}
        <span className="text-sm text-muted-foreground">{d.pdRegisteredLine}</span>
      </div>

      {success && (
        <p role="status" className="mt-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          {success}
        </p>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Globe className="size-4 text-muted-foreground" />
            {d.pdProjectLabel}
          </h2>

          {connected ? (
            <div className="mt-3">
              <p className="truncate text-sm font-medium">{website.projectName ?? domain.domain}</p>
              <span className="mt-1 inline-block text-xs text-accent">{d.pdConnected}</span>
            </div>
          ) : (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">{d.pdNoProject}</p>
          )}

          <h3 className="mt-5 text-sm font-medium">{d.pdSyncTitle}</h3>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">{d.pdSyncBody}</p>

          {publishedProjects.length === 0 ? (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">{d.pdSyncNoPublished}</p>
          ) : (
            <div className="mt-3">
              <label htmlFor="sync-project" className="text-xs text-muted-foreground">
                {d.pdSyncSelect}
              </label>
              <select
                id="sync-project"
                value={projectId}
                disabled={isPending}
                onChange={(e) => setProjectId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.published}>
                    {p.published ? p.name : `${p.name} (${d.pdSyncDraft})`}
                  </option>
                ))}
              </select>
              <Button className="mt-3 gap-2" size="sm" onClick={handleSync} disabled={isPending || !projectId}>
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {isPending ? d.pdSyncing : connected ? d.pdResyncCta : d.pdSyncCta}
              </Button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Mail className="size-4 text-muted-foreground" />
            {d.emailTitle}
          </h2>
          {!email.entitled ? (
            <p className="mt-3 text-pretty text-sm text-muted-foreground">{d.emailNotEntitled}</p>
          ) : (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                {email.mailboxCount === 0
                  ? d.emailEmpty
                  : fill(d.emailMailboxCount, { count: email.mailboxCount, max: email.maxMailboxes })}
              </p>
              <div className="mt-4">
                <LinkButton href="/dashboard/email" variant="secondary" size="sm">
                  {d.emailManage}
                </LinkButton>
              </div>
            </>
          )}
        </section>
      </div>

      {connected && (
        <div className="mt-6">
          <ConnectionStatus domain={domain} live={isDomainLive(domain)} checking={isPending} />
        </div>
      )}

      <RegistrarManagePanel domain={domain.domain} />
      <TransferOutPanel domain={domain.domain} />
    </DomainShell>
  )
}
