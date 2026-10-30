import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Transfer quarantine ("mail_transfer_hold_at"): while set on a custom domain
 * its mail service stays closed. The helpers here are the single place the
 * rest of the mail module asks "is this domain held?". Reads fail closed: a
 * failed lookup throws instead of pretending nothing is held.
 */

export type HeldFlag = { transferHoldAt: string | null }

export function isHeld(row: HeldFlag | null | undefined): boolean {
  return Boolean(row?.transferHoldAt)
}

/** Ids of the user's domains that are currently in transfer quarantine. */
export async function listHeldDomainIds(userId: string): Promise<Set<string>> {
  const { data, error } = await createAdminClient()
    .from('custom_domains')
    .select('id')
    .eq('user_id', userId)
    .not('mail_transfer_hold_at', 'is', null)
  if (error) throw new Error('mail_hold_lookup_failed')
  return new Set(((data ?? []) as Array<{ id: string }>).map((row) => row.id))
}
