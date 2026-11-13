'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Panel } from '@/components/admin/admin-ui'
import {
  handoverProjectAction,
  previewProjectHandoverAction,
  type ProjectHandoverPreview,
} from '@/lib/project-handover/actions'
import { MIN_REASON_LENGTH } from '@/lib/project-handover/input'

const FIELD =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

const dateFmt = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })

export function ProjectHandoverClient({
  projectId,
  initialPreview = null,
  initialError = null,
}: {
  projectId: string
  initialPreview?: ProjectHandoverPreview | null
  initialError?: string | null
}) {
  const [toEmail, setToEmail] = useState('')
  const [preview, setPreview] = useState<ProjectHandoverPreview | null>(initialPreview)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    initialError ? { tone: 'error', text: initialError } : null,
  )
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)
  const [forceQuota, setForceQuota] = useState(false)
  const [pending, startTransition] = useTransition()

  const load = () =>
    startTransition(async () => {
      setMessage(null)
      const res = await previewProjectHandoverAction({ projectId, toEmail })
      if (!res.ok) {
        setPreview(null)
        setMessage({ tone: 'error', text: res.error })
        return
      }
      setPreview(res.data)
      setAck(false)
      setForceQuota(false)
    })

  const submit = () => {
    if (!preview) return
    startTransition(async () => {
      setMessage(null)
      const res = await handoverProjectAction({
        projectId: preview.projectId,
        fromUserId: preview.fromUserId,
        toEmail,
        reason,
        idempotencyKey: preview.idempotencyKey,
        ack,
        forceQuota,
      })
      if (!res.ok) return setMessage({ tone: 'error', text: res.error })
      setMessage({
        tone: 'ok',
        text: res.data.noticesSent
          ? 'Site devredildi; her iki tarafa bilgilendirme e-postası gönderildi.'
          : 'Site devredildi, ancak bilgilendirme e-postalarından en az biri gönderilemedi.',
      })
      setReason('')
      setAck(false)
      const refreshed = await previewProjectHandoverAction({ projectId, toEmail: '' })
      if (refreshed.ok) setPreview(refreshed.data)
    })
  }

  const needsForce = Boolean(preview?.warnings.some((w) => w.code === 'quota_exceeded'))
  const canSubmit =
    Boolean(preview?.canHandover) &&
    preview?.target.found === true &&
    reason.trim().length >= MIN_REASON_LENGTH &&
    ack &&
    (!needsForce || forceQuota) &&
    !pending

  return (
    <div className="space-y-6">
      <Panel title="1. Hedef kullanıcı">
        <div className="flex flex-wrap items-end gap-3 p-4">
          <label className="min-w-64 flex-1 space-y-1.5 text-sm">
            <span className="text-muted-foreground">Hedef kullanıcı e-postası (tam eşleşme)</span>
            <input
              className={FIELD}
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              placeholder="kullanici@ornek.com"
            />
          </label>
          <Button onClick={load} disabled={pending || !toEmail.trim()}>
            Özeti getir
          </Button>
        </div>
      </Panel>

      {message ? (
        <p
          role="status"
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.tone === 'ok' ? 'border-emerald-500/40 text-emerald-500' : 'border-destructive/40 text-destructive'
          }`}
        >
          {message.text}
        </p>
      ) : null}

      {preview ? (
        <>
          <Panel title="2. Site ve etkisi">
            <div className="space-y-3 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Site:</span> {preview.name}{' '}
                <span className="text-xs text-muted-foreground">
                  ({preview.type === 'ecommerce' ? 'mağaza' : 'kurumsal'}, {preview.published ? 'yayında' : 'taslak'})
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Mevcut sahip:</span> {preview.ownerMasked}
                {preview.target.found ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground">→ hedef:</span> {preview.target.masked}{' '}
                    <span className="text-xs text-muted-foreground">
                      (paket {preview.target.planCode}, {preview.target.publishedCount}/{preview.target.siteLimit} yayın)
                    </span>
                  </>
                ) : null}
              </p>
              <p className="text-muted-foreground">
                {preview.counts.products} ürün, {preview.counts.orders} sipariş siteyle birlikte taşınır.
                {preview.entitlements.length ? ` Hak: ${preview.entitlements.map((e) => e.name).join(', ')}.` : ''}
              </p>
              {preview.domains.length ? (
                <p className="text-muted-foreground">
                  Bağlı alan adı: {preview.domains.map((d) => d.domain).join(', ')}
                </p>
              ) : null}

              {preview.blockers.length ? (
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {preview.blockers.map((b) => (
                    <li key={b.code}>{b.label}</li>
                  ))}
                </ul>
              ) : null}
              {preview.warnings.length ? (
                <ul className="list-disc space-y-1 pl-5 text-amber-500">
                  {preview.warnings.map((w) => (
                    <li key={w.code}>{w.label}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Panel>

          <Panel title="3. Onay">
            <div className="space-y-4 p-4 text-sm">
              <label className="block space-y-1.5">
                <span className="text-muted-foreground">Devir nedeni (en az {MIN_REASON_LENGTH} karakter)</span>
                <textarea
                  className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {needsForce ? (
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={forceQuota} onChange={(e) => setForceQuota(e.target.checked)} />
                  <span>Hedef hesabın site hakkı aşılsa da devret.</span>
                </label>
              ) : null}
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                <span>
                  Sitenin, ürün/sipariş verilerinin ve site hak kayıtlarının {preview.target.masked ?? 'hedef hesaba'} geçeceğini,
                  eski sahibin erişimini kaybedeceğini onaylıyorum.
                </span>
              </label>
              <Button onClick={submit} disabled={!canSubmit}>
                Siteyi devret
              </Button>
            </div>
          </Panel>

          <Panel title="Devir geçmişi">
            {preview.events.length ? (
              <ul className="divide-y divide-border text-sm">
                {preview.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                    <span>
                      {e.event} <span className="text-muted-foreground">— {e.actorEmail}</span>
                      {e.reason ? <span className="text-muted-foreground">: {e.reason}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{dateFmt.format(new Date(e.createdAt))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Kayıt yok.</p>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  )
}
