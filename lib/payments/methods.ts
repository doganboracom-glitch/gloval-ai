import type { PaymentProviderId } from '@/lib/payments/types'
import { pickLang, type Lang } from '@/lib/i18n'

/**
 * Buyer-facing + owner-facing metadata for the payment methods a Turkish
 * e-commerce store typically offers. This is the single source of truth shared
 * by the storefront checkout (which method a buyer can pick) and the owner
 * settings screen (which credentials to collect for each provider). It contains
 * NO secrets — only labels, descriptions and the shape of the config fields.
 */

export type PaymentMethodId = Extract<PaymentProviderId, 'paytr' | 'iyzico' | 'bank_transfer'>

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
    id: 'paytr',
    name: { tr: 'PayTR ile Öde', en: 'Pay with PayTR' },
    blurb: {
      tr: 'Kredi/banka kartı ile güvenli 3D ödeme (PayTR).',
      en: 'Secure 3D card payment via PayTR.',
    },
    manual: false,
    fields: [
      { key: 'merchant_id', label: { tr: 'Mağaza No (Merchant ID)', en: 'Merchant ID' }, kind: 'text', required: true, placeholder: '123456' },
      { key: 'merchant_key', label: { tr: 'Merchant Key', en: 'Merchant Key' }, kind: 'secret', required: true },
      { key: 'merchant_salt', label: { tr: 'Merchant Salt', en: 'Merchant Salt' }, kind: 'secret', required: true },
    ],
  },
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
    ],
  },
]

export function getPaymentMethod(id: string): PaymentMethodMeta | undefined {
  return PAYMENT_METHODS.find((m) => m.id === id)
}

/**
 * Owner-facing name (e.g. "PayTR ile Öde"). Used in the settings screen and
 * anywhere else the store OWNER needs to know which PSP is configured. Never
 * use this for buyer-facing checkout copy — see `buyerMethodName` below.
 */
  export function methodName(id: string, lang: Lang): string {
  const method = getPaymentMethod(id)
  return method ? pickLang(method.name, lang) : id
  }

/**
 * Card-based PSPs whose brand must never be shown to the buyer. The buyer
 * always sees a single provider-agnostic "Credit Card" option regardless of
 * which of these is actually configured behind the scenes; only the owner's
 * settings screen (and server-side routing) knows which one it is.
 */
const CARD_PROVIDER_IDS: readonly PaymentMethodId[] = ['paytr', 'iyzico']

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
  return method ? pickLang(method.name, lang) : id
  }
  
  export function buyerMethodBlurb(id: string, lang: Lang): string {
  if (isCardProviderMethod(id)) return pickLang(CREDIT_CARD_BUYER_BLURB, lang)
  const method = getPaymentMethod(id)
  return method ? pickLang(method.blurb, lang) : ''
  }
