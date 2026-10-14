import { missingSellerFields, SELLER_FIELD_LABEL, type SellerRequiredField } from '@/lib/company-profile'
import type { CompanyField } from '@/lib/company-profile'
import { sanitizeLegalMarkup } from '@/lib/legal-markup'
import {
  canHideLegalDoc,
  companyForSite,
  customLegalBody,
  isLegalDocHidden,
  legalTemplateMarkup,
  type SITE_LEGAL_SLUGS,
} from '@/lib/site-legal-docs'
import type { EditOperation } from '@/lib/website-edit-operations'
import { isStorefront, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Pure logic behind the editor's "Firma bilgileri" and "Resmi metinler"
 * sections. The UI only calls these helpers and dispatches the returned
 * operations, so manual edits and AI edits share ONE code path
 * (`applyOperation`) and the rules below are testable without React.
 */

export type LegalDocSlug = (typeof SITE_LEGAL_SLUGS)[number]
export type LegalDocStatus = 'template' | 'custom' | 'hidden'

export const LEGAL_DOC_ENTRIES: ReadonlyArray<{ slug: LegalDocSlug; title: string }> = [
  { slug: 'gizlilik-politikasi', title: 'Gizlilik Politikası' },
  { slug: 'mesafeli-satis-sozlesmesi', title: 'Mesafeli Satış Sözleşmesi' },
  { slug: 'hizmet-sozlesmesi', title: 'Hizmet Sözleşmesi' },
  { slug: 'teslimat-ve-iade', title: 'Teslimat ve İade' },
  { slug: 'uyelik-sozlesmesi', title: 'Üyelik Sözleşmesi' },
]

export const LEGAL_STATUS_LABEL: Record<LegalDocStatus, string> = {
  template: 'Şablon',
  custom: 'Düzenlendi',
  hidden: 'Gizli',
}

export const LEGAL_RESPONSIBILITY_NOTE =
  'Bu metinleri yasal gerekliliklere uygun olarak gözden geçirmek sizin sorumluluğunuzdadır.'

/** Editor-only notes for texts that are still drafts awaiting legal review. */
export const LEGAL_DRAFT_NOTES: Partial<Record<LegalDocSlug, string>> = {
  'teslimat-ve-iade':
    'Taslak: teslimat, kargo ücreti, iade ve değişim metni hukuk ekibi onayı bekliyor. Yayınlamadan önce kendi teslimat süreleriniz, kargo ücretiniz ve iade koşullarınıza göre düzenleyin.',
}

export const SELLER_WARNING_TEXT = 'Mesafeli satış için satıcı bilgilerinizi tamamlayın'

/** Hidden wins over edited, edited wins over the template. */
export function legalDocStatus(site: WebsiteSchema, slug: string): LegalDocStatus {
  if (isLegalDocHidden(site, slug)) return 'hidden'
  return customLegalBody(site, slug) ? 'custom' : 'template'
}

/** The text the editor opens with: the owner's saved text, else the filled template. */
export function legalEditorStartText(site: WebsiteSchema, siteName: string, slug: string): string {
  const custom = customLegalBody(site, slug)
  if (custom) return custom.body
  return legalTemplateMarkup(slug, site, siteName) ?? ''
}

/**
 * The operation for "Kaydet", or null when nothing would change. Saving the
 * untouched template must NOT freeze it as an owner edit — otherwise later
 * template updates would never reach that page.
 */
export function saveLegalDocOperation(
  site: WebsiteSchema,
  siteName: string,
  slug: LegalDocSlug,
  body: string,
): EditOperation | null {
  const clean = sanitizeLegalMarkup(body)
  const custom = customLegalBody(site, slug)
  if (custom) return clean === custom.body ? null : { op: 'updateLegalDoc', slug, body: clean }
  const template = legalTemplateMarkup(slug, site, siteName)
  if (!clean || clean === template) return null
  return { op: 'updateLegalDoc', slug, body: clean }
}

export function resetLegalDocOperation(site: WebsiteSchema, slug: LegalDocSlug): EditOperation | null {
  return customLegalBody(site, slug) ? { op: 'resetLegalDoc', slug } : null
}

export function toggleLegalDocHiddenOperation(
  site: WebsiteSchema,
  slug: LegalDocSlug,
): EditOperation | null {
  if (!canHideLegalDoc(site, slug)) return null
  return { op: 'setLegalDocHidden', slug, hidden: !isLegalDocHidden(site, slug) }
}

export function companyFieldOperation(field: CompanyField, value: string): EditOperation {
  return { op: 'updateCompany', patch: { [field]: value } }
}

/** What a store's distance-sales contract strictly needs from the seller. */
const STORE_REQUIRED: readonly SellerRequiredField[] = ['tradeName', 'address', 'taxId', 'phone', 'email']

/**
 * Labels of the required seller fields a STORE still lacks. Empty for any
 * other site type. Only warns — it never blocks taking payments.
 */
export function storeSellerGaps(site: WebsiteSchema, siteName: string): string[] {
  if (!isStorefront(site)) return []
  const seller = companyForSite(site, siteName).seller
  return missingSellerFields(seller)
    .filter((f) => STORE_REQUIRED.includes(f))
    .map((f) => SELLER_FIELD_LABEL[f])
}

/* -------------------------------------------------------------------------- */
/*  Toolbar: plain-text formatting of the simple legal markup                  */
/* -------------------------------------------------------------------------- */

export type MarkupFormat = 'heading' | 'bullet' | 'bold' | 'link'
export type MarkupEdit = { text: string; selStart: number; selEnd: number }

function lineBounds(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nl = text.indexOf('\n', end)
  return [from, nl === -1 ? text.length : nl]
}

export function applyMarkupFormat(
  text: string,
  selStart: number,
  selEnd: number,
  format: MarkupFormat,
): MarkupEdit {
  const start = Math.max(0, Math.min(selStart, text.length))
  const end = Math.max(start, Math.min(selEnd, text.length))

  if (format === 'bold' || format === 'link') {
    const selected = text.slice(start, end)
    const label = selected || (format === 'bold' ? 'kalın metin' : 'bağlantı metni')
    const insert = format === 'bold' ? `**${label}**` : `[${label}](https://)`
    const next = text.slice(0, start) + insert + text.slice(end)
    if (format === 'bold') return { text: next, selStart: start + 2, selEnd: start + 2 + label.length }
    const urlStart = start + label.length + 3
    return { text: next, selStart: urlStart, selEnd: urlStart + 'https://'.length }
  }

  const [from, to] = lineBounds(text, start, end)
  const lines = text.slice(from, to).split('\n')
  const marker = format === 'heading' ? '## ' : '- '
  const allMarked = lines.every((l) => l.startsWith(marker))
  const stripped = lines.map((l) => l.replace(/^(## |- )/, ''))
  const out = allMarked ? stripped : stripped.map((l) => (l.trim() ? marker + l : l))
  const block = out.join('\n')
  return { text: text.slice(0, from) + block + text.slice(to), selStart: from, selEnd: from + block.length }
}
