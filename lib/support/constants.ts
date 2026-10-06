export const TICKET_STATUSES = ['open', 'in_progress', 'waiting_user', 'answered', 'resolved'] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const TICKET_PRIORITIES = ['low', 'normal', 'high'] as const
export type TicketPriority = (typeof TICKET_PRIORITIES)[number]

export const TICKET_DEPARTMENTS = ['technical', 'billing', 'domain', 'website', 'ai', 'account', 'other'] as const
export type TicketDepartment = (typeof TICKET_DEPARTMENTS)[number]

export const TICKET_SERVICES = [
  'website',
  'ecommerce',
  'ai_content',
  'visual_logo',
  'domain',
  'hosting',
  'billing',
  'other',
] as const
export type TicketService = (typeof TICKET_SERVICES)[number]

export const SUBJECT_MAX = 150
export const MESSAGE_MAX = 5000
export const ATTACHMENT_MAX_FILES = 5
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const
export const ATTACHMENT_ACCEPT = '.png,.jpg,.jpeg,.webp,.pdf,.txt'

export function isOneOf<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

export type TicketActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string }
