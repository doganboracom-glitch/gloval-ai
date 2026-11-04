import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmailDetailed } from '@/lib/notify'
import {
  buildMakerRequestAcknowledgementEmail,
  buildMakerRequestAdminEmail,
} from '@/lib/email/maker-request-mail'
import type { EmailLang } from '@/lib/email/lang'
import type { MakerRequest } from './types'

const OUTBOX_TYPES = ['maker_request_admin', 'maker_request_ack'] as const
const MAX_ATTEMPTS = 5
const MAX_BATCH = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type MakerRequestEmailType = (typeof OUTBOX_TYPES)[number]
type OutboxState = { lang: EmailLang; attempts: number }
type OutboxRow = {
  id: string
  type: MakerRequestEmailType
  status: 'queued' | 'failed' | 'sent'
  body: string
  dedupe_key: string
  created_at: string
}

function requestIdFromDedupeKey(type: MakerRequestEmailType, key: string): string | null {
  const prefix = `${type}:`
  const id = key.startsWith(prefix) ? key.slice(prefix.length) : ''
  return UUID_PATTERN.test(id) ? id : null
}

function parseOutboxState(body: string): OutboxState {
  try {
    const parsed = JSON.parse(body) as Partial<OutboxState>
    return {
      lang: parsed.lang === 'en' ? 'en' : 'tr',
      attempts: Number.isInteger(parsed.attempts) && Number(parsed.attempts) >= 0
        ? Number(parsed.attempts)
        : 0,
    }
  } catch {
    return { lang: 'tr', attempts: 0 }
  }
}

function serializeOutboxState(state: OutboxState): string {
  return JSON.stringify(state)
}

async function updateOutboxRow(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  status: 'queued' | 'failed' | 'sent',
  state: OutboxState,
) {
  await admin
    .from('notification_logs')
    .update({ status, body: serializeOutboxState(state) })
    .eq('id', id)
}

export async function enqueueMakerRequestEmails(requestId: string, lang: EmailLang): Promise<void> {
  if (!UUID_PATTERN.test(requestId)) return

  const rows = OUTBOX_TYPES.map((type) => ({
    user_id: null,
    channel: 'email',
    type,
    subject: type === 'maker_request_admin' ? 'Yeni GLOVAL Maker teklif talebi' : 'GLOVAL Maker talep alındı',
    body: serializeOutboxState({ lang, attempts: 0 }),
    status: 'queued',
    dedupe_key: `${type}:${requestId}`,
  }))

  try {
    const { error } = await createAdminClient().from('notification_logs').insert(rows)
    if (error) {
      console.error('[maker-requests] notification queue failed:', error.code ?? 'unknown')
      return
    }

    after(async () => {
      try {
        await Promise.all(OUTBOX_TYPES.map((type) => deliverMakerRequestEmail(type, requestId)))
      } catch {
        console.error('[maker-requests] notification delivery failed')
      }
    })
  } catch {
    console.error('[maker-requests] notification queue unavailable')
  }
}

async function deliverMakerRequestEmail(type: MakerRequestEmailType, requestId: string) {
  if (!UUID_PATTERN.test(requestId)) return 'skipped' as const

  const admin = createAdminClient()
  const dedupeKey = `${type}:${requestId}`
  const { data: job, error: jobError } = await admin
    .from('notification_logs')
    .select('id, type, status, body, dedupe_key, created_at')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (jobError || !job || job.status === 'sent') return 'skipped' as const

  const typedJob = job as OutboxRow
  const previousState = parseOutboxState(typedJob.body)
  if (previousState.attempts >= MAX_ATTEMPTS) return 'gave_up' as const

  const nextState = { ...previousState, attempts: previousState.attempts + 1 }
  const { data: claim, error: claimError } = await admin
    .from('notification_logs')
    .update({ status: 'queued', body: serializeOutboxState(nextState) })
    .eq('id', typedJob.id)
    .eq('body', typedJob.body)
    .neq('status', 'sent')
    .select('id')
    .maybeSingle()

  if (claimError || !claim) return 'skipped' as const

  const { data: rawRequest, error: requestError } = await admin
    .from('maker_requests')
    .select('id, created_at, user_id, full_name, phone, email, budget_range, reference_links, status, consent_version, consent_at, ip_hash, admin_notes, replied_at, reply_text')
    .eq('id', requestId)
    .maybeSingle()

  if (requestError || !rawRequest) {
    await updateOutboxRow(admin, typedJob.id, 'failed', nextState)
    return nextState.attempts >= MAX_ATTEMPTS ? 'gave_up' as const : 'retry' as const
  }

  const request = rawRequest as MakerRequest
  const email = type === 'maker_request_admin'
    ? buildMakerRequestAdminEmail(request)
    : buildMakerRequestAcknowledgementEmail(request, previousState.lang)
  const recipient = type === 'maker_request_admin'
    ? process.env.ADMIN_NOTIFICATION_EMAIL?.split(',')[0]?.trim() ?? ''
    : request.email
  const result = await sendTransactionalEmailDetailed({
    to: recipient,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromDisplayName: 'GLOVAL AI',
    ...(type === 'maker_request_admin' ? { replyTo: 'support@gloval.ai' } : {}),
    idempotencyKey: `maker-${type}:${requestId}`,
  })

  if (result.ok) {
    await updateOutboxRow(admin, typedJob.id, 'sent', nextState)
    return 'sent' as const
  }

  if (result.reason === 'not_configured') {
    await updateOutboxRow(admin, typedJob.id, 'queued', previousState)
    return 'retry' as const
  }

  const permanentHttpFailure = result.reason === 'http' && result.status >= 400 && result.status < 500 && result.status !== 408 && result.status !== 429
  const failedState = permanentHttpFailure ? { ...nextState, attempts: MAX_ATTEMPTS } : nextState
  await updateOutboxRow(admin, typedJob.id, 'failed', failedState)
  return failedState.attempts >= MAX_ATTEMPTS ? 'gave_up' as const : 'retry' as const
}

export async function processMakerRequestEmails({
  deadlineMs,
}: {
  deadlineMs: number
}): Promise<{ sent: number; retry: number; gaveUp: number; skipped: number }> {
  const summary = { sent: 0, retry: 0, gaveUp: 0, skipped: 0 }
  if (deadlineMs <= Date.now()) return summary

  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString()
  const oldest = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: jobs, error } = await admin
    .from('notification_logs')
    .select('id, type, status, body, dedupe_key, created_at')
    .in('type', [...OUTBOX_TYPES])
    .in('status', ['queued', 'failed'])
    .gte('created_at', oldest)
    .lte('created_at', cutoff)
    .order('created_at', { ascending: true })
    .limit(MAX_BATCH)

  if (error) {
    console.error('[maker-requests] notification sweep failed:', error.code ?? 'unknown')
    return summary
  }

  for (const rawJob of jobs ?? []) {
    if (Date.now() >= deadlineMs) break
    const job = rawJob as OutboxRow
    const requestId = requestIdFromDedupeKey(job.type, job.dedupe_key)
    if (!requestId) {
      summary.skipped += 1
      continue
    }
    const outcome = await deliverMakerRequestEmail(job.type, requestId)
    if (outcome === 'sent') summary.sent += 1
    else if (outcome === 'retry') summary.retry += 1
    else if (outcome === 'gave_up') summary.gaveUp += 1
    else summary.skipped += 1
  }

  return summary
}
