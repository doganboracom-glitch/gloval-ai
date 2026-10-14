/**
 * Field-level wording for card-checkout buyer validation. Pure data so the
 * checkout form (client) and tests can share it with the server's `issues`.
 */

export type BuyerIssueView = {
  field: 'name' | 'lastName' | 'email' | 'phone' | 'address' | 'city' | 'postalCode'
  problem: 'missing' | 'invalid'
}

const MESSAGES: Record<BuyerIssueView['field'], { missing: string; invalid: string }> = {
  name: { missing: 'Ad alanı boş bırakılamaz.', invalid: 'Ad geçerli değil.' },
  lastName: { missing: 'Soyad alanı boş bırakılamaz.', invalid: 'Soyad geçerli değil.' },
  email: { missing: 'E-posta alanı boş bırakılamaz.', invalid: 'E-posta adresi geçerli değil.' },
  phone: {
    missing: 'Telefon alanı boş bırakılamaz.',
    invalid: 'Telefon numarası geçerli değil. Alan kodu ile birlikte 10 haneli numara girin (örn. 0532 000 00 00 veya 0212 000 00 00).',
  },
  address: { missing: 'Adres alanı boş bırakılamaz.', invalid: 'Adres geçerli değil.' },
  city: { missing: 'Şehir alanı boş bırakılamaz.', invalid: 'Şehir geçerli değil.' },
  postalCode: { missing: 'Posta kodu boş bırakılamaz.', invalid: 'Posta kodu geçerli değil. 5 haneli olmalı (örn. 34000).' },
}

export const BUYER_INFO_FALLBACK_MESSAGE =
  'Kart ödemesi için alıcı bilgileri eksik veya geçersiz. Lütfen formu kontrol et.'

export function buyerIssueMessage(issue: BuyerIssueView): string {
  return MESSAGES[issue.field][issue.problem]
}

/** One line per problem field; falls back to the generic text when the server named none. */
export function buyerIssuesMessage(issues: readonly BuyerIssueView[] | undefined): string {
  if (!issues || issues.length === 0) return BUYER_INFO_FALLBACK_MESSAGE
  return issues.map(buyerIssueMessage).join(' ')
}
