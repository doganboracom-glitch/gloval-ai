'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import { useLanguage } from '@/components/language-provider'
import { PageHeader, Panel, StatusBadge } from '@/components/admin/admin-ui'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { getMakerRequestCopy } from '@/lib/maker-requests/copy'
import {
  closeMakerRequest,
  saveMakerRequestNotes,
  sendMakerRequestReply,
} from '@/lib/maker-requests/actions'
import type { MakerRequest, MakerRequestStatus } from '@/lib/maker-requests/types'

function statusTone(status: MakerRequestStatus) {
  if (status === 'new') return 'warning'
  if (status === 'answered') return 'success'
  return 'muted'
}

function formatDate(value: string | null, locale: string, fallback: string) {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function DetailValue({ value, mono = false }: { value: string; mono?: boolean }) {
  return <dd className={`mt-1 break-words text-sm leading-relaxed ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
}

export function MakerRequestDetailView({ request }: { request: MakerRequest }) {
  const { lang } = useLanguage()
  const router = useRouter()
  const copy = getMakerRequestCopy(lang).admin
  const formCopy = getMakerRequestCopy(lang).form
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const emailLang = lang === 'tr' ? 'tr' : 'en'
  const [notes, setNotes] = useState(request.admin_notes)
  const [reply, setReply] = useState('')
  const [notesFeedback, setNotesFeedback] = useState('')
  const [replyFeedback, setReplyFeedback] = useState('')
  const [closeFeedback, setCloseFeedback] = useState('')
  const [notesPending, startNotesTransition] = useTransition()
  const [replyPending, startReplyTransition] = useTransition()
  const [closePending, startCloseTransition] = useTransition()

  function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotesFeedback('')
    startNotesTransition(async () => {
      const result = await saveMakerRequestNotes(request.id, notes)
      setNotesFeedback(result.ok ? copy.notesSaved : copy.notesFailed)
    })
  }

  function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setReplyFeedback('')
    startReplyTransition(async () => {
      const result = await sendMakerRequestReply(request.id, reply, emailLang)
      if (result.ok) {
        router.refresh()
        setReply('')
        setReplyFeedback(copy.replySent)
      } else {
        setReplyFeedback(copy.replyFailed)
      }
    })
  }

  function closeRequest() {
    setCloseFeedback('')
    startCloseTransition(async () => {
      const result = await closeMakerRequest(request.id)
      setCloseFeedback(result.ok ? copy.requestClosed : copy.closeFailed)
      if (result.ok) router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/maker-requests" className="w-fit text-sm font-medium text-brand underline-offset-4 hover:underline">
        {copy.back}
      </Link>

      <PageHeader
        title={request.full_name}
        subtitle={request.email}
        action={<StatusBadge tone={statusTone(request.status)}>{copy.statuses[request.status]}</StatusBadge>}
      />

      <Panel title={copy.title}>
        <dl className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">{copy.requestId}</dt><DetailValue value={request.id} mono /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.created}</dt><DetailValue value={formatDate(request.created_at, locale, copy.unknown)} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.userId}</dt><DetailValue value={request.user_id ?? copy.unknown} mono /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.name}</dt><DetailValue value={request.full_name} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.email}</dt><DetailValue value={request.email} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.phone}</dt><DetailValue value={request.phone} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.budget}</dt><DetailValue value={formCopy.budgets[request.budget_range]} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.status}</dt><DetailValue value={copy.statuses[request.status]} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.consentVersion}</dt><DetailValue value={request.consent_version} /></div>
          <div><dt className="text-xs text-muted-foreground">{copy.consentAt}</dt><DetailValue value={formatDate(request.consent_at, locale, copy.unknown)} /></div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{copy.ipHash}</dt>
            <DetailValue value={request.ip_hash} mono />
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{copy.references}</dt>
            <dd className="mt-1 break-all text-sm leading-relaxed">
              {request.reference_links.length
                ? request.reference_links.map((url) => <p key={url}>{url}</p>)
                : copy.noReferences}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{copy.replyText}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{request.reply_text || copy.unknown}</dd>
          </div>
          <div><dt className="text-xs text-muted-foreground">{copy.repliedAt}</dt><DetailValue value={formatDate(request.replied_at, locale, copy.unknown)} /></div>
        </dl>
      </Panel>

      <Panel title={copy.adminNotes}>
        <form className="flex flex-col gap-4 p-4" onSubmit={saveNotes}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="maker-request-admin-notes" className="sr-only">{copy.adminNotes}</FieldLabel>
              <textarea
                id="maker-request-admin-notes"
                value={notes}
                maxLength={5000}
                rows={5}
                onChange={(event) => setNotes(event.currentTarget.value)}
                placeholder={copy.notePlaceholder}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="outline" disabled={notesPending}>{notesPending ? copy.saving : copy.saveNotes}</Button>
            <p aria-live="polite" className="text-sm text-muted-foreground">{notesFeedback}</p>
          </div>
        </form>
      </Panel>

      <Panel title={copy.reply}>
        <form className="flex flex-col gap-4 p-4" onSubmit={sendReply}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="maker-request-reply" className="sr-only">{copy.reply}</FieldLabel>
              <textarea
                id="maker-request-reply"
                value={reply}
                maxLength={5000}
                rows={6}
                required
                onChange={(event) => setReply(event.currentTarget.value)}
                placeholder={copy.replyPlaceholder}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
              />
            </Field>
          </FieldGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="brand" disabled={replyPending || !reply.trim()}>{replyPending ? copy.sending : copy.sendReply}</Button>
            <p aria-live="polite" className="text-sm text-muted-foreground">{replyFeedback}</p>
          </div>
        </form>
      </Panel>

      {request.status !== 'closed' ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" disabled={closePending} onClick={closeRequest}>
            {closePending ? copy.saving : copy.closeRequest}
          </Button>
          <p aria-live="polite" className="text-sm text-muted-foreground">{closeFeedback}</p>
        </div>
      ) : null}
    </div>
  )
}
