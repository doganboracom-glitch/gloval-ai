import 'server-only'

import { after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  claimNotification,
  releaseNotificationClaim,
  sendTransactionalEmail,
} from '@/lib/notify'
import { resolveEmailLang } from '@/lib/email/lang'
import { sanitizeReplyTo } from '@/lib/email/from'
import { tenantUrl } from '@/lib/domains'
import { buyerMethodName } from '@/lib/payments/methods'
import { firstNameOf } from '@/lib/store-order-privacy'
import { buildOrderPath, issueOrderAccessToken } from '@/lib/store-order-access'
import {
  renderOrderEmail,
  type BankTransferInfo,
  type OrderEmailData,
  type OrderEmailKind,
} from '@/lib/store-order-email'

const DASHBOARD_ORIGIN = 'https://gloval.ai'

type OrderRow = {
  id: string
  project_id: string
  customer_name: string | null
  customer_email: string | null
  customer_phone: string | null
  shipping_address: Record<string, unknown> | null
  subtotal_cents: number
  shipping_cents: number
  total_cents: number
  currency: string
  payment_provider: string
  payment_status: string
}

/** Which buyer email an order is entitled to right now, if any. */
export function buyerKindFor(
  paymentStatus: string,
  paymentProvider: string,
): Extract<OrderEmailKind, 'buyer-paid' | 'buyer-pending'> | null {
  if (paymentStatus === 'paid') return 'buyer-paid'
  if (paymentStatus === 'pending' && paymentProvider === 'bank_transfer') return 'buyer-pending'
  return null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Joins the non-empty address parts into one line. */
export function formatShippingAddress(raw: Record<string, unknown> | null | undefined): string {
  if (!raw) return ''
  return [raw.address, raw.district, raw.city, raw.postalCode].map(str).filter(Boolean).join(', ')
}

/** First contact-section email found anywhere in the site schema. */
export function findContactEmail(schema: unknown): string | undefined {
  const sectionLists: unknown[] = []
  const root = schema as { sections?: unknown; pages?: unknown } | null
  if (root && Array.isArray(root.sections)) sectionLists.push(root.sections)
  if (root && Array.isArray(root.pages)) {
    for (const page of root.pages) {
      const sections = (page as { sections?: unknown } | null)?.sections
      if (Array.isArray(sections)) sectionLists.push(sections)
    }
  }
  for (const list of sectionLists) {
    for (const section of list as unknown[]) {
      const s = section as { type?: unknown; email?: unknown } | null
      if (s?.type === 'contact') {
        const email = sanitizeReplyTo(typeof s.email === 'string' ? s.email : '')
        if (email) return email
      }
    }
  }
  return undefined
}

function readBank(config: unknown): BankTransferInfo | undefined {
  if (!config || typeof config !== 'object') return undefined
  const c = config as Record<string, unknown>
  const bank: BankTransferInfo = {
    bankName: str(c.bank_name) || undefined,
    accountHolder: str(c.account_holder) || undefined,
    iban: str(c.iban) || undefined,
    instructions: str(c.instructions) || undefined,
  }
  return Object.values(bank).some(Boolean) ? bank : undefined
}

async function sendOnce(input: {
  ownerId: string
  dedupeKey: string
  type: string
  to: string
  fromName: string
  replyTo?: string
  email: { subject: string; html: string; text: string }
}): Promise<void> {
  const claimed = await claimNotification({
    userId: input.ownerId,
    type: input.type,
    subject: 'Store order email',
    body: null,
    dedupeKey: input.dedupeKey,
  })
  if (!claimed) return

  const sent = await sendTransactionalEmail({
    to: input.to,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
    replyTo: input.replyTo,
    fromName: input.fromName,
  })
  if (!sent) await releaseNotificationClaim(input.dedupeKey)
}

/**
 * Sends the buyer confirmation and the owner "new order" email for an order,
 * at most once each (claimed by `store-order:<id>:<role>` dedupe keys). Safe to
 * call from several places (checkout, webhook, redelivery): it reads the
 * current order state and does nothing when no email is due. A failed send
 * releases its claim so a later call can retry. Logs ids only, never PII.
 */
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  const admin = createAdminClient()

  const { data: order } = await admin
    .from('ecommerce_orders')
    .select(
      'id, project_id, customer_name, customer_email, customer_phone, shipping_address, subtotal_cents, shipping_cents, total_cents, currency, payment_provider, payment_status',
    )
    .eq('id', orderId)
    .maybeSingle<OrderRow>()
  if (!order) return

  const buyerKind = buyerKindFor(order.payment_status, order.payment_provider)
  if (!buyerKind) return

  const { data: project } = await admin
    .from('projects')
    .select('id, slug, name, owner_id, schema_data')
    .eq('id', order.project_id)
    .maybeSingle()
  if (!project) return

  const [{ data: items }, { data: pay }, ownerRes] = await Promise.all([
    admin
      .from('ecommerce_order_items')
      .select('name, quantity, line_total_cents')
      .eq('order_id', order.id),
    admin
      .from('ecommerce_payment_settings')
      .select('public_config')
      .eq('project_id', project.id)
      .maybeSingle(),
    admin.auth.admin.getUserById(project.owner_id),
  ])

  const schema = project.schema_data as { meta?: { language?: unknown } } | null
  const lang = resolveEmailLang(schema?.meta?.language)
  const storeName = project.name || project.slug
  const contactEmail = findContactEmail(project.schema_data)
  const ownerEmail = ownerRes.data?.user?.email ?? ''

  const base: Omit<OrderEmailData, 'kind'> = {
    lang,
    storeName,
    orderNumber: order.id.slice(0, 8).toUpperCase(),
    items: items ?? [],
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    totalCents: order.total_cents,
    currency: order.currency,
    paymentLabel: buyerMethodName(order.payment_provider, lang),
    customerName: order.customer_name ?? '',
  }

  try {
    const buyerTo = (order.customer_email ?? '').trim()
    if (buyerTo) {
      const token = issueOrderAccessToken(order.id)
      const orderUrl = `${tenantUrl(project.slug)}${buildOrderPath(project.slug, order.id, token).replace(`/site/${project.slug}`, '')}`
      const email = renderOrderEmail({
        ...base,
        kind: buyerKind,
        customerName: firstNameOf(order.customer_name),
        orderUrl,
        bank: buyerKind === 'buyer-pending' ? readBank(pay?.public_config) : undefined,
      })
      await sendOnce({
        ownerId: project.owner_id,
        dedupeKey: `store-order:${order.id}:${buyerKind === 'buyer-paid' ? 'buyer' : 'buyer-pending'}`,
        type: 'store_order_buyer',
        to: buyerTo,
        fromName: storeName,
        replyTo: contactEmail,
        email,
      })
    }
  } catch (error) {
    console.log('[v0] store order buyer email failed:', order.id, (error as Error).message)
  }

  try {
    if (ownerEmail) {
      const email = renderOrderEmail({
        ...base,
        kind: 'owner',
        customerEmail: order.customer_email ?? undefined,
        customerPhone: order.customer_phone ?? undefined,
        shippingAddress: formatShippingAddress(order.shipping_address) || undefined,
        dashboardUrl: `${DASHBOARD_ORIGIN}/ecommerce/${project.id}/orders`,
      })
      await sendOnce({
        ownerId: project.owner_id,
        dedupeKey: `store-order:${order.id}:owner`,
        type: 'store_order_owner',
        to: ownerEmail,
        fromName: storeName,
        replyTo: sanitizeReplyTo(order.customer_email),
        email,
      })
    }
  } catch (error) {
    console.log('[v0] store order owner email failed:', order.id, (error as Error).message)
  }
}

/**
 * Runs `notifyOrderPlaced` after the response is sent so checkout and webhook
 * acknowledgements never wait on email delivery. Failures are swallowed.
 */
export function scheduleOrderNotification(orderId: string): void {
  const run = async () => {
    try {
      await notifyOrderPlaced(orderId)
    } catch (error) {
      console.log('[v0] store order notification failed:', orderId, (error as Error).message)
    }
  }
  try {
    after(run)
  } catch {
    void run()
  }
}
