import type { CompanyProfile } from '@/lib/website-schema'

/**
 * Owner company details: validation + the "seller view" the legal texts read.
 *
 * Pure and framework-agnostic (used by the editor, the legal pages, checkout
 * and tests). Invalid values are never rendered into a legal text: they are
 * treated as "not provided" so the page shows a `[placeholder]` instead.
 */

export type CompanyField = Exclude<keyof CompanyProfile, 'updatedAt'>

export const BUSINESS_TYPES = ['sole', 'limited', 'joint_stock'] as const
export type BusinessType = (typeof BUSINESS_TYPES)[number]

export const BUSINESS_TYPE_LABEL: Record<BusinessType, { tr: string; en: string }> = {
  sole: { tr: 'Şahıs işletmesi', en: 'Sole proprietorship' },
  limited: { tr: 'Limited şirket', en: 'Limited company' },
  joint_stock: { tr: 'Anonim şirket', en: 'Joint-stock company' },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const digits = (v: string) => v.replace(/[\s.\-]/g, '')

export function isBusinessType(v: unknown): v is BusinessType {
  return typeof v === 'string' && (BUSINESS_TYPES as readonly string[]).includes(v)
}

/** Vergi no (10 digits) or TC kimlik no (11 digits, sole proprietors only). */
export function isValidTaxId(value: string, type?: BusinessType): boolean {
  const d = digits(value)
  if (!/^\d+$/.test(d)) return false
  if (d.length === 10) return true
  return d.length === 11 && (type === undefined || type === 'sole')
}

export function isValidMersis(value: string): boolean {
  return /^\d{16}$/.test(digits(value))
}

/** Turkish landline/mobile/850: optional +90 / 90 / 0 prefix, then 10 digits. */
export function isValidTrPhone(value: string): boolean {
  const d = value.replace(/[\s()\-.]/g, '')
  return /^(?:\+90|90|0)?[2-58]\d{9}$/.test(d)
}

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

export function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.')
  } catch {
    return false
  }
}

/** Error text for ONE field, or null when empty (not required here) or valid. */
export function validateCompanyField(
  field: CompanyField,
  value: string | undefined,
  type?: BusinessType,
): string | null {
  const v = (value ?? '').trim()
  if (!v) return null
  switch (field) {
    case 'taxId':
      return isValidTaxId(v, type)
        ? null
        : type && type !== 'sole'
          ? 'Vergi numarası 10 haneli olmalı.'
          : 'Vergi numarası 10, TC kimlik numarası 11 haneli olmalı.'
    case 'mersis':
      return isValidMersis(v) ? null : 'MERSİS numarası 16 haneli olmalı.'
    case 'phone':
      return isValidTrPhone(v) ? null : 'Geçerli bir telefon numarası girin (örn. 0212 555 12 34).'
    case 'email':
      return isValidEmail(v) ? null : 'Geçerli bir e-posta adresi girin.'
    case 'kepAddress':
      return isValidEmail(v) ? null : 'Geçerli bir KEP adresi girin.'
    case 'website':
      return isValidWebsite(v) ? null : 'https:// ile başlayan geçerli bir adres girin.'
    default:
      return null
  }
}

export function validateCompanyProfile(
  profile: CompanyProfile | undefined,
): Partial<Record<CompanyField, string>> {
  const errors: Partial<Record<CompanyField, string>> = {}
  if (!profile) return errors
  const fields: CompanyField[] = ['taxId', 'mersis', 'phone', 'email', 'kepAddress', 'website']
  for (const f of fields) {
    const err = validateCompanyField(f, profile[f] as string | undefined, profile.businessType)
    if (err) errors[f] = err
  }
  return errors
}

/** Validated, display-ready seller details. Missing/invalid fields are undefined. */
export type SellerView = {
  businessType?: BusinessType
  tradeName?: string
  address?: string
  taxOffice?: string
  taxId?: string
  mersis?: string
  tradeRegistryNo?: string
  phone?: string
  email?: string
  kepAddress?: string
  website?: string
}

const clean = (v?: string) => (v && v.trim() ? v.trim() : undefined)

export type ContactFallback = { address?: string; phone?: string; email?: string }

/**
 * The seller view for a site: the owner's company profile first, then (for
 * address / phone / e-mail only) the site's contact section, so sites that
 * predate the profile keep showing what they already published.
 */
export function sellerFromProfile(
  profile: CompanyProfile | undefined,
  contact?: ContactFallback,
): SellerView {
  const p = profile ?? {}
  const type = isBusinessType(p.businessType) ? p.businessType : undefined
  const ok = (field: CompanyField) => validateCompanyField(field, p[field] as string | undefined, type) === null
  const pick = (field: CompanyField) => (ok(field) ? clean(p[field] as string | undefined) : undefined)

  const addressParts = [clean(p.addressLine), clean(p.district), clean(p.city)].filter(Boolean)
  return {
    businessType: type,
    tradeName: clean(p.tradeName),
    address: addressParts.length ? addressParts.join(', ') : clean(contact?.address),
    taxOffice: clean(p.taxOffice),
    taxId: pick('taxId'),
    mersis: pick('mersis'),
    tradeRegistryNo: clean(p.tradeRegistryNo),
    phone: pick('phone') ?? (isValidTrPhone(contact?.phone ?? '') ? clean(contact?.phone) : undefined),
    email: pick('email') ?? (isValidEmail(contact?.email ?? '') ? clean(contact?.email) : undefined),
    kepAddress: pick('kepAddress'),
    website: pick('website'),
  }
}

export type SellerRequiredField =
  | 'tradeName'
  | 'address'
  | 'taxOffice'
  | 'taxId'
  | 'phone'
  | 'email'
  | 'mersis'

export const SELLER_FIELD_LABEL: Record<SellerRequiredField, string> = {
  tradeName: 'Ticari ünvan',
  address: 'Adres',
  taxOffice: 'Vergi dairesi',
  taxId: 'Vergi no / TC kimlik no',
  phone: 'Telefon',
  email: 'E-posta',
  mersis: 'MERSİS no',
}

/** MERSİS is only mandatory for limited and joint-stock companies. */
export function mersisRequired(view: SellerView): boolean {
  return view.businessType === 'limited' || view.businessType === 'joint_stock'
}

/** The seller details a distance-sales contract needs but the owner hasn't given. */
export function missingSellerFields(view: SellerView): SellerRequiredField[] {
  const required: SellerRequiredField[] = ['tradeName', 'address', 'taxOffice', 'taxId', 'phone', 'email']
  if (mersisRequired(view)) required.push('mersis')
  return required.filter((f) => !view[f])
}

/**
 * A compact "Satıcı" line for checkout: only what is really known, no
 * placeholders. Null when there is no trade name to show.
 */
export function sellerSummary(view: SellerView): string | null {
  if (!view.tradeName) return null
  const parts = [view.tradeName]
  if (view.taxOffice && view.taxId) parts.push(`${view.taxOffice} V.D. ${view.taxId}`)
  else if (view.taxId) parts.push(`Vergi No: ${view.taxId}`)
  if (view.address) parts.push(view.address)
  return parts.join(' · ')
}

/** Normalises an editor patch value: trimmed, empty means "remove". */
export function normalizeCompanyValue(value: string): string | undefined {
  const v = value.trim()
  return v ? v : undefined
}
