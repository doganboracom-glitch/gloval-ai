import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentCustomerIdForProject } from '@/lib/store-customer'
import { signOrderToken, verifyOrderToken } from '@/lib/store-order-token'
import { canAccessOrder, firstNameOf, maskEmail } from '@/lib/store-order-privacy'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function tokenSecret(): string {
  return (
    process.env.STORE_ORDER_TOKEN_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

/** Signed 30-day token for one order, or '' when no secret is configured. */
export function issueOrderAccessToken(orderId: string): string {
  const secret = tokenSecret()
  return secret ? signOrderToken(orderId, secret) : ''
}

/** Path (no origin) of the order page, carrying the access token as `?t=`. */
export function buildOrderPath(storeSlug: string, orderId: string, token: string): string {
  const base = `/site/${storeSlug}/order/${orderId}`
  return token ? `${base}?t=${encodeURIComponent(token)}` : base
}

export type OrderConfirmation = {
  id: string
  status: string
  payment_status: string
  first_name: string
  masked_email: string
  total_cents: number
  currency: string
  created_at: string
  items: {
    name: string
    unit_price_cents: number
    quantity: number
    line_total_cents: number
  }[]
}

/**
 * Public order-confirmation read. Returns data only when the order belongs to
 * the store in the URL AND the caller holds a valid access token or is the
 * logged-in customer who owns the order. Every other case returns null, so the
 * caller renders the same "not found" page whether or not the order exists.
 * The result is deliberately minimal: first name and masked email only, never
 * phone or address.
 */
export async function getOrderConfirmation(
  orderId: string,
  storeSlug: string,
  accessToken: string | null | undefined,
): Promise<OrderConfirmation | null> {
  if (!UUID.test(orderId) || !storeSlug) return null

  const admin = createAdminClient()
  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('slug', storeSlug)
    .eq('published', true)
    .maybeSingle()
  if (!project) return null

  const { data: order } = await admin
    .from('ecommerce_orders')
    .select(
      'id, project_id, customer_id, status, payment_status, customer_name, customer_email, total_cents, currency, created_at',
    )
    .eq('id', orderId)
    .eq('project_id', project.id)
    .maybeSingle()
  if (!order) return null

  const tokenValid = verifyOrderToken(orderId, accessToken, tokenSecret())
  let sessionOwnsOrder = false
  if (!tokenValid && order.customer_id) {
    const sessionCustomerId = await getCurrentCustomerIdForProject(project.id)
    sessionOwnsOrder = !!sessionCustomerId && sessionCustomerId === order.customer_id
  }

  if (
    !canAccessOrder({
      orderProjectId: order.project_id,
      slugProjectId: project.id,
      tokenValid,
      sessionOwnsOrder,
    })
  ) {
    return null
  }

  const { data: items } = await admin
    .from('ecommerce_order_items')
    .select('name, unit_price_cents, quantity, line_total_cents')
    .eq('order_id', orderId)

  return {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    first_name: firstNameOf(order.customer_name),
    masked_email: maskEmail(order.customer_email),
    total_cents: order.total_cents,
    currency: order.currency,
    created_at: order.created_at,
    items: items ?? [],
  }
}
