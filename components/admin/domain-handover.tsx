'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Panel, DataTable, Th, Td, Tr } from '@/components/admin/admin-ui'
import {
  handoverAction,
  previewHandoverAction,
  recheckMailboxesAction,
  releaseAction,
  requestReleaseAction,
  type HandoverPreview,
} from '@/lib/custom-domains/handover/actions'
import { isHandoverSubmitEnabled, WAIVER_LABEL } from '@/lib/custom-domains/handover/input'

const FIELD =
  'h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50'

function Check({ ok }: { ok: boolean | null }) {
  const label = ok === null ? 'Bilinmiyor' : ok ? 'Tamam' : 'Sorunlu'
  const tone = ok === null ? 'text-muted-foreground' : ok ? 'text-emerald-500' : 'text-destructive'
  return <span className={`text-xs font-medium ${tone}`}>{label}</span>
}

export function HandoverClient({
  initialDomain = '',
  initialPreview = null,
  initialError = null,
}: {
  initialDomain?: string
  initialPreview?: HandoverPreview | null
  initialError?: string | null
} = {}) {
  const [domain, setDomain] = useState(initialDomain)
  const [toEmail, setToEmail] = useState('')
  const [preview, setPreview] = useState<HandoverPreview | null>(initialPreview)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(
    initialError ? { tone: 'error', text: initialError } : null,
  )
  const [pending, startTransition] = useTransition()

  const [reason, setReason] = useState('')
  const [waiver, setWaiver] = useState(false)
  const [ticket, setTicket] = useState('')
  const [confirmDomain, setConfirmDomain] = useState('')
  const [mailboxUnknownAck, setMailboxUnknownAck] = useState(false)

  const load = () =>
    startTransition(async () => {
      setMessage(null)
      const res = await previewHandoverAction({ domain, toEmail })
      if (!res.ok) {
        setPreview(null)
        setMessage({ tone: 'error', text: res.error })
        return
      }
      setPreview(res.data)
      setWaiver(false)
      setTicket('')
      setReason('')
      setConfirmDomain('')
      setMailboxUnknownAck(false)
    })

  const submit = () => {
    if (!preview) return
    startTransition(async () => {
      const res = await handoverAction({
        domain: preview.domain,
        toEmail: preview.target?.email ?? toEmail,
        reason,
        giverWaiverConfirmed: waiver,
        giverWaiverTicket: ticket,
        confirmDomain,
        idempotencyKey: preview.idempotencyKey,
        mailboxCountUnknownAck: mailboxUnknownAck,
      })
      if (!res.ok) return setMessage({ tone: 'error', text: res.error })
      setMessage({ tone: 'ok', text: 'Devir tamamlandı. E-posta hizmeti karantinaya alındı; bilgilendirme e-postaları gönderildi.' })
      const refreshed = await previewHandoverAction({ domain: preview.domain, toEmail: '' })
      if (refreshed.ok) setPreview(refreshed.data)
    })
  }

  const enabled = preview
    ? isHandoverSubmitEnabled({
        canHandover: preview.canHandover,
        waiver,
        ticket,
        reason,
        confirmDomain,
        domain: preview.domain,
        mailboxUnknown: preview.mailboxCount === null,
        mailboxUnknownAck,
        pending,
      })
    : false

  return (
    <div className="space-y-6">
      <Panel title="1. Alan adı ve hedef kullanıcı">
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Alan adı</span>
            <input className={FIELD} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ornek.com" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">Hedef kullanıcı e-postası (tam eşleşme)</span>
            <input className={FIELD} value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="kullanici@ornek.com" />
          </label>
          <div className="sm:col-span-2">
            <Button onClick={load} disabled={pending || !domain.trim()}>
              Özeti getir
            </Button>
          </div>
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
          <Panel title="2. Ön koşullar">
            <div className="space-y-2 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Mevcut sahip:</span> {preview.ownerMasked}
                {preview.target ? (
                  <>
                    {' '}
                    <span className="text-muted-foreground">→ hedef:</span> {preview.target.masked}
                  </>
                ) : null}
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {preview.checks.map((c) => (
                  <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span>
                      {c.label}
                      {c.detail ? <span className="ml-2 text-xs text-muted-foreground">{c.detail}</span> : null}
                    </span>
                    <Check ok={c.ok} />
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>Mailcow kutu sayısı</span>
                  <span className="text-xs">{preview.mailboxCount ?? 'bilinmiyor'}</span>
                </li>
              </ul>
              <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-medium text-foreground">Değişecekler</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  <li>Sahip: {preview.ownerMasked} → {preview.target?.masked ?? 'hedef seçilmedi'}</li>
                  <li>Bağlı site: {preview.hasSite ? 'bağlantı kaldırılacak' : 'zaten bağlı değil'}</li>
                  <li>Primary: {preview.isPrimary ? 'eski sahipte en eski alan adı primary olacak' : 'değişmez'}</li>
                  <li>E-posta: kapanır, kota varsayılana döner, karantina başlar</li>
                  <li>Registrant/WHOIS ve barındırma (Vercel) bu adımda değişmez</li>
                </ul>
              </div>
            </div>
          </Panel>

          {preview.held ? (
            <ReleasePanel preview={preview} onChanged={load} />
          ) : (
            <Panel title="3. Onay ve devir">
              <div className="space-y-4 p-4 text-sm">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    checked={waiver}
                    onChange={(e) => setWaiver(e.target.checked)}
                  />
                  <span>{WAIVER_LABEL}</span>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-muted-foreground">Destek talebi no</span>
                  <input className={FIELD} value={ticket} onChange={(e) => setTicket(e.target.value)} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-muted-foreground">Gerekçe (en az 10 karakter)</span>
                  <textarea
                    className={`${FIELD} h-24 py-2`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                {preview.mailboxCount === null ? (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={mailboxUnknownAck}
                      onChange={(e) => setMailboxUnknownAck(e.target.checked)}
                    />
                    <span>Kutu sayısı bilinmiyor, yine de devam ediyorum.</span>
                  </label>
                ) : null}
                <label className="block space-y-1.5">
                  <span className="text-muted-foreground">Onay için alan adını yazın: {preview.domain}</span>
                  <input className={FIELD} value={confirmDomain} onChange={(e) => setConfirmDomain(e.target.value)} />
                </label>
                <Button variant="destructive" onClick={submit} disabled={!enabled}>
                  Alan adını devret
                </Button>
              </div>
            </Panel>
          )}

          <Panel title="Geçmiş">
            <DataTable
              isEmpty={preview.events.length === 0}
              empty="Kayıt yok."
              head={<><Th>Olay</Th><Th>Admin</Th><Th>Gerekçe / not</Th><Th>Tarih</Th></>}
            >
              {preview.events.map((e) => (
                <Tr key={e.id}>
                  <Td>{e.event}{e.releaseMode ? ` (${e.releaseMode})` : ''}</Td>
                  <Td>{e.actorEmail}</Td>
                  <Td>{e.consentNote ?? e.reason ?? '—'}</Td>
                  <Td>{new Date(e.createdAt).toLocaleString('tr-TR')}</Td>
                </Tr>
              ))}
            </DataTable>
          </Panel>
        </>
      ) : null}
    </div>
  )
}

function ReleasePanel({ preview, onChanged }: { preview: HandoverPreview; onChanged: () => void }) {
  const [mode, setMode] = useState<'empty_handover' | 'keep_mailboxes_with_consent'>('empty_handover')
  const [note, setNote] = useState('')
  const [confirmDomain, setConfirmDomain] = useState('')
  const [ack, setAck] = useState(false)
  const [count, setCount] = useState<number | null>(preview.mailboxCount)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [key] = useState(() => crypto.randomUUID())

  const recheck = () =>
    startTransition(async () => {
      const res = await recheckMailboxesAction(preview.domain)
      if (res.ok) setCount(res.data.count)
      else setMsg(res.error)
    })

  const payload = { domain: preview.domain, mode, consentNote: note, confirmDomain, ack, idempotencyKey: key }
  const baseReady =
    ack && confirmDomain.trim().toLowerCase() === preview.domain && (mode === 'empty_handover' ? count === 0 : note.trim().length >= 10)

  const run = (fn: typeof releaseAction, done: string) =>
    startTransition(async () => {
      const res = await fn(payload)
      setMsg(res.ok ? done : res.error)
      if (res.ok) onChanged()
    })

  return (
    <Panel title="3. E-posta karantinasını kaldır">
      <div className="space-y-4 p-4 text-sm">
        <fieldset className="space-y-2">
          <legend className="sr-only">Teslim modu</legend>
          <label className="flex items-start gap-3">
            <input type="radio" checked={mode === 'empty_handover'} onChange={() => setMode('empty_handover')} />
            <span>
              <strong>Boş teslim (varsayılan).</strong> Kutular Mailcow yönetiminden elle silinir; yeni sahibe boş teslim edilir.
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" checked={mode === 'keep_mailboxes_with_consent'} onChange={() => setMode('keep_mailboxes_with_consent')} />
            <span>
              <strong>İstisna.</strong> Eski sahibin yazılı onayıyla mevcut kutular yeni sahibe açılır.
            </span>
          </label>
        </fieldset>

        {mode === 'empty_handover' ? (
          <div className="flex items-center gap-3">
            <span>Canlı kutu sayısı: <strong>{count ?? 'bilinmiyor'}</strong></span>
            <Button variant="outline" onClick={recheck} disabled={pending}>Mailcow’u yeniden oku</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="rounded-lg border border-destructive/40 p-3 text-destructive">
              Mevcut kutular ve içerikleri yeni sahibe açılacak. Kutu sayısı: {count ?? 'bilinmiyor'}.
            </p>
            <label className="block space-y-1.5">
              <span className="text-muted-foreground">Eski sahibin yazılı onayı (admin notu, en az 10 karakter)</span>
              <textarea className={`${FIELD} h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
        )}

        <label className="block space-y-1.5">
          <span className="text-muted-foreground">Onay için alan adını yazın: {preview.domain}</span>
          <input className={FIELD} value={confirmDomain} onChange={(e) => setConfirmDomain(e.target.value)} />
        </label>
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-0.5 size-4" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span>
            {mode === 'empty_handover'
              ? 'Kutuların silindiğini ve alan adının yeni sahibe boş teslim edildiğini anlıyorum.'
              : 'Eski sahibin yazılı onayı olduğunu ve kutuların yeni sahibe açılacağını anlıyorum.'}
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => run(requestReleaseAction, 'Onay talebi oluşturuldu.')} disabled={!baseReady || pending}>
            Onay talep et (ikinci admin açıksa)
          </Button>
          <Button variant="destructive" onClick={() => run(releaseAction, 'Karantina kaldırıldı.')} disabled={!baseReady || pending}>
            Karantinayı kaldır
          </Button>
        </div>
        {msg ? <p role="status" className="text-sm text-muted-foreground">{msg}</p> : null}
      </div>
    </Panel>
  )
}
