/**
 * GLOVAL AI — Merkezi kurumsal bilgi yapılandırması.
 *
 * Tüm yasal metinler, footer, iletişim sayfası ve satın alma akışı şirket
 * bilgilerini BURADAN okur. Böylece şirket unvanı, vergi/MERSİS, adres ve
 * iletişim bilgileri tek bir yerden güncellenir.
 *
 * ÖNEMLİ: Buradaki değerler UYDURULMAMIŞTIR. Gerçek şirket bilgileri henüz
 * bilinmediği için, doldurulmayı bekleyen açık placeholder'lar kullanılır
 * (ör. "[ŞİRKET UNVANI]"). Production'a çıkmadan önce bu alanlar gerçek
 * bilgilerle — tercihen aşağıdaki NEXT_PUBLIC_* ortam değişkenleriyle —
 * doldurulmalıdır.
 *
 * Neden NEXT_PUBLIC_*: Bu bilgiler gizli değildir (yasal metinlerde zaten
 * herkese açıktır) ve hem sunucu hem istemci bileşenlerinde aynı değeri
 * göstermek gerekir. Böylece admin, kod değiştirmeden yalnızca ortam
 * değişkenlerini ayarlayarak tüm siteyi güncelleyebilir.
 */

/** Bir alan doldurulmadıysa arayüzde görünür kalması için işaretli placeholder. */
function field(envValue: string | undefined, placeholder: string): string {
  const v = envValue?.trim()
  return v && v.length > 0 ? v : placeholder
}

/** Bir değerin hâlâ placeholder olup olmadığını anlamak için (uyarı göstermede kullanılır). */
export function isPlaceholder(value: string): boolean {
  return value.startsWith('[') && value.endsWith(']')
}

export const COMPANY = {
  /** Markanın görünen adı. Bu gerçek ve sabittir. */
  brandName: 'GLOVAL AI',

  /** Yasal şirket unvanı (ör. "... Bilişim Teknolojileri A.Ş."). */
  legalName: field(process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME, 'Osman Doğan BASTIRMACI'),

  /** Vergi dairesi ve numarası. */
  taxOffice: field(process.env.NEXT_PUBLIC_COMPANY_TAX_OFFICE, '[VERGİ DAİRESİ]'),
  taxNumber: field(process.env.NEXT_PUBLIC_COMPANY_TAX_NUMBER, '[VERGİ NUMARASI]'),

  /** MERSİS numarası. */
  mersisNo: field(process.env.NEXT_PUBLIC_COMPANY_MERSIS_NO, '[MERSİS NO]'),

  /** Ticaret sicil numarası (varsa). */
  tradeRegistryNo: field(
    process.env.NEXT_PUBLIC_COMPANY_TRADE_REGISTRY_NO,
    '[TİCARET SİCİL NO]',
  ),

  /** Açık adres. */
  address: field(
    process.env.NEXT_PUBLIC_COMPANY_ADDRESS,
    'Sümbül Efendi Mah. Hamdullah Sk. Tuncay Apt. Kat:1/1 Fatih / İSTANBUL',
  ),

  /** Genel / destek iletişim bilgileri. */
  supportEmail: field(process.env.NEXT_PUBLIC_SUPPORT_EMAIL, 'info@gloval.ai'),
  kvkkEmail: field(
    process.env.NEXT_PUBLIC_KVKK_EMAIL ?? process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    'info@gloval.ai',
  ),
  phone: field(process.env.NEXT_PUBLIC_COMPANY_PHONE, '0542 464 76 10'),

  /** Platform alan adı ve kanonik URL. */
  domain: 'gloval.ai',
  siteUrl: field(process.env.NEXT_PUBLIC_SITE_URL, 'https://gloval.ai'),
} as const

/** Yasal metinlerin en son gözden geçirildiği tarih (footer/başlıkta gösterilir). */
export const LEGAL_LAST_UPDATED = '2026-01-01'

/**
 * Herhangi bir zorunlu kurumsal alan hâlâ placeholder mı? Admin'e "yasal
 * bilgiler eksik" uyarısı göstermek için kullanılır.
 */
export function hasMissingCompanyInfo(): boolean {
  return [
    COMPANY.legalName,
    COMPANY.taxNumber,
    COMPANY.address,
    COMPANY.supportEmail,
  ].some(isPlaceholder)
}
