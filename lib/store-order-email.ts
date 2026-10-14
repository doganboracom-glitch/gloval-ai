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
import { formatVatLine, summarizeVat } from '@/lib/store-vat'
import { COD_RECEIVED_COPY } from '@/lib/customer-order-status'
import { BANK_DETAILS_MISSING_COPY } from '@/lib/bank-transfer-instructions'

export type OrderEmailKind = 'buyer-paid' | 'buyer-pending' | 'buyer-shipped' | 'buyer-delivered' | 'owner'

export type OrderEmailItem = {
  name: string
  quantity: number
  line_total_cents: number
  vat_rate?: number | null
  vat_cents?: number | null
}

export type BankTransferInfo = {
  bankName?: string
  accountHolder?: string
  iban?: string
  instructions?: string
  /** Order number to put in the transfer description. */
  reference?: string
  /** Last day to pay, already formatted for the e-mail language. */
  dueDate?: string
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
  /** Cash-on-delivery surcharge; its own line only when above 0. */
  codFeeCents?: number
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
  /** Pending buyer mail for a bank-transfer order; with no `bank` the mail tells the buyer to contact the store. */
  bankTransfer?: boolean
  /** Owner mail: the order is placed but not yet paid (bank transfer / COD). */
  paymentPending?: boolean
  /** Pending buyer mail: payment is made on delivery, no bank details apply. */
  cashOnDelivery?: boolean
  /** Shipped buyer mail: carrier display name and tracking code. */
  carrierName?: string
  trackingNumber?: string
  /** Carrier tracking page for the code; absent when the carrier has no known link. */
  trackingUrl?: string | null
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
    codFee: string
    total: string
    vat: string
    customer: string
    email: string
    phone: string
    address: string
  }
  items: string
  bankTitle: string
  bank: { bank: string; holder: string; iban: string; note: string; ref: string; due: string }
  ctaBank: string
  bankHint: (no: string) => string
  bankMissing: string
  shippedRows: { carrier: string; code: string }
  trackCta: string
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
    rows: { order: 'Sipariş no', payment: 'Ödeme', subtotal: 'Ara toplam', shipping: 'Kargo', codFee: 'Kapıda ödeme ücreti', total: 'Toplam', vat: 'KDV', customer: 'Müşteri', email: 'E-posta', phone: 'Telefon', address: 'Teslimat adresi' },
    items: 'Ürünler',
    bankTitle: '', bank: { bank: '', holder: '', iban: '', note: '', ref: '', due: '' }, ctaBank: '', bankHint: () => '',
    bankMissing: BANK_DETAILS_MISSING_COPY.tr.body,
    shippedRows: { carrier: 'Kargo firması', code: 'Takip numarası' },
    trackCta: 'Kargoyu takip et',
    footer: (s) => `Bu e-posta, ${s} mağazasında sipariş verdiğiniz için gönderildi.`,
  },
  en: {
    subject: (s, n) => `${s}: we received your order (#${n})`,
    title: 'We received your order',
    preview: (s, n) => `${s} - payment for order #${n} is confirmed.`,
    intro: (name, s) => `Hi ${name}, your payment for your order at ${s} is confirmed. We are getting it ready.`,
    cta: 'View order',
    summary: 'Order summary',
    rows: { order: 'Order no', payment: 'Payment', subtotal: 'Subtotal', shipping: 'Shipping', codFee: 'Cash on delivery fee', total: 'Total', vat: 'VAT', customer: 'Customer', email: 'Email', phone: 'Phone', address: 'Shipping address' },
    items: 'Items',
    bankTitle: '', bank: { bank: '', holder: '', iban: '', note: '', ref: '', due: '' }, ctaBank: '', bankHint: () => '',
    bankMissing: BANK_DETAILS_MISSING_COPY.en.body,
    shippedRows: { carrier: 'Carrier', code: 'Tracking number' },
    trackCta: 'Track shipment',
    footer: (s) => `This email was sent because you placed an order at ${s}.`,
  },
}

const BUYER_SHIPPED: Record<EmailLang, Copy> = {
  tr: {
    ...BUYER_PAID.tr,
    subject: (s, n) => `${s} siparişiniz kargoya verildi (#${n})`,
    title: 'Siparişiniz kargoya verildi',
    preview: (s, n) => `${s} - #${n} numaralı siparişiniz kargoya verildi.`,
    intro: (name, s) => `Merhaba ${name}, ${s} mağazasındaki siparişiniz kargoya verildi. Takip bilgileri aşağıdadır.`,
  },
  en: {
    ...BUYER_PAID.en,
    subject: (s, n) => `${s}: your order has shipped (#${n})`,
    title: 'Your order has shipped',
    preview: (s, n) => `${s} - order #${n} is on its way.`,
    intro: (name, s) => `Hi ${name}, your order at ${s} has shipped. Tracking details are below.`,
  },
}

