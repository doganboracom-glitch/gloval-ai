'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPlatformPaymentProvider,
  getPlatformPaymentProviderId,
} from '@/lib/payments'
import { BRANDING_REMOVAL_CODE } from '@/lib/billing-utils'
import type { CheckoutBuyer } from '@/lib/billing'

async function resolveClientIp(): Promise<string> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
    const real = h.get('x-real-ip')
    if (real) return real.trim()
  } catch {
    // ignore — headers() is unavailable outside a request context
  }
  return '127.0.0.1'
}

/**
 * Per-PROJECT permanent rights ("Kalıcı Haklar").
 *
 * This sits alongside `lib/billing.ts` (recurring subscriptions) and the
 * user-level `billing_entitlements` table, and deliberately does not touch
 * either: a right bought here is attached to ONE site, paid once, and never
 * expires. Today the only right is `branding_removal`, which removes the
 * "Gloval AI ile oluşturuldu." credit from that site.
 *
 * All reads are scoped to the authenticated owner (explicit `user_id` filter +
 * RLS). The purchase mutation validates the project ownership and reads the
 * price from the server-side catalog before touching the admin client, so a
 * client can never choose its own price or buy a right for someone else's site.
 */

// A 'use server' module may only export async functions, so the shared plan
// code lives in `lib/billing-utils.ts` and is re-used from there.
export type ProjectEntitlementRow = {
  id: string
  project_id: string
  code: string
  name: string
  status: 'inactive' | 'active' | 'revoked'
  amount_cents: number
  currency: string
  granted_at: string | null
}

/** An owned right joined with the site it belongs to, for the billing panel. */
export type ProjectEntitlementItem = ProjectEntitlementRow & {
  projectName: string
  projectSlug: string | null
}

async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { supabase, userId: user.id, email: user.email ?? '' }
}

/**
 * Public read used by published tenant pages: does this slug's site hold the
 * branding-removal right? Runs through a SECURITY DEFINER RPC so anonymous
 * visitors can resolve it without exposing any billing data.
 */
export async function isSiteBrandingRemoved(slug: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('site_branding_removed', {
    p_slug: slug,
  })
  // A failed lookup must never hide the credit — fail closed (badge stays).
  if (error) return false
  return data === true
}

