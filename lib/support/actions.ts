'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { recordNotification, sendTransactionalEmail } from '@/lib/notify'
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_MIME_TYPES,
  MESSAGE_MAX,
  SUBJECT_MAX,
  TICKET_DEPARTMENTS,
  TICKET_PRIORITIES,
  TICKET_SERVICES,
  isOneOf,
} from '@/lib/support/constants'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

type AuthedUser = { id: string; email: string | null }

async function requireUser(): Promise<AuthedUser | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { id: user.id, email: user.email ?? null } : null
}

/** Verify the real file signature so a renamed binary cannot pass as an image/PDF. */
function matchesSignature(mime: string, bytes: Uint8Array): boolean {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (mime) {
    case 'image/png':
      return startsWith([0x89, 0x50, 0x4e, 0x47])
    case 'image/jpeg':
      return startsWith([0xff, 0xd8, 0xff])
    case 'image/webp':
      return startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45
    case 'application/pdf':
      return startsWith([0x25, 0x50, 0x44, 0x46])
    case 'text/plain':
      return !bytes.slice(0, 1024).includes(0)
    default:
      return false
  }
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, ' ').trim()
  return (cleaned || 'file').slice(-120)
}

function collectFiles(formData: FormData): File[] {
  return formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)
}

function validateFileList(files: File[]): string | null {
  if (files.length > ATTACHMENT_MAX_FILES) return 'too_many_files'
  for (const f of files) {
    if (f.size > ATTACHMENT_MAX_BYTES) return 'file_too_large'
    if (!isOneOf(ATTACHMENT_MIME_TYPES, f.type)) return 'file_type_not_allowed'
  }
  return null
}

async function storeAttachments(input: {
  ticketId: string
  messageId: string
  uploaderId: string
  files: File[]
}): Promise<string | null> {
  const admin = createAdminClient()
  for (const file of input.files) {
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!matchesSignature(file.type, bytes)) return 'file_type_not_allowed'
    const path = `${input.ticketId}/${randomUUID()}`
    const { error: upErr } = await admin.storage
      .from('support-attachments')
      .upload(path, bytes, { contentType: file.type, upsert: false })
    if (upErr) return 'upload_failed'
    const { error: metaErr } = await admin.from('support_ticket_attachments').insert({
      ticket_id: input.ticketId,
      message_id: input.messageId,
      uploader_id: input.uploaderId,
      storage_path: path,
      file_name: safeFileName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
    })
    if (metaErr) {
      await admin.storage.from('support-attachments').remove([path])
      return 'upload_failed'
    }
  }
  return null
}

/** Best-effort: a notification failure must never fail the ticket/message itself. */
async function notifyAdminOfUserActivity(input: {
  userId: string
  userEmail: string | null
  ticketNumber: string
  subject: string
  message: string
  isNew: boolean
}) {
  try {
    await sendAdminNotification(input)
  } catch (error) {
    console.log('[v0] support admin notification failed:', error)
  }
}

async function sendAdminNotification(input: {
  userId: string
  userEmail: string | null
  ticketNumber: string
  subject: string
  message: string
  isNew: boolean
}) {
  const title = input.isNew
    ? `Yeni destek talebi ${input.ticketNumber}`
    : `Destek talebine yeni mesaj ${input.ticketNumber}`
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim()
  let sent = false
  if (adminEmail) {
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
    sent = await sendTransactionalEmail({
      to: adminEmail,
      subject: `[Gloval AI] ${title}`,
      replyTo: input.userEmail ?? undefined,
      text: `${input.subject}\n\n${input.message}`,
      html: `<p><strong>${esc(input.subject)}</strong></p><p>${esc(input.userEmail ?? '')}</p><p style="white-space:pre-wrap">${esc(input.message)}</p>`,
    })
  }
  await recordNotification({
    userId: input.userId,
    channel: adminEmail ? 'email' : 'system',
    type: input.isNew ? 'ticket_created' : 'ticket_user_message',
    subject: title,
    body: input.subject,
    status: adminEmail ? (sent ? 'sent' : 'failed') : 'sent',
  })
}

