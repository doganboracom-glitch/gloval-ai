import type { PaymentProviderId } from '@/lib/payments/types'
import { pickLang, type Lang } from '@/lib/i18n'
import { CARD_PROVIDER_IDS } from '@/lib/payments/card-providers'

/**
 * Buyer-facing + owner-facing metadata for the payment methods a Turkish
 * e-commerce store typically offers. This is the single source of truth shared
 * by the storefront checkout (which method a buyer can pick) and the owner
 * settings screen (which credentials to collect for each provider). It contains
 * NO secrets — only labels, descriptions and the shape of the config fields.
 */

export type PaymentMethodId = Extract<
  PaymentProviderId,
  'iyzico' | 'bank_transfer' | 'cash_on_delivery'
>

export type PaymentConfigField = {
  /** Stable key stored in the provider config object. */
  key: string
  label: { tr: string; en: string }
  /** `secret` fields are write-only credentials; `text` are non-secret config. */
  kind: 'text' | 'secret'
  placeholder?: string
  /** Owner must fill this before the method can go live. */
  required?: boolean
  /** Multiline (e.g. IBAN + account holder instructions). */
  multiline?: boolean
}

export type PaymentMethodMeta = {
  id: PaymentMethodId
  name: { tr: string; en: string }
  /** Short buyer-facing explanation shown under the radio option. */
  blurb: { tr: string; en: string }
  /** True when the buyer pays out of band and the owner confirms manually. */
  manual: boolean
  /** Owner credential/config fields collected in the settings screen. */
  fields: PaymentConfigField[]
}

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  {
    id: 'iyzico',
    name: { tr: 'iyzico ile Öde', en: 'Pay with iyzico' },
    blurb: {
      tr: 'Kredi/banka kartı ve taksit seçenekleri (iyzico).',
      en: 'Cards and installment options via iyzico.',
    },
    manual: false,
    fields: [
      { key: 'api_key', label: { tr: 'API Key', en: 'API Key' }, kind: 'secret', required: true },
      { key: 'secret_key', label: { tr: 'Secret Key', en: 'Secret Key' }, kind: 'secret', required: true },
    ],
  },
  {
    id: 'bank_transfer',
    name: { tr: 'Havale / EFT', en: 'Bank Transfer' },
    blurb: {
      tr: 'Banka bilgilerimize havale/EFT yapın; ödemeniz onaylanınca siparişiniz hazırlanır.',
      en: 'Transfer to our bank account; your order ships once payment is confirmed.',
    },
    manual: true,
    fields: [
      { key: 'bank_name', label: { tr: 'Banka', en: 'Bank' }, kind: 'text', required: true, placeholder: 'Örn. Ziraat Bankası' },
      { key: 'account_holder', label: { tr: 'Hesap Sahibi', en: 'Account Holder' }, kind: 'text', required: true },
      { key: 'iban', label: { tr: 'IBAN', en: 'IBAN' }, kind: 'text', required: true, placeholder: 'TR00 0000 0000 0000 0000 0000 00' },
      { key: 'instructions', label: { tr: 'Açıklama / Talimat', en: 'Notes / Instructions' }, kind: 'text', multiline: true },
      { key: 'payment_term_days', label: { tr: 'Ödeme süresi (gün)', en: 'Payment term (days)' }, kind: 'text', placeholder: '3' },
    ],
  },
  {
    id: 'cash_on_delivery',
    name: { tr: 'Kapıda Ödeme', en: 'Cash on Delivery' },
    blurb: {
      tr: 'Siparişinizi teslim alırken ödeme yapın.',
      en: 'Pay when your order is delivered.',
    },
    manual: true,
    fields: [],
  },
]

export function getPaymentMethod(id: string): PaymentMethodMeta | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id)
}

/**
 * Label for a stored `payment_provider` value that no longer maps to a method
 * (a provider removed from the platform). Old orders keep their value as an
 * audit record; this keeps them readable without naming the provider.
 */
const REMOVED_METHOD_LABEL = { tr: 'Kaldırılmış ödeme yöntemi', en: 'Removed payment method' }

/** Provider ids that are valid stored values but not owner-selectable methods. */
const INTERNAL_PROVIDER_IDS = ['mock', 'stripe']

function unknownMethodLabel(id: string, lang: Lang): string {
  return INTERNAL_PROVIDER_IDS.includes(id) ? id : pickLang(REMOVED_METHOD_LABEL, lang)
}

/**
 * Owner-facing name (e.g. "iyzico ile Öde"). Used in the settings screen and
 * anywhere else the store OWNER needs to know which PSP is configured. Never
 * use this for buyer-facing checkout copy — see `buyerMethodName` below.
 */
export function methodName(id: string, lang: Lang): string {
  const method = getPaymentMethod(id)
  return method ? pickLang(method.name, lang) : unknownMethodLabel(id, lang)
}

/**
 * Card-based PSPs whose brand must never be shown to the buyer. The buyer
 * always sees a single provider-agnostic "Credit Card" option regardless of
 * which of these is actually configured behind the scenes; only the owner's
 * settings screen (and server-side routing) knows which one it is.
 */
export function isCardProviderMethod(id: string): boolean {
  return (CARD_PROVIDER_IDS as readonly string[]).includes(id)
}

/** Generic buyer-facing label for any card PSP — never a provider brand name. */
export const CREDIT_CARD_BUYER_LABEL: { tr: string; en: string } = {
  tr: 'Kredi Kartı',
  en: 'Credit Card',
}

export const CREDIT_CARD_BUYER_BLURB: { tr: string; en: string } = {
  tr: 'Kredi veya banka kartınızla güvenli ödeme.',
  en: 'Secure payment with your credit or debit card.',
}

/**
 * Buyer-facing name for a given method/provider id. Card PSPs always
 * collapse to the generic "Credit Card" label; non-card methods (e.g. bank
 * transfer) keep their own already-generic name. This is the ONLY function
 * checkout UI should use to label a payment option shown to a buyer.
 */
export function buyerMethodName(id: string, lang: Lang): string {
  if (isCardProviderMethod(id)) return pickLang(CREDIT_CARD_BUYER_LABEL, lang)
  const method = getPaymentMethod(id)
  return method ? pickLang(method.name, lang) : unknownMethodLabel(id, lang)
}

export function buyerMethodBlurb(id: string, lang: Lang): string {
  if (isCardProviderMethod(id)) return pickLang(CREDIT_CARD_BUYER_BLURB, lang)
  const method = getPaymentMethod(id)
  return method ? pickLang(method.blurb, lang) : ''
}