/** Every permanent right the current user owns, newest first. */
export async function getMyProjectEntitlements(): Promise<ProjectEntitlementItem[]> {
  const { supabase, userId } = await requireUser()
  const { data, error } = await supabase
    .from('project_entitlements')
    .select(
      'id, project_id, code, name, status, amount_cents, currency, granted_at, projects(name, slug)',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error

  type JoinedRow = ProjectEntitlementRow & {
    // The embedded relation arrives as an object or an array depending on how
    // the FK is inferred, so both shapes are normalised here.
    projects:
      | { name: string; slug: string | null }
      | { name: string; slug: string | null }[]
      | null
  }

  return ((data ?? []) as unknown as JoinedRow[]).map((row) => {
    const { projects, ...rest } = row
    const project = Array.isArray(projects) ? projects[0] : projects
    return {
      ...rest,
      projectName: project?.name ?? '',
      projectSlug: project?.slug ?? null,
    }
  })
}

export type BuyEntitlementResult =
  | { ok: true; redirectUrl?: string }
  | { ok: false; error: 'not_found' | 'already_owned' | 'failed' }

/**
 * Buy the one-time branding-removal right for a single project the caller owns.
 * The price always comes from `billing_plans`, never from the client.
 */
export async function purchaseBrandingRemoval(
  projectId: string,
  buyer?: CheckoutBuyer,
): Promise<BuyEntitlementResult> {
  const { supabase, userId, email } = await requireUser()

  // Ownership check through the caller's own (RLS-scoped) client.
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .select('id, name, slug')
    .eq('id', projectId)
    .maybeSingle()
  if (projectErr || !project) return { ok: false, error: 'not_found' }

  const admin = createAdminClient()

  const { data: plan, error: planErr } = await admin
    .from('billing_plans')
    .select('code, name, price_cents, currency, active')
    .eq('code', BRANDING_REMOVAL_CODE)
    .maybeSingle()
  if (planErr || !plan || !plan.active) return { ok: false, error: 'not_found' }

  // One right per project, enforced again by a unique (project_id, code) index.
  const { data: existing } = await admin
    .from('project_entitlements')
    .select('id')
    .eq('project_id', projectId)
    .eq('code', BRANDING_REMOVAL_CODE)
    .eq('status', 'active')
    .maybeSingle()
  if (existing) return { ok: false, error: 'already_owned' }

  // Settle the one-time charge through the platform provider. The mock provider
  // completes synchronously; a real PSP (PayTR) returns a redirect URL and the
  // right is activated only after a verified callback.
  const providerId = getPlatformPaymentProviderId()
  const provider = getPlatformPaymentProvider()
  // Guarded the same way as subscribeToPlan/changePlan in lib/billing.ts: a
  // PSP-side failure here must come back as a controlled `{ ok: false }`
  // instead of an unhandled exception, or the client's already-open payment
  // popup is left stuck on `about:blank` with no redirect ever arriving.
  let intent
  try {
    intent = await provider.createIntent({
      orderId: `ent_${projectId}_${BRANDING_REMOVAL_CODE}`,
      amountCents: plan.price_cents,
      currency: plan.currency,
      customerEmail: email,
      returnUrl: '/billing',
      publicConfig: buyer
        ? {
            buyer: {
              fullName: buyer.fullName,
              phone: buyer.phone,
              address: buyer.address,
              identityNumber: buyer.taxId,
              ip: await resolveClientIp(),
            },
          }
        : undefined,
    })
  } catch (error) {
    console.log('[v0] purchaseBrandingRemoval: payment intent failed', {
      projectId,
      providerId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { ok: false, error: 'failed' }
  }
  if (intent.status === 'failed') return { ok: false, error: 'failed' }

  const settlesAsync =
    !provider.capabilities.synchronous && intent.action === 'redirect'

  if (settlesAsync) {
    // Record the right as INACTIVE (pending) and keep a pending ledger row; the
    // billing webhook flips both to active/succeeded once PayTR confirms. Upsert
    // so an abandoned attempt can be retried without a unique-index clash.
    const { error: pendErr } = await admin.from('project_entitlements').upsert(
      {
        project_id: projectId,
        user_id: userId,
        code: BRANDING_REMOVAL_CODE,
        name: plan.name,
        status: 'inactive',
        provider: providerId,
        provider_ref: intent.reference,
        amount_cents: plan.price_cents,
        currency: plan.currency,
      },
      { onConflict: 'project_id,code' },
    )
    if (pendErr) return { ok: false, error: 'failed' }

    await admin.from('billing_transactions').upsert(
      {
        user_id: userId,
        kind: 'charge',
        amount_cents: plan.price_cents,
        currency: plan.currency,
        status: 'pending',
        provider: providerId,
        provider_ref: intent.reference,
        idempotency_key: `ent_${projectId}_${BRANDING_REMOVAL_CODE}`,
        description: `${plan.name} — ${project.name}`,
      },
      { onConflict: 'user_id,idempotency_key', ignoreDuplicates: false },
    )

    return { ok: true, redirectUrl: intent.redirectUrl }
  }

  // Synchronous settlement (mock): grant immediately.
  const { error: grantErr } = await admin.from('project_entitlements').insert({
    project_id: projectId,
    user_id: userId,
    code: BRANDING_REMOVAL_CODE,
    name: plan.name,
    status: 'active',
    provider: providerId,
    provider_ref: intent.reference,
    amount_cents: plan.price_cents,
    currency: plan.currency,
  })
  if (grantErr) return { ok: false, error: 'failed' }

  await admin.from('billing_transactions').insert({
    user_id: userId,
    kind: 'charge',
    amount_cents: plan.price_cents,
    currency: plan.currency,
    status: 'succeeded',
    provider: providerId,
    provider_ref: intent.reference,
    // Idempotent per project: a retry can never double-charge the same site.
    idempotency_key: `ent_${projectId}_${BRANDING_REMOVAL_CODE}`,
    description: `${plan.name} — ${project.name}`,
  })

  revalidatePath('/billing')
  if (project.slug) revalidatePath(`/site/${project.slug}`)
  return { ok: true }
}
