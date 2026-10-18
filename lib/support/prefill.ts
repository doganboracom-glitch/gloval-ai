import {
  MESSAGE_MAX,
  SUBJECT_MAX,
  TICKET_DEPARTMENTS,
  TICKET_SERVICES,
  isOneOf,
  type TicketDepartment,
  type TicketService,
} from '@/lib/support/constants'

export const NEW_TICKET_PATH = '/support/new'

/** Where the support area lives; probed to decide whether the ticket flow is usable. */
export const SUPPORT_HOME_PATH = '/support'

export type TicketPrefill = {
  department: TicketDepartment | ''
  service: TicketService | 'none'
  projectId: string
  subject: string
  message: string
}

export const EMPTY_TICKET_PREFILL: TicketPrefill = {
  department: '',
  service: 'none',
  projectId: 'none',
  subject: '',
  message: '',
}

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** Query string for the new-ticket page; empty values are left out. */
export function newTicketHref(prefill: Partial<Omit<TicketPrefill, 'projectId'>> & { projectId?: string }): string {
  const params = new URLSearchParams()
  if (prefill.subject) params.set('subject', prefill.subject)
  if (prefill.message) params.set('message', prefill.message)
  if (prefill.department) params.set('department', prefill.department)
  if (prefill.service && prefill.service !== 'none') params.set('service', prefill.service)
  if (prefill.projectId && prefill.projectId !== 'none') params.set('project', prefill.projectId)
  const qs = params.toString()
  return qs ? `${NEW_TICKET_PATH}?${qs}` : NEW_TICKET_PATH
}

/**
 * Reads the new-ticket query string. Every value is validated: unknown
 * departments/services fall back to the form defaults, a project the user does
 * not own is ignored, and text is clamped to the same limits the server enforces.
 */
export function parseTicketPrefill(params: RawParams, ownProjectIds: readonly string[]): TicketPrefill {
  const department = first(params.department)
  const service = first(params.service)
  const project = first(params.project)
  return {
    department: isOneOf(TICKET_DEPARTMENTS, department) ? department : '',
    service: isOneOf(TICKET_SERVICES, service) ? service : 'none',
    projectId: ownProjectIds.includes(project) ? project : 'none',
    subject: first(params.subject).slice(0, SUBJECT_MAX),
    message: first(params.message).slice(0, MESSAGE_MAX),
  }
}

/** Re-serialises raw query params so a login redirect can come back with the prefill intact. */
export function newTicketPathWithParams(params: RawParams): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    const v = first(value)
    if (v) qs.set(key, v)
  }
  const s = qs.toString()
  return s ? `${NEW_TICKET_PATH}?${s}` : NEW_TICKET_PATH
}

/**
 * Cheap reachability check for the support area. Signed-out visitors get a
 * redirect to login (an opaque redirect with `redirect: 'manual'`), which still
 * counts as reachable; a network error, 404 or 5xx does not.
 */
export async function probeSupportReachable(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(SUPPORT_HOME_PATH, { method: 'HEAD', redirect: 'manual', cache: 'no-store' })
    if (res.type === 'opaqueredirect') return true
    return res.status < 500 && res.status !== 404
  } catch {
    return false
  }
}
