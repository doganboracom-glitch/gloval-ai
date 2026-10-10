import 'server-only'

import {
  escape,
  renderEmailLayout,
  renderEmailPlainText,
  renderSection,
  renderTable,
} from '@/lib/email/layout'
import type { EmailLang } from '@/lib/email/lang'
import { formatPrice } from '@/lib/format'

export type OrderEmailKind = 'buyer-paid' | 'buyer-pending' | 'owner'

export type OrderEmailItem = {
  name: string
  quantity: number
  line_total_cents: number
}

export type BankTransferInfo = {
  bankName?: string
  accountHolder?: string
  iban?: string
  instructions?: string
}

export type OrderEmailData = {
  kind: OrderEmailKind
  lang: EmailLang
  storeName: string
  /** Short, human order number (first 8 chars of the order id). */
  orderNumber: string
  items: OrderEmailItem[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
  currency: string
  paymentLabel: string
  customerName: string
  /** Owner mail only: contact details of the buyer. */
  customerEmail?: string
  customerPhone?: string
  shippingAddress?: string
  /** Buyer: link to the order page (tenant URL + signed token). */
  orderUrl?: string
  /** Owner: link to the order list in the dashboard. */
  dashboardUrl?: string
  bank?: BankTransferInfo
}

export type RenderedOrderEmail = { subject: string; html: string; text: string }

type Copy = {
  subject: (store: string, no: string) => string
  title: string
  preview: (store: string, no: string) => string
  intro: (name: string, store: string) => string
  cta: string
  summary: string
  rows: {
    order: string
    payment: string
    subtotal: string
    shipping: string
    total: string
    customer: string
    email: string
    phone: string
    address: string
  }
  items: string
  bankTitle: string
  bank: { bank: string; holder: string; iban: string; note: string }
  bankHint: (no: string) => string
  footer: (store: string) => string
}

const BUYER_PAID: Record<EmailLang, Copy> = {
  tr: {
    subject: (s, n) => `${s} siparişiniz alındı (#${n})`,
    title: 'Siparişiniz alındı',
    preview: (s, n) => `${s} - #${n} numaralı siparişiniz için ödemeniz onaylandı.`,
    intro: (name, s) => `Merhaba ${name}, ${s} mağazasındaki siparişiniz için ödemeniz onaylandı. Siparişinizi hazırlamaya başlıyoruz.`,
    cta: 'Siparişi görüntüle',
    summary: 'Sipariş özeti',
    rows: { order: 'Sipariş no', payment: 'Ödeme', subtotal: 'Ara toplam', shipping: 'Kargo', total: 'Toplam', customer: 'Müşteri', email: 'E-posta', phone: 'Telefon', address: 'Teslimat adresi' },
    items: 'Ürünler',
    bankTitle: '', bank: { bank: '', holder: '', iban: '', note: '' }, bankHint: () => '',
    footer: (s) => `Bu e-posta, ${s} mağazasında sipariş verdiğiniz için gönderildi.`,
  },
  en: {
    subject: (s, n) => `${s}: we received your order (#${n})`,
    title: 'We received your order',
    preview: (s, n) => `${s} - payment for order #${n} is confirmed.`,
    intro: (name, s) => `Hi ${name}, your payment for your order at ${s} is confirmed. We are getting it ready.`,
    cta: 'View order',
    summary: 'Order summary',
    rows: { order: 'Order no', payment: 'Payment', subtotal: 'Subtotal', shipping: 'Shipping', total: 'Total', customer: 'Customer', email: 'Email', phone: 'Phone', address: 'Shipping address' },
    items: 'Items',
    bankTitle: '', bank: { bank: '', holder: '', iban: '', note: '' }, bankHint: () => '',
    footer: (s) => `This email was sent because you placed an order at ${s}.`,
  },
}

const BUYER_PENDING: Record<EmailLang, Copy> = {
  tr: {
    ...BUYER_PAID.tr,
    subject: (s, n) => `${s} siparişiniz alındı, ödeme bekleniyor (#${n})`,
    title: 'Siparişiniz alındı, ödemenizi bekliyoruz',
    preview: (s, n) => `${s} - #${n} numaralı sipariş için havale/EFT bekleniyor.`,
    intro: (name, s) => `Merhaba ${name}, ${s} mağazasındaki siparişinizi aldık. Ödemeniz onaylandığında siparişinizi hazırlamaya başlayacağız.`,
    bankTitle: 'Havale / EFT bilgileri',
    bank: { bank: 'Banka', holder: 'Hesap sahibi', iban: 'IBAN', note: 'Açıklama' },
    bankHint: (n) => `Havale açıklamasına sipariş numaranızı (#${n}) yazmanızı rica ederiz.`,
  },
  en: {
    ...BUYER_PAID.en,
    subject: (s, n) => `${s}: order received, awaiting payment (#${n})`,
    title: 'We received your order and await payment',
    preview: (s, n) => `${s} - bank transfer is awaited for order #${n}.`,
    intro: (name, s) => `Hi ${name}, we received your order at ${s}. We will start preparing it once your payment is confirmed.`,
    bankTitle: 'Bank transfer details',
    bank: { bank: 'Bank', holder: 'Account holder', iban: 'IBAN', note: 'Notes' },
    bankHint: (n) => `Please include your order number (#${n}) in the transfer description.`,
  },
}

const OWNER: Record<EmailLang, Copy> = {
  tr: {
    ...BUYER_PAID.tr,
    subject: (s, n) => `Yeni sipariş: ${s} (#${n})`,
    title: 'Yeni siparişiniz var',
    preview: (s, n) => `${s} mağazanıza #${n} numaralı yeni bir sipariş geldi.`,
    intro: (_n, s) => `${s} mağazanıza yeni bir sipariş geldi. Ayrıntılar aşağıdadır.`,
    cta: 'Siparişi yönet',
    footer: (s) => `Bu e-posta, ${s} mağazanızda yeni sipariş oluştuğu için GLOVAL AI tarafından gönderildi.`,
  },
  en: {
    ...BUYER_PAID.en,
    subject: (s, n) => `New order: ${s} (#${n})`,
    title: 'You have a new order',
    preview: (s, n) => `A new order #${n} arrived at ${s}.`,
    intro: (_n, s) => `A new order arrived at your store ${s}. Details are below.`,
    cta: 'Manage order',
    footer: (s) => `This email was sent by GLOVAL AI because a new order was placed at ${s}.`,
  },
}

function copyFor(kind: OrderEmailKind, lang: EmailLang): Copy {
  const table = kind === 'owner' ? OWNER : kind === 'buyer-pending' ? BUYER_PENDING : BUYER_PAID
  return table[lang]
}

function itemsTable(items: OrderEmailItem[], currency: string): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e7e1ee;font-size:14px;">${escape(i.name)} <span style="color:#6b6473;">x ${i.quantity}</span></td><td align="right" style="padding:8px 0;border-bottom:1px solid #e7e1ee;font-size:14px;white-space:nowrap;">${escape(formatPrice(i.line_total_cents, currency))}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>`
}

