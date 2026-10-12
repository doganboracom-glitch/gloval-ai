import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { claimNotification, sendTransactionalEmail } from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { findContactEmail } from '@/lib/store-order-notifications'
import { renderStoreAccountDeletedEmail } from '@/lib/store-customer-email'
import {
  buildAnonymizePatch,
  hasBlockingOrders,
  isMissingDeletionSchema,
  type OrderStateRow,
} from '@/lib/store-customer-privacy'

/**
 * Anonymization core shared by the customer's own "delete my account" action and
 * the store owner's panel. NOT a `'use server'` module: nothing here is callable
 * from a browser; callers authorize first (session + password, or project owner).
 */

export type DeletionEvent = 'deleted_by_customer' | 'anonymized_by_owner'

export type AnonymizeResult =
  | { ok: true; previousEmail: string; previousName: string }
  | { ok: false; reason: 'not_found' | 'already_deleted' | 'blocked' | 'migration_pending' | 'failed' }

/** Loads the order states of one customer; falls back when `shipping_status` is absent. */
async function loadOrderStates(projectId: string, customerId: string): Promise<OrderStateRow[] | null> {
  const admin = createAdminClient()
  const full = await admin
    .from('ecommerce_orders')
    .select('status, payment_status, shipping_status')
    .eq('project_id', projectId)
    .eq('customer_id', customerId)
  if (!full.error) return (full.data ?? []) as OrderStateRow[]

  const basic = await admin
    .from('ecommerce_orders')
    .select('status, payment_status')
    .eq('project_id', projectId)
    .eq('customer_id', customerId)
  if (basic.error) return null
  return (basic.data ?? []) as OrderStateRow[]
}

/** True when the customer has an order that is still being paid, prepared or shipped. */
export async function customerHasBlockingOrders(
  projectId: string,
  customerId: string,
): Promise<boolean | null> {
  const orders = await loadOrderStates(projectId, customerId)
  return orders === null ? null : hasBlockingOrders(orders)
}

/**
 * Wipes every personal field of one customer in a single UPDATE (atomic) guarded
 * by `deleted_at is null`, then records an audit event. Orders keep their
 * `customer_id`, so accounting and shipping data stay intact.
 */
export async function anonymizeStoreCustomer(input: {
  projectId: string
  customerId: string
  event: DeletionEvent
  actorUserId?: string | null
}): Promise<AnonymizeResult> {
  const admin = createAdminClient()

  const { data: existing, error: readError } = await admin
    .from('store_customers')
    .select('id, email, name, deleted_at')
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .maybeSingle()
  if (readError) return { ok: false, reason: isMissingDeletionSchema(readError) ? 'migration_pending' : 'failed' }
  if (!existing) return { ok: false, reason: 'not_found' }
  if (existing.deleted_at) return { ok: false, reason: 'already_deleted' }

  const blocked = await customerHasBlockingOrders(input.projectId, input.customerId)
  if (blocked === null) return { ok: false, reason: 'failed' }
  if (blocked) return { ok: false, reason: 'blocked' }

  const { data: updated, error } = await admin
    .from('store_customers')
    .update(buildAnonymizePatch(input.customerId, new Date().toISOString()))
    .eq('project_id', input.projectId)
    .eq('id', input.customerId)
    .is('deleted_at', null)
    .select('id')
  if (error) return { ok: false, reason: isMissingDeletionSchema(error) ? 'migration_pending' : 'failed' }
  if (!updated || updated.length === 0) return { ok: false, reason: 'already_deleted' }

  const { error: eventError } = await admin.from('store_customer_events').insert({
    project_id: input.projectId,
    customer_id: input.customerId,
    event: input.event,
    actor_user_id: input.actorUserId ?? null,
  })
  if (eventError) console.log('[v0] customer deletion event not recorded:', eventError.code ?? 'unknown')

  return {
    ok: true,
    previousEmail: String(existing.email ?? ''),
    previousName: String(existing.name ?? ''),
  }
}

/**
 * Sends the "your account was deleted" notice to the address captured BEFORE
 * anonymization. Claimed once per customer, so a retry or double click never
 * mails twice. Failures are swallowed: the deletion already happened.
 */
export async function sendAccountDeletedEmail(input: {
  projectId: string
  customerId: string
  to: string
  customerName: string
  byOwner: boolean
}): Promise<void> {
  try {
    if (!input.to) return
    const admin = createAdminClient()
    const { data: project } = await admin
      .from('projects')
      .select('slug, name, owner_id, schema_data')
      .eq('id', input.projectId)
      .maybeSingle()
    if (!project) return

    const claimed = await claimNotification({
      userId: project.owner_id as string,
      type: 'store_account_deleted',
      subject: 'Store account deleted email',
      body: null,
      dedupeKey: `store-account-deleted:${input.customerId}`,
    })
    if (!claimed) return

    const schema = project.schema_data as { meta?: { language?: unknown } } | null
    const mail = renderStoreAccountDeletedEmail({
      lang: resolveEmailLang(schema?.meta?.language),
      storeName: (project.name as string) || (project.slug as string),
      storeSlug: project.slug as string,
      customerName: input.customerName,
      byOwner: input.byOwner,
      contactEmail: findContactEmail(project.schema_data) ?? '',
    })
    await sendTransactionalEmail({ to: input.to, ...mail })
  } catch (err) {
    console.log('[v0] account deleted email failed:', err instanceof Error ? err.message : 'unknown')
  }
}

/** Order ids (from the given list) whose customer account has been deleted. */
export async function deletedCustomerOrderIds(projectId: string, orderIds: readonly string[]): Promise<Set<string>> {
  const result = new Set<string>()
  if (orderIds.length === 0) return result
  try {
    const admin = createAdminClient()
    const { data: links, error } = await admin
      .from('ecommerce_orders')
      .select('id, customer_id')
      .eq('project_id', projectId)
      .in('id', orderIds as string[])
    if (error || !links) return result
    const customerIds = [...new Set(links.map((l) => l.customer_id as string | null).filter((v): v is string => !!v))]
    if (customerIds.length === 0) return result
    const { data: deleted, error: deletedError } = await admin
      .from('store_customers')
      .select('id')
      .eq('project_id', projectId)
      .not('deleted_at', 'is', null)
      .in('id', customerIds)
    if (deletedError || !deleted) return result
    const deletedIds = new Set(deleted.map((d) => d.id as string))
    for (const l of links) if (l.customer_id && deletedIds.has(l.customer_id as string)) result.add(l.id as string)
  } catch {
    // Missing migration or transient error: no badge, orders still render.
  }
  return result
}
