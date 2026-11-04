'use client'

import { useState, useTransition, type FormEvent, type KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { Panel } from '@/components/admin/admin-ui'
import { Button } from '@/components/ui/button'
import { adminT } from '@/lib/admin/i18n'
import type { PendingAdminDomainImport, RegistrarImportPreview } from '@/lib/custom-domains/registrar/admin-import-types'
import {
  approveRegistrarDomainImportAction,
  previewRegistrarDomainImportAction,
  rejectRegistrarDomainImportAction,
  requestRegistrarDomainImportAction,
} from '@/lib/custom-domains/registrar/admin-import-actions'

function formatDate(value: string, lang: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function AdminDomainImportPanel({
  pendingImports,
  queueReady,
}: {
  pendingImports: PendingAdminDomainImport[]
  queueReady: boolean
}) {
  const { lang } = useLanguage()
  const t = adminT(lang).domains
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formOpen, setFormOpen] = useState(false)
  const [domain, setDomain] = useState('')
  const [targetEmail, setTargetEmail] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<RegistrarImportPreview | null>(null)
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const errorText = (code: string) =>
    (t.importErrors as Record<string, string>)[code] ?? t.importErrors.unavailable

  function handleFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
      event.preventDefault()
    }
  }

  function previewDomain() {
    setStatusMessage(null)
    startTransition(async () => {
      try {
        const result = await previewRegistrarDomainImportAction(domain)
        if (!result.ok) {
          setPreview(null)
          setStatusMessage({ kind: 'error', text: errorText(result.error) })
          return
        }
        setDomain(result.preview.domain)
        setPreview(result.preview)
      } catch {
        setPreview(null)
        setStatusMessage({ kind: 'error', text: errorText('unavailable') })
      }
    })
  }

  function importDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!preview || !queueReady) return

    setStatusMessage(null)
    const key = idempotencyKey ?? crypto.randomUUID()
    setIdempotencyKey(key)
    startTransition(async () => {
      try {
        const result = await requestRegistrarDomainImportAction({
          domain: preview.domain,
          targetEmail,
          reason,
          idempotencyKey: key,
        })
        if (!result.ok) {
          setStatusMessage({ kind: 'error', text: errorText(result.error) })
          return
        }
        setStatusMessage({
          kind: 'success',
          text: result.status === 'pending_approval' ? t.importAwaitingApproval : t.importSuccess,
        })
        router.refresh()
      } catch {
        setStatusMessage({ kind: 'error', text: errorText('unavailable') })
      }
    })
  }

  function approve(requestId: string) {
    setStatusMessage(null)
    startTransition(async () => {
      try {
        const result = await approveRegistrarDomainImportAction(requestId)
        if (!result.ok) {
          setStatusMessage({ kind: 'error', text: errorText(result.error) })
          return
        }
        setStatusMessage({ kind: 'success', text: t.importSuccess })
        router.refresh()
      } catch {
        setStatusMessage({ kind: 'error', text: errorText('unavailable') })
      }
    })
  }

  function reject(event: FormEvent<HTMLFormElement>, requestId: string) {
    event.preventDefault()
    setStatusMessage(null)
    startTransition(async () => {
      try {
        const result = await rejectRegistrarDomainImportAction({ requestId, note: rejectNote })
        if (!result.ok) {
          setStatusMessage({ kind: 'error', text: errorText(result.error) })
          return
        }
        setStatusMessage({ kind: 'success', text: t.importRejected })
        setRejectingId(null)
        setRejectNote('')
        router.refresh()
      } catch {
        setStatusMessage({ kind: 'error', text: errorText('unavailable') })
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel title={t.importQueueTitle}>
        <div className="flex flex-col gap-4 p-4">
          {!queueReady ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t.importQueueUnavailable}
            </p>
          ) : pendingImports.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.importPendingEmpty}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {pendingImports.map((item) => (
                <li key={item.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-1 text-sm">
                      <strong className="font-medium text-foreground">{item.domain}</strong>
                      <span className="text-muted-foreground">{t.importTarget}: {item.targetEmail}</span>
                      <span className="text-muted-foreground">{t.importRequestedBy}: {item.requestedByEmail}</span>
                    </div>
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      <span>{t.importRequestedAt}: {formatDate(item.createdAt, lang)}</span>
                      <span>{t.importExpiresAt}: {formatDate(item.expiresAt, lang)}</span>
                      <span>{t.importNameservers}: {item.nameservers.length ? item.nameservers.join(', ') : '—'}</span>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{item.reason}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={() => approve(item.id)} disabled={isPending || !queueReady}>
                      {t.importApprove}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRejectingId(rejectingId === item.id ? null : item.id)
                        setRejectNote('')
                      }}
                      disabled={isPending}
                    >
                      {t.importReject}
                    </Button>
                  </div>
                  {rejectingId === item.id && (
                    <form onSubmit={(event) => reject(event, item.id)} className="flex flex-col gap-2">
                      <label htmlFor={`reject-note-${item.id}`} className="text-sm font-medium">
                        {t.importRejectNote}
                      </label>
                      <textarea
                        id={`reject-note-${item.id}`}
                        value={rejectNote}
                        onChange={(event) => setRejectNote(event.target.value)}
                        required
                        minLength={3}
                        maxLength={1000}
                        rows={2}
                        className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      />
                      <div>
                        <Button type="submit" size="sm" variant="destructive" disabled={isPending || rejectNote.trim().length < 3}>
                          {t.importRejectConfirm}
                        </Button>
                      </div>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>

      <Panel title={t.importTitle}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-sm text-muted-foreground">{t.importDescription}</p>
          <p className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t.importReadOnlyNote}
          </p>
          {!formOpen ? (
            <div>
              <Button type="button" variant="outline" onClick={() => setFormOpen(true)}>
                {t.importOpen}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label htmlFor="admin-import-domain" className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium">
                  {t.importDomainLabel}
                  <input
                    id="admin-import-domain"
                    type="text"
                    value={domain}
                    onChange={(event) => {
                      setDomain(event.target.value)
                      setPreview(null)
                      setIdempotencyKey(null)
                      setStatusMessage(null)
                    }}
                    autoComplete="off"
                    maxLength={253}
                    className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                  />
                </label>
                <Button type="button" variant="outline" onClick={previewDomain} disabled={isPending || !queueReady || !domain.trim()}>
                  {isPending ? t.importChecking : t.importCheck}
                </Button>
              </div>

              {preview && (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium text-foreground">{t.importVerified}</p>
                  <p className="text-muted-foreground">{t.importExpiresAt}: {formatDate(preview.expiresAt, lang)}</p>
                  {preview.expiresAtSource === 'assumed_istanbul' && (
                    <p className="text-xs text-muted-foreground">{t.importExpiresAtAssumed}</p>
                  )}
                  <p className="text-muted-foreground">
                    {t.importNameservers}: {preview.nameservers.length ? preview.nameservers.join(', ') : '—'}
                  </p>
                  <form onSubmit={importDomain} onKeyDown={handleFormKeyDown} className="mt-2 flex flex-col gap-4">
                    <label htmlFor="admin-import-target-email" className="flex flex-col gap-1.5 text-sm font-medium">
                      {t.importTargetEmailLabel}
                      <input
                        id="admin-import-target-email"
                        type="email"
                        value={targetEmail}
                        onChange={(event) => {
                          setTargetEmail(event.target.value)
                          setIdempotencyKey(null)
                          setStatusMessage(null)
                        }}
                        required
                        maxLength={254}
                        autoComplete="email"
                        className="h-10 rounded-lg border border-border bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      />
                    </label>
                    <label htmlFor="admin-import-reason" className="flex flex-col gap-1.5 text-sm font-medium">
                      {t.importReasonLabel}
                      <textarea
                        id="admin-import-reason"
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value)
                          setIdempotencyKey(null)
                          setStatusMessage(null)
                        }}
                        required
                        minLength={3}
                        maxLength={1000}
                        rows={2}
                        className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                      />
                      <span className="text-xs font-normal text-muted-foreground">{t.importReasonHint}</span>
                    </label>
                    <div>
                      <Button type="submit" disabled={isPending || !queueReady || reason.trim().length < 3 || !targetEmail.trim()}>
                        {isPending ? t.importSubmitting : t.importSubmit}
                      </Button>
                    </div>
                  </form>
                </div>
              )}
              <div>
                <Button type="button" size="sm" variant="ghost" onClick={() => setFormOpen(false)} disabled={isPending}>
                  {t.importClose}
                </Button>
              </div>
            </div>
          )}
          {statusMessage && (
            <p
              role={statusMessage.kind === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={statusMessage.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-brand'}
            >
              {statusMessage.text}
            </p>
          )}
        </div>
      </Panel>
    </div>
  )
}