/** Create a ticket + first message (+ attachments) for the signed-in user. */
export async function createSupportTicket(
  formData: FormData,
): Promise<Result<{ ticketId: string; ticketNumber: string }>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const department = formData.get('department')
  const priority = formData.get('priority') || 'normal'
  const serviceRaw = formData.get('service')
  const service = serviceRaw && serviceRaw !== 'none' ? serviceRaw : null
  const projectIdRaw = formData.get('projectId')
  const subject = String(formData.get('subject') ?? '').trim()
  const message = String(formData.get('message') ?? '').trim()
  const idempotencyKey = String(formData.get('idempotencyKey') ?? '').slice(0, 80) || null

  if (!isOneOf(TICKET_DEPARTMENTS, department)) return { ok: false, error: 'invalid_department' }
  if (!isOneOf(TICKET_PRIORITIES, priority)) return { ok: false, error: 'invalid_priority' }
  if (service !== null && !isOneOf(TICKET_SERVICES, service)) return { ok: false, error: 'invalid_service' }
  if (!subject || subject.length > SUBJECT_MAX) return { ok: false, error: 'invalid_subject' }
  if (!message || message.length > MESSAGE_MAX) return { ok: false, error: 'invalid_message' }

  const files = collectFiles(formData)
  const fileError = validateFileList(files)
  if (fileError) return { ok: false, error: fileError }

  const admin = createAdminClient()

  let projectId: string | null = null
  if (typeof projectIdRaw === 'string' && projectIdRaw && projectIdRaw !== 'none') {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('id', projectIdRaw)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!project) return { ok: false, error: 'invalid_project' }
    projectId = project.id as string
  }

  if (idempotencyKey) {
    const { data: existing } = await admin
      .from('support_tickets')
      .select('id, ticket_number')
      .eq('user_id', user.id)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing) {
      return { ok: true, ticketId: existing.id as string, ticketNumber: existing.ticket_number as string }
    }
  }

  const { data: ticket, error } = await admin
    .from('support_tickets')
    .insert({
      user_id: user.id,
      department,
      priority,
      service,
      project_id: projectId,
      subject,
      status: 'open',
      source: 'app',
      contact_email: user.email,
      idempotency_key: idempotencyKey,
    })
    .select('id, ticket_number')
    .single()

  if (error || !ticket) {
    if (error?.code === '23505' && idempotencyKey) {
      const { data: existing } = await admin
        .from('support_tickets')
        .select('id, ticket_number')
        .eq('user_id', user.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existing) {
        return { ok: true, ticketId: existing.id as string, ticketNumber: existing.ticket_number as string }
      }
    }
    return { ok: false, error: 'create_failed' }
  }

  const { data: msg, error: msgErr } = await admin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticket.id,
      author_type: 'user',
      author_email: user.email,
      sender_id: user.id,
      body: message,
    })
    .select('id')
    .single()
  if (msgErr || !msg) {
    await admin.from('support_tickets').delete().eq('id', ticket.id)
    return { ok: false, error: 'create_failed' }
  }

  if (files.length) {
    const uploadError = await storeAttachments({
      ticketId: ticket.id as string,
      messageId: msg.id as string,
      uploaderId: user.id,
      files,
    })
    if (uploadError) {
      const { data: stored } = await admin
        .from('support_ticket_attachments')
        .select('storage_path')
        .eq('ticket_id', ticket.id)
      if (stored?.length) {
        await admin.storage.from('support-attachments').remove(stored.map((s) => s.storage_path as string))
      }
      await admin.from('support_tickets').delete().eq('id', ticket.id)
      return { ok: false, error: uploadError }
    }
  }

  await notifyAdminOfUserActivity({
    userId: user.id,
    userEmail: user.email,
    ticketNumber: ticket.ticket_number as string,
    subject,
    message,
    isNew: true,
  })

  revalidatePath('/support')
  revalidatePath('/admin/support')
  return { ok: true, ticketId: ticket.id as string, ticketNumber: ticket.ticket_number as string }
}

/** Post a follow-up message from the ticket owner. */
export async function replyToOwnTicket(formData: FormData): Promise<Result> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const ticketId = String(formData.get('ticketId') ?? '')
  const message = String(formData.get('message') ?? '').trim()
  if (!message || message.length > MESSAGE_MAX) return { ok: false, error: 'invalid_message' }

  const files = collectFiles(formData)
  const fileError = validateFileList(files)
  if (fileError) return { ok: false, error: fileError }

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('support_tickets')
    .select('id, user_id, subject, ticket_number')
    .eq('id', ticketId)
    .maybeSingle()
  if (!ticket || ticket.user_id !== user.id) return { ok: false, error: 'ticket_not_found' }

  const { data: msg, error } = await admin
    .from('support_ticket_messages')
    .insert({
      ticket_id: ticketId,
      author_type: 'user',
      author_email: user.email,
      sender_id: user.id,
      body: message,
    })
    .select('id')
    .single()
  if (error || !msg) return { ok: false, error: 'send_failed' }

  if (files.length) {
    const uploadError = await storeAttachments({
      ticketId,
      messageId: msg.id as string,
      uploaderId: user.id,
      files,
    })
    if (uploadError) {
      const { data: stored } = await admin
        .from('support_ticket_attachments')
        .select('storage_path')
        .eq('message_id', msg.id)
      if (stored?.length) {
        await admin.storage.from('support-attachments').remove(stored.map((s) => s.storage_path as string))
      }
      await admin.from('support_ticket_messages').delete().eq('id', msg.id)
      return { ok: false, error: uploadError }
    }
  }

  await admin
    .from('support_tickets')
    .update({ status: 'open', updated_at: new Date().toISOString() })
    .eq('id', ticketId)

  await notifyAdminOfUserActivity({
    userId: user.id,
    userEmail: user.email,
    ticketNumber: ticket.ticket_number as string,
    subject: ticket.subject as string,
    message,
    isNew: false,
  })

  revalidatePath('/support')
  revalidatePath(`/support/${ticketId}`)
  revalidatePath('/admin/support')
  return { ok: true }
}