const BUYER_DELIVERED: Record<EmailLang, Copy> = {
  tr: {
    ...BUYER_SHIPPED.tr,
    subject: (s, n) => `${s} siparişiniz teslim edildi (#${n})`,
    title: 'Siparişiniz teslim edildi',
    preview: (s, n) => `${s} - #${n} numaralı siparişiniz teslim edildi.`,
    intro: (name, s) => `Merhaba ${name}, ${s} mağazasındaki siparişiniz teslim edildi.`,
    cta: 'Siparişi görüntüle',
  },
  en: {
    ...BUYER_SHIPPED.en,
    subject: (s, n) => `${s}: your order was delivered (#${n})`,
    title: 'Your order was delivered',
    preview: (s, n) => `${s} - order #${n} was delivered.`,
    intro: (name, s) => `Hi ${name}, your order at ${s} was delivered.`,
    cta: 'View order',
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
    bank: { bank: 'Banka', holder: 'Hesap sahibi', iban: 'IBAN', note: 'Not', ref: 'Açıklama', due: 'Son ödeme tarihi' },
    ctaBank: 'Havale bilgilerini görüntüle',
    bankHint: (n) => `Havale açıklamasına sipariş numaranızı (#${n}) yazmanızı rica ederiz. Süresi içinde ödenmeyen sipariş otomatik iptal edilir.`,
  },
  en: {
    ...BUYER_PAID.en,
    subject: (s, n) => `${s}: order received, awaiting payment (#${n})`,
    title: 'We received your order and await payment',
    preview: (s, n) => `${s} - bank transfer is awaited for order #${n}.`,
    intro: (name, s) => `Hi ${name}, we received your order at ${s}. We will start preparing it once your payment is confirmed.`,
    bankTitle: 'Bank transfer details',
    bank: { bank: 'Bank', holder: 'Account holder', iban: 'IBAN', note: 'Note', ref: 'Description', due: 'Payment due by' },
    ctaBank: 'View bank transfer details',
    bankHint: (n) => `Please include your order number (#${n}) in the transfer description. An order that is not paid in time is cancelled automatically.`,
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

const OWNER_PENDING: Record<EmailLang, Copy> = {
  tr: {
    ...OWNER.tr,
    subject: (s, n) => `Yeni sipariş (ödeme bekleniyor): ${s} (#${n})`,
    title: 'Yeni sipariş, ödeme bekleniyor',
    preview: (s, n) => `${s} mağazanıza #${n} numaralı sipariş geldi, ödeme henüz alınmadı.`,
    intro: (_n, s) =>
      `${s} mağazanıza yeni bir sipariş geldi; ödeme henüz alınmadı. Ödemeyi aldığınızda sipariş ekranından "Ödemeyi onayla" deyin.`,
  },
  en: {
    ...OWNER.en,
    subject: (s, n) => `New order (awaiting payment): ${s} (#${n})`,
    title: 'New order, awaiting payment',
    preview: (s, n) => `A new order #${n} arrived at ${s}; payment is not received yet.`,
    intro: (_n, s) =>
      `A new order arrived at ${s}; payment has not been received yet. Once you receive it, use "Confirm payment" on the orders screen.`,
  },
}

const BUYER_COD: Record<EmailLang, Copy> = {
  tr: {
    ...BUYER_PENDING.tr,
    subject: (s, n) => `${s} siparişiniz alındı (#${n})`,
    title: COD_RECEIVED_COPY.tr.title,
    preview: (s, n) => `${s} - #${n} numaralı siparişiniz alındı, ödeme teslimatta alınacak.`,
    intro: (name, s) => `Merhaba ${name}, ${s} mağazasındaki siparişinizi aldık. ${COD_RECEIVED_COPY.tr.description}`,
    ctaBank: '',
  },
  en: {
    ...BUYER_PENDING.en,
    subject: (s, n) => `${s}: we received your order (#${n})`,
    title: COD_RECEIVED_COPY.en.title,
    preview: (s, n) => `${s} - order #${n} was received, payment is due on delivery.`,
    intro: (name, s) => `Hi ${name}, we received your order at ${s}. ${COD_RECEIVED_COPY.en.description}`,
    ctaBank: '',
  },
}

function copyFor(data: OrderEmailData): Copy {
  const { kind, lang } = data
  if (kind === 'owner') return (data.paymentPending ? OWNER_PENDING : OWNER)[lang]
  if (kind === 'buyer-shipped') return BUYER_SHIPPED[lang]
  if (kind === 'buyer-delivered') return BUYER_DELIVERED[lang]
  if (kind === 'buyer-pending') return (data.cashOnDelivery ? BUYER_COD : BUYER_PENDING)[lang]
  return BUYER_PAID[lang]
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
  const c = copyFor(data)
  const isOwner = data.kind === 'owner'
  const money = (cents: number) => formatPrice(cents, data.currency)

  const summaryRows: Array<[string, string]> = [
    [c.rows.order, `#${data.orderNumber}`],
    [c.rows.payment, data.paymentLabel],
    [c.rows.subtotal, money(data.subtotalCents)],
    [c.rows.shipping, money(data.shippingCents)],
    ...((data.codFeeCents ?? 0) > 0
      ? ([[c.rows.codFee, money(data.codFeeCents ?? 0)]] as Array<[string, string]>)
      : []),
    [c.rows.total, money(data.totalCents)],
  ]
  const vatLine = formatVatLine(summarizeVat(data.items), money, data.lang === 'en' ? 'en' : 'tr')
  if (vatLine) summaryRows.push([c.rows.vat, vatLine])

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
    if (data.bank.reference) bankRows.push([c.bank.ref, data.bank.reference])
    if (data.bank.dueDate) bankRows.push([c.bank.due, data.bank.dueDate])
    if (data.bank.instructions) bankRows.push([c.bank.note, data.bank.instructions])
  }

  const bankMissing = data.kind === 'buyer-pending' && data.bankTransfer === true && bankRows.length === 0

  const shippedRows: Array<[string, string]> = []
  if (data.kind === 'buyer-shipped' || data.kind === 'buyer-delivered') {
    if (data.carrierName) shippedRows.push([c.shippedRows.carrier, data.carrierName])
    if (data.trackingNumber) shippedRows.push([c.shippedRows.code, data.trackingNumber])
  }

  const body =
    `<p style="margin:0 0 8px;">${escape(c.intro(data.customerName, data.storeName))}</p>` +
    (shippedRows.length > 0 ? renderTable(shippedRows) : '') +
    renderSection(c.items, itemsTable(data.items, data.currency)) +
    renderTable(summaryRows) +
    (customerRows.length > 0 ? renderTable(customerRows) : '') +
    (bankRows.length > 0
      ? renderSection(c.bankTitle, renderTable(bankRows)) +
        `<p style="margin:0;font-size:14px;">${escape(c.bankHint(data.orderNumber))}</p>`
      : '') +
    (bankMissing
      ? renderSection(c.bankTitle, `<p style="margin:0;font-size:14px;">${escape(c.bankMissing)}</p>`)
      : '')

  const trackingHref = data.kind === 'buyer-shipped' ? data.trackingUrl : null
  const href = isOwner ? data.dashboardUrl : trackingHref || data.orderUrl
  const ctaLabel = trackingHref ? c.trackCta : bankRows.length > 0 && c.ctaBank ? c.ctaBank : c.cta

  const html = renderEmailLayout({
    lang: data.lang,
    previewText: c.preview(data.storeName, data.orderNumber),
    title: c.title,
    body,
    cta: href ? { label: ctaLabel, href } : undefined,
    footer: c.footer(data.storeName),
  })

  const lines = [
    c.intro(data.customerName, data.storeName),
    '',
    ...data.items.map((i) => `- ${i.name} x ${i.quantity}: ${money(i.line_total_cents)}`),
    '',
    ...[...shippedRows, ...summaryRows, ...customerRows, ...bankRows].map(([k, v]) => `${k}: ${v}`),
    ...(bankRows.length > 0 ? ['', c.bankHint(data.orderNumber)] : []),
    ...(bankMissing ? ['', c.bankMissing] : []),
    ...(href ? ['', `${ctaLabel}: ${href}`] : []),
  ]
  const text = renderEmailPlainText(c.title, lines.join('\n'), c.footer(data.storeName))

  return { subject: c.subject(data.storeName, data.orderNumber), html, text }
}
