import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import type { MakerRequest } from './types'

const REQUEST_COLUMNS = [
  'id',
  'created_at',
  'user_id',
  'full_name',
  'phone',
  'email',
  'budget_range',
  'reference_links',
  'status',
  'consent_version',
  'consent_at',
  'ip_hash',
  'admin_notes',
  'replied_at',
  'reply_text',
].join(',')

function isMissingRequestTable(error: { code?: string } | null | undefined) {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

function normalizeRequest(row: MakerRequest): MakerRequest {
  return {
    ...row,
    reference_links: Array.isArray(row.reference_links) ? row.reference_links : [],
    admin_notes: row.admin_notes ?? '',
  }
}

export async function getMakerRequests(): Promise<{
  items: MakerRequest[]
  schemaReady: boolean
}> {
  const { data, error } = await createAdminClient()
    .from('maker_requests')
    .select(REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) {
    if (isMissingRequestTable(error)) return { items: [], schemaReady: false }
    throw new Error('maker_requests_list_failed')
  }

  return {
    items: ((data ?? []) as unknown as MakerRequest[]).map(normalizeRequest),
    schemaReady: true,
  }
}

export async function getMakerRequest(id: string): Promise<MakerRequest | null> {
  const { data, error } = await createAdminClient()
    .from('maker_requests')
    .select(REQUEST_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    if (isMissingRequestTable(error)) return null
    throw new Error('maker_request_read_failed')
  }

  return data ? normalizeRequest(data as unknown as MakerRequest) : null
}