export function renderOrderEmail(data: OrderEmailData): RenderedOrderEmail {
  const c = copyFor(data.kind, data.lang)
  const isOwner = data.kind === 'owner'
  const money = (cents: number) => formatPrice(cents, data.currency)

  const summaryRows: Array<[string, string]> = [
    [c.rows.order, `#${data.orderNumber}`],
    [c.rows.payment, data.paymentLabel],
    [c.rows.subtotal, money(data.subtotalCents)],
    [c.rows.shipping, money(data.shippingCents)],
    [c.rows.total, money(data.totalCents)],
  ]

  const customerRows: Array<[string, string]> = []
  if (isOwner) {
    customerRows.push([c.rows.customer, data.customerName])
    if (data.customerEmail) customerRows.push([c.rows.email, data.customerEmail])
    if (data.customerPhone) customerRows.push([c.rows.phone, data.customerPhone])
    if (data.shippingAddress) customerRows.push([c.rows.address, data.shippingAddress])
  }

  const bankRows: Array<[string, string]> = []
  if (data.kind === 'buyer-pending' && data.bank) {
    if (data.bank.bankName) bankRows.push([c.bank.bank, data.bank.bankName])
    if (data.bank.accountHolder) bankRows.push([c.bank.holder, data.bank.accountHolder])
    if (data.bank.iban) bankRows.push([c.bank.iban, data.bank.iban])
    if (data.bank.instructions) bankRows.push([c.bank.note, data.bank.instructions])
  }

  const body =
    `<p style="margin:0 0 8px;">${escape(c.intro(data.customerName, data.storeName))}</p>` +
    renderSection(c.items, itemsTable(data.items, data.currency)) +
    renderTable(summaryRows) +
    (customerRows.length > 0 ? renderTable(customerRows) : '') +
    (bankRows.length > 0
      ? renderSection(c.bankTitle, renderTable(bankRows)) +
        `<p style="margin:0;font-size:14px;">${escape(c.bankHint(data.orderNumber))}</p>`
      : '')

  const href = isOwner ? data.dashboardUrl : data.orderUrl

  const html = renderEmailLayout({
    lang: data.lang,
    previewText: c.preview(data.storeName, data.orderNumber),
    title: c.title,
    body,
    cta: href ? { label: c.cta, href } : undefined,
    footer: c.footer(data.storeName),
  })

  const lines = [
    c.intro(data.customerName, data.storeName),
    '',
    ...data.items.map((i) => `- ${i.name} x ${i.quantity}: ${money(i.line_total_cents)}`),
    '',
    ...[...summaryRows, ...customerRows, ...bankRows].map(([k, v]) => `${k}: ${v}`),
    ...(bankRows.length > 0 ? ['', c.bankHint(data.orderNumber)] : []),
    ...(href ? ['', `${c.cta}: ${href}`] : []),
  ]
  const text = renderEmailPlainText(c.title, lines.join('\n'), c.footer(data.storeName))

  return { subject: c.subject(data.storeName, data.orderNumber), html, text }
}
