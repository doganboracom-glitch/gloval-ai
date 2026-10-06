import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TicketDepartment, TicketPriority, TicketService, TicketStatus } from '@/lib/support/constants'

export type SupportTicketSummary = {
  id: string
  ticketNumber: string
  subject: string
  status: TicketStatus
  priority: TicketPriority
  department: TicketDepartment
  service: TicketService | null
  createdAt: string
  updatedAt: string
}

export type SupportAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  messageId: string | null
}

export type SupportMessage = {
  id: string
  authorType: 'user' | 'admin'
  body: string
  createdAt: string
  attachments: SupportAttachment[]
}

export type SupportTicketDetail = SupportTicketSummary & {
  projectName: string | null
  messages: SupportMessage[]
}

const SUMMARY_COLUMNS =
  'id, ticket_number, subject, status, priority, department, service, created_at, updated_at'

function toSummary(row: Record<string, unknown>): SupportTicketSummary {
  return {
    id: row.id as string,
    ticketNumber: row.ticket_number as string,
    subject: row.subject as string,
    status: row.status as TicketStatus,
    priority: row.priority as TicketPriority,
    department: row.department as TicketDepartment,
    service: (row.service as TicketService | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

/** Reads go through the user's own session, so RLS enforces ownership. */
export async function listMyTickets(): Promise<SupportTicketSummary[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('support_tickets')
    .select(SUMMARY_COLUMNS)
    .order('updated_at', { ascending: false })
  return (data ?? []).map(toSummary)
}

export async function getMyTicket(ticketId: string): Promise<SupportTicketDetail | null> {
  const supabase = await createClient()
  const { data: t } = await supabase
    .from('support_tickets')
    .select(`${SUMMARY_COLUMNS}, project_id`)
    .eq('id', ticketId)
    .maybeSingle()
  if (!t) return null

  const [{ data: msgs }, { data: files }] = await Promise.all([
    supabase
      .from('support_ticket_messages')
      .select('id, author_type, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    supabase
      .from('support_ticket_attachments')
      .select('id, file_name, mime_type, size_bytes, message_id')
      .eq('ticket_id', ticketId),
  ])

  let projectName: string | null = null
  if (t.project_id) {
    const { data: p } = await supabase.from('projects').select('name').eq('id', t.project_id).maybeSingle()
    projectName = (p?.name as string) ?? null
  }

  const attachments: SupportAttachment[] = (files ?? []).map((f) => ({
    id: f.id as string,
    fileName: f.file_name as string,
    mimeType: f.mime_type as string,
    sizeBytes: f.size_bytes as number,
    messageId: (f.message_id as string) ?? null,
  }))

  return {
    ...toSummary(t),
    projectName,
    messages: (msgs ?? []).map((m) => ({
      id: m.id as string,
      authorType: m.author_type as 'user' | 'admin',
      body: m.body as string,
      createdAt: m.created_at as string,
      attachments: attachments.filter((a) => a.messageId === m.id),
    })),
  }
}

export type OwnProject = { id: string; name: string }

export async function listMyProjects(userId: string): Promise<OwnProject[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('projects')
    .select('id, name')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })
    .limit(100)
  return (data ?? []).map((p) => ({ id: p.id as string, name: (p.name as string) || '—' }))
}
