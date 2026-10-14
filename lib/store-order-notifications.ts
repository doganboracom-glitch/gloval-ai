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
import { buyerMethodName } from '@/lib/payments/methods'
import {
  isDemoStore,
  isManualStoreProvider,
  readBankTransferConfig,
  type BankTransferConfig,
} from '@/lib/store-payment-policy'
import { buildBankTransferInstructions, formatBankDueDate } from '@/lib/bank-transfer-instructions'
import { formatIban } from '@/lib/iban'
import { orderCodFeeCents } from '@/lib/store-checkout-rules'
import { orderNotificationDedupeKey } from '@/lib/store-shipping-core'
import { readOrderItems } from '@/lib/store-order-items'
import { loadDemoStoreIds } from '@/lib/store-demo'
import { buildTrackingUrl, carrierName } from '@/lib/shipping-carriers'
import { firstNameOf } from '@/lib/store-order-privacy'
import { orderStatusUrl } from '@/lib/store-order-access'
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
  cod_fee_cents?: number | null
  total_cents: number
  currency: string
  payment_provider: string
  payment_status: string
  status: string
  created_at: string
}

/** Which buyer email an order is entitled to right now, if any. */
export function buyerKindFor(
  paymentStatus: string,
  paymentProvider: string,
): Extract<OrderEmailKind, 'buyer-paid' | 'buyer-pending'> | null {
  if (paymentStatus === 'paid') return 'buyer-paid'
  if (paymentStatus === 'pending' && isManualStoreProvider(paymentProvider)) return 'buyer-pending'
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

function toEmailBank(
  config: BankTransferConfig | null,
  order: OrderRow,
  lang: 'tr' | 'en',
): BankTransferInfo | undefined {
  const data = buildBankTransferInstructions(config, order)
  if (!data) return undefined
  return {
    bankName: data.bankName || undefined,
    accountHolder: data.accountHolder || undefined,
    iban: formatIban(data.iban),
    instructions: data.instructions || undefined,
    reference: `#${data.reference}`,
    dueDate: formatBankDueDate(data.dueAt, lang),
  }
}

export async function sendOnce(input: {
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
  // A failed send must not keep the claim, or no later call could ever deliver it.
  if (!sent) {
    console.error('[store-notify] email send failed, claim released', { key: input.dedupeKey })
    await releaseNotificationClaim(input.dedupeKey)
  }
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

  const { data: order, error: orderError } = await admin
    .from('ecommerce_orders')
    .select(
      'id, project_id, customer_name, customer_email, customer_phone, shipping_address, subtotal_cents, shipping_cents, total_cents, currency, payment_provider, payment_status, status, created_at',
    )
    .eq('id', orderId)
    .maybeSingle<OrderRow>()
  if (orderError) {
    console.error('[store-notify] order lookup failed', { orderId, code: orderError.code })
    return
  }
  if (!order) return

  const buyerKind = buyerKindFor(order.payment_status, order.payment_provider)
  if (!buyerKind) return

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, slug, name, owner_id, schema_data')
    .eq('id', order.project_id)
    .maybeSingle()
  if (projectError) {
    console.error('[store-notify] project lookup failed', { orderId, code: projectError.code })
    return
  }
  if (!project) return

  // Demo stores never e-mail anyone (neither buyer nor owner): their orders are
  // made-up and the "buyer" address is whatever a visitor typed.
  if (isDemoStore(project.id, await loadDemoStoreIds(admin, project.id))) return

  const [items, { data: pay }, ownerRes] = await Promise.all([
    readOrderItems<{ name: string; quantity: number; line_total_cents: number }>(
      admin,
      order.id,
      'name, quantity, line_total_cents',
    ),
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
    items,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    codFeeCents: orderCodFeeCents(order),
    totalCents: order.total_cents,
    currency: order.currency,
    paymentLabel: buyerMethodName(order.payment_provider, lang),
    customerName: order.customer_name ?? '',
  }

  try {
    const buyerTo = (order.customer_email ?? '').trim()
    if (buyerTo) {
      const orderUrl = orderStatusUrl(project.slug, order.id)
      const email = renderOrderEmail({
        ...base,
        kind: buyerKind,
        customerName: firstNameOf(order.customer_name),
        orderUrl,
        bank:
          buyerKind === 'buyer-pending' && order.payment_provider === 'bank_transfer'
            ? toEmailBank(readBankTransferConfig(pay?.public_config), order, lang === 'en' ? 'en' : 'tr')
            : undefined,
        bankTransfer: order.payment_provider === 'bank_transfer',
        cashOnDelivery: order.payment_provider === 'cash_on_delivery',
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
        paymentPending: order.payment_status === 'pending',
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Tells the store owner, once per order, that a payment was received but the
 * order could not be completed (flagged by `recordSettleFailure`). The dedupe
 * key makes repeated calls harmless; a failed send releases its claim so the
 * next call retries. Logs ids only, never PII.
 */
export async function notifyOrderAttention(
  orderId: string,
  kind: 'settle' | 'refund' = 'settle',
): Promise<void> {
  const admin = createAdminClient()

  const { data: order, error: orderError } = await admin
    .from('ecommerce_orders')
    .select('id, project_id, total_cents, currency, provider_payment_id')
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) {
    console.error('[store-notify] attention order lookup failed', { orderId, code: orderError.code })
    return
  }
  if (!order) return

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, slug, name, owner_id')
    .eq('id', order.project_id)
    .maybeSingle()
  if (projectError || !project) {
    if (projectError) console.error('[store-notify] attention project lookup failed', { orderId, code: projectError.code })
    return
  }

  const ownerRes = await admin.auth.admin.getUserById(project.owner_id)
  const ownerEmail = ownerRes.data?.user?.email ?? ''
  if (!ownerEmail) return

  const storeName = project.name || project.slug
  const number = order.id.slice(0, 8).toUpperCase()
  const paymentId = order.provider_payment_id ? String(order.provider_payment_id) : ''
  const amount = `${(order.total_cents / 100).toFixed(2)} ${order.currency}`
  const url = `${DASHBOARD_ORIGIN}/ecommerce/${project.id}/orders`

  const headline =
    kind === 'refund'
      ? `#${number} numaralı siparişin iyzico iadesi yapıldı ancak sipariş kaydı veya stok/bildirim adımı tamamlanamadı.`
      : `#${number} numaralı siparişin ödemesi alındı ancak sipariş tamamlanamadı.`
  const subject =
    kind === 'refund'
      ? `Dikkat: #${number} siparişinin iadesi yapıldı, işlem tamamlanamadı`
      : `Dikkat: #${number} siparişinin ödemesi alındı, işlem tamamlanamadı`

  const text = [
    `${storeName}: ${headline}`,
    `Tutar: ${amount}`,
    paymentId ? `iyzico paymentId: ${paymentId}` : '',
    'Sistem siparişi otomatik olarak tekrar denemeye devam ediyor. Çözülmezse Siparişler panelinden kontrol edin.',
    url,
  ]
    .filter(Boolean)
    .join('\n')
  const html = `<p><strong>Dikkat gerekiyor:</strong> ${escapeHtml(storeName)} mağazanızda ${escapeHtml(headline)}</p>
<p>Tutar: ${escapeHtml(amount)}${paymentId ? `<br>iyzico paymentId: <code>${escapeHtml(paymentId)}</code>` : ''}</p>
<p>Sistem siparişi otomatik olarak tekrar denemeye devam ediyor. Çözülmezse <a href="${url}">Siparişler panelinden</a> kontrol edin.</p>`

  await sendOnce({
    ownerId: project.owner_id,
    dedupeKey: `store-order:${order.id}:${kind === 'refund' ? 'owner-refund-attention' : 'owner-attention'}`,
    type: 'store_order_attention',
    to: ownerEmail,
    fromName: storeName,
    email: { subject, html, text },
  })
}

/**
 * Tells the buyer, once per order, that their card payment was refunded.
 * Returns false only when a send was due but failed (the caller flags the order
 * and the reconciliation retries); true when sent, already sent, or not due
 * (no address, demo store, order not refunded). Logs ids only, never PII.
 */
export async function notifyOrderRefunded(orderId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data: order, error: orderError } = await admin
      .from('ecommerce_orders')
      .select('id, project_id, customer_email, total_cents, currency, payment_status')
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) {
      console.error('[store-notify] refund order lookup failed', { orderId, code: orderError.code })
      return false
    }
    if (!order || order.payment_status !== 'refunded') return true
    const to = String(order.customer_email ?? '').trim()
    if (!to) return true

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, slug, name, owner_id, schema_data')
      .eq('id', order.project_id)
      .maybeSingle()
    if (projectError) return false
    if (!project) return true
    if (isDemoStore(project.id, await loadDemoStoreIds(admin, project.id))) return true

    const schema = project.schema_data as { meta?: { language?: unknown } } | null
    const lang = resolveEmailLang(schema?.meta?.language)
    const storeName = project.name || project.slug
    const number = order.id.slice(0, 8).toUpperCase()
    const amount = `${(order.total_cents / 100).toFixed(2)} ${order.currency}`
    const copy =
      lang === 'en'
        ? {
            subject: `${storeName}: your payment for order #${number} was refunded`,
            body: `Your card payment of ${amount} for order #${number} at ${storeName} has been refunded. Depending on your bank, it can take a few business days to appear on your statement.`,
          }
        : {
            subject: `${storeName}: #${number} numaralı siparişinizin ödemesi iade edildi`,
            body: `${storeName} mağazasındaki #${number} numaralı siparişiniz için ${amount} tutarındaki kart ödemeniz iade edildi. Bankanıza bağlı olarak tutarın hesap özetinize yansıması birkaç iş günü sürebilir.`,
          }

    const before = await sendOnceResult({
      ownerId: project.owner_id,
      dedupeKey: `store-order:${order.id}:buyer-refund`,
      type: 'store_order_buyer',
      to,
      fromName: storeName,
      replyTo: findContactEmail(project.schema_data),
      email: { subject: copy.subject, html: `<p>${escapeHtml(copy.body)}</p>`, text: copy.body },
    })
    return before
  } catch (error) {
    console.error('[store-notify] refund e-mail failed', {
      orderId,
      message: error instanceof Error ? error.message : 'unknown',
    })
    return false
  }
}

/** `sendOnce`, reporting whether a due e-mail failed to go out. */
async function sendOnceResult(input: Parameters<typeof sendOnce>[0]): Promise<boolean> {
  const claimed = await claimNotification({
    userId: input.ownerId,
    type: input.type,
    subject: 'Store order email',
    body: null,
    dedupeKey: input.dedupeKey,
  })
  if (!claimed) return true
  const sent = await sendTransactionalEmail({
    to: input.to,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
    replyTo: input.replyTo,
    fromName: input.fromName,
  })
  if (!sent) {
    console.error('[store-notify] email send failed, claim released', { key: input.dedupeKey })
    await releaseNotificationClaim(input.dedupeKey)
  }
  return Boolean(sent)
}

/**
 * E-mails the buyer that the order is on its way. At most once per distinct
 * carrier + tracking code (the dedupe key contains both), so a double click
 * never sends twice while a corrected code can be announced again. Sends
 * nothing for orders without an e-mail address, demo stores, or orders that
 * are not shipped. Logs ids only, never PII.
 */
export async function notifyOrderShipped(orderId: string, kind: 'buyer-shipped' | 'buyer-delivered' = 'buyer-shipped'): Promise<void> {
  const admin = createAdminClient()

  const { data: order, error: orderError } = await admin
    .from('ecommerce_orders')
    .select(
      'id, project_id, customer_name, customer_email, subtotal_cents, shipping_cents, total_cents, currency, payment_provider, shipping_status, tracking_carrier, tracking_number',
    )
    .eq('id', orderId)
    .maybeSingle()
  if (orderError) {
    console.error('[store-notify] order lookup failed', { orderId, code: orderError.code })
    return
  }
  if (!order) return

  const buyerTo = (order.customer_email ?? '').trim()
  const carrier = (order.tracking_carrier as string | null) ?? ''
  const code = (order.tracking_number as string | null) ?? ''
  if (!buyerTo || !carrier || !code) return
  if (order.shipping_status !== 'shipped' && order.shipping_status !== 'in_transit' && order.shipping_status !== 'delivered') {
    return
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, slug, name, owner_id, schema_data')
    .eq('id', order.project_id)
    .maybeSingle()
  if (projectError) {
    console.error('[store-notify] project lookup failed', { orderId, code: projectError.code })
    return
  }
  if (!project) return
  if (isDemoStore(project.id, await loadDemoStoreIds(admin, project.id))) return

  const items = await readOrderItems<{ name: string; quantity: number; line_total_cents: number }>(
    admin,
    order.id,
    'name, quantity, line_total_cents',
  )

  const schema = project.schema_data as { meta?: { language?: unknown } } | null
  const lang = resolveEmailLang(schema?.meta?.language)
  const storeName = project.name || project.slug
  const orderUrl = orderStatusUrl(project.slug, order.id)

  const email = renderOrderEmail({
    kind,
    lang,
    storeName,
    orderNumber: order.id.slice(0, 8).toUpperCase(),
    items,
    subtotalCents: order.subtotal_cents,
    shippingCents: order.shipping_cents,
    codFeeCents: orderCodFeeCents(order),
    totalCents: order.total_cents,
    currency: order.currency,
    paymentLabel: buyerMethodName(order.payment_provider, lang),
    customerName: firstNameOf(order.customer_name),
    orderUrl,
    carrierName: carrierName(carrier),
    trackingNumber: code,
    trackingUrl: buildTrackingUrl(carrier, code),
  })

  await sendOnce({
    ownerId: project.owner_id,
    dedupeKey: `store-order:${order.id}:${kind === 'buyer-delivered' ? 'delivered' : 'shipped'}`,
    type: kind === 'buyer-delivered' ? 'store_order_delivered' : 'store_order_shipped',
    to: buyerTo,
    fromName: storeName,
    replyTo: findContactEmail(project.schema_data),
    email,
  })
}

/** Fire-and-forget wrapper: never delays or fails the owner's click. */
export function scheduleDeliveredNotification(orderId: string): void {
  const run = async () => {
    try {
      await notifyOrderShipped(orderId, 'buyer-delivered')
    } catch (error) {
      console.log('[v0] store delivered notification failed:', orderId, (error as Error).message)
    }
  }
  try { after(run) } catch { void run() }
}

export function scheduleShippedNotification(orderId: string): void {
  const run = async () => {
    try {
      await notifyOrderShipped(orderId)
    } catch (error) {
      console.log('[v0] store shipped notification failed:', orderId, (error as Error).message)
    }
  }
  try {
    after(run)
  } catch {
    void run()
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
