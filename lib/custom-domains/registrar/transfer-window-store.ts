import 'server-only'

import type { createAdminClient } from '@/lib/supabase/admin'

export type DomainTransferWindow = {
  id: string
  custom_domain_id: string | null
  domain: string
  user_id: string | null
  status: 'open' | 'relocked' | 'cancelled' | 'failed'
  opened_at: string
  relock_at: string
  extensions: number
  relock_attempts: number
  last_error_code: string | null
  closed_at: string | null
  reminder_sent_at: string | null
  relock_lease_until: string | null
}

export type TransferWindowStoreError = 'unavailable' | 'unique'
export type TransferWindowStoreResult<T> = { ok: true; value: T } | { ok: false; error: TransferWindowStoreError }
export type AdminClient = ReturnType<typeof createAdminClient>

export const TRANSFER_WINDOW_COLUMNS =
  'id, custom_domain_id, domain, user_id, status, opened_at, relock_at, extensions, relock_attempts, last_error_code, closed_at, reminder_sent_at, relock_lease_until'

export function isTransferWindowSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = String((error as { code?: unknown }).code ?? '')
  return code === '42P01' || code === 'PGRST204' || code === 'PGRST205'
}

function classifyError(error: unknown): TransferWindowStoreError {
  if (error && typeof error === 'object' && (error as { code?: unknown }).code === '23505') return 'unique'
  return 'unavailable'
}

export async function findOpenTransferWindow(
  admin: AdminClient,
  domain: string,
  userId?: string,
): Promise<TransferWindowStoreResult<DomainTransferWindow | null>> {
  try {
    let query = admin
      .from('domain_transfer_windows')
      .select(TRANSFER_WINDOW_COLUMNS)
      .eq('domain', domain)
      .eq('status', 'open')
    if (userId) query = query.eq('user_id', userId)
    const { data, error } = await query.limit(1).maybeSingle()
    if (error) return { ok: false, error: 'unavailable' }
    return { ok: true, value: (data as DomainTransferWindow | null) ?? null }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function getOwnedCustomDomainId(
  admin: AdminClient,
  userId: string,
  domain: string,
): Promise<string | null> {
  try {
    const { data, error } = await admin
      .from('custom_domains')
      .select('id')
      .eq('user_id', userId)
      .eq('domain', domain)
      .maybeSingle()
    if (error || !data) return null
    const id = (data as { id?: unknown }).id
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

export async function insertOpenTransferWindow(
  admin: AdminClient,
  input: Pick<DomainTransferWindow, 'custom_domain_id' | 'domain' | 'user_id' | 'opened_at' | 'relock_at'>,
): Promise<TransferWindowStoreResult<DomainTransferWindow>> {
  try {
    const { data, error } = await admin
      .from('domain_transfer_windows')
      .insert({ ...input, status: 'open' })
      .select(TRANSFER_WINDOW_COLUMNS)
      .single()
    if (error || !data) return { ok: false, error: classifyError(error) }
    return { ok: true, value: data as DomainTransferWindow }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function updateOpenTransferWindow(
  admin: AdminClient,
  id: string,
  patch: Partial<
    Pick<
      DomainTransferWindow,
      | 'status'
      | 'relock_at'
      | 'extensions'
      | 'relock_attempts'
      | 'last_error_code'
      | 'closed_at'
      | 'reminder_sent_at'
      | 'relock_lease_until'
    >
  >,
): Promise<TransferWindowStoreResult<boolean>> {
  try {
    const { data, error } = await admin
      .from('domain_transfer_windows')
      .update(patch)
      .eq('id', id)
      .eq('status', 'open')
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: 'unavailable' }
    return { ok: true, value: Boolean(data) }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}

export async function updateOpenTransferWindowIfExtensionsMatch(
  admin: AdminClient,
  id: string,
  currentExtensions: number,
  patch: Pick<DomainTransferWindow, 'relock_at' | 'extensions'>,
): Promise<TransferWindowStoreResult<boolean>> {
  try {
    const { data, error } = await admin
      .from('domain_transfer_windows')
      .update(patch)
      .eq('id', id)
      .eq('status', 'open')
      .eq('extensions', currentExtensions)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: 'unavailable' }
    return { ok: true, value: Boolean(data) }
  } catch {
    return { ok: false, error: 'unavailable' }
  }
}
