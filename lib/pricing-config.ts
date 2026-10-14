/**
 * Merkezi fiyatlandırma yapılandırması.
 *
 * Fiyatlar, AI kredi kuralları, site/sayfa limitleri ve karşılaştırma verisi
 * TEK bir yerde tutulur; böylece ileride admin panelinden yönetilebilir hale
 * getirilirken arayüz tarafında hiçbir metin/sayı avlamak gerekmez.
 *
 * Ana paket yapısı 4 pakettir: FREE / STARTER / PRO / E-TİCARET.
 * E-ticaret PRO altında bir modül DEĞİL, ayrı bir ana pakettir.
 *
 * Not: Buradaki değerler pazarlama (fiyatlandırma sayfası) katmanıdır.
 * Faturalama tarafındaki gerçek plan kayıtları `billing_plans` tablosunda ve
 * `lib/billing.ts` içinde yaşar; ikisi eşleşirken plan kodları aynı tutulur.
 */

export type PlanCode = 'free' | 'starter' | 'pro' | 'ecommerce'

export type BillingCycle = 'yearly' | 'monthly'

/** Kilitli özelliklerin hangi upgrade mesajını açacağını belirler. */
export type LockedFeatureKey =
  | 'phone'
  | 'whatsapp'
  | 'customDomain'
  | 'analytics'
  | 'social'

/* -------------------------------------------------------------------------- */
/* AI kredi sistemi                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Devir ve azami bakiye PRO ile E-TİCARET için aynıdır; tek yerde tanımlanır ve
 * E-TİCARET bunu PRO'dan miras alır.
 */
const MONTHLY_PLAN_ROLLOVER = true as const
const MONTHLY_PLAN_MAX_BALANCE = 1500 as const

/**
 * Kredi değerleri ödeme dönemine (aylık/yıllık) BAĞLI DEĞİLDİR. "10 ay öde,
 * 12 ay kullan" yalnızca bir fiyat kuralıdır; yıllık ödeyen de aylık ödeyenle
 * aynı kredi kuralına tabidir.
 */
export const AI_CREDIT_CONFIG = {
  free: {
    credits: 50,
    creditType: 'one_time' as const,
    rollover: false,
  },
  starter: {
    credits: 150,
    creditPeriodDays: 30,
    rollover: false,
  },
  pro: {
    initialCredits: 450,
    monthlyCredits: 150,
    rollover: MONTHLY_PLAN_ROLLOVER,
    maxBalance: MONTHLY_PLAN_MAX_BALANCE,
  },
  ecommerce: {
    initialCredits: 500,
    monthlyCredits: 150,
    rollover: MONTHLY_PLAN_ROLLOVER,
    maxBalance: MONTHLY_PLAN_MAX_BALANCE,
  },
} as const

/** Binlik ayraçlı sayı (1.500) — yalnızca TR pazarlama metinleri için. */
function trNumber(n: number): string {
  return n.toLocaleString('tr-TR')
}

/**
 * Yayına alma limiti aşıldığında dönülen hata kodu. FREE ve STARTER paketleri
 * aynı anda yalnızca 1 site yayında tutabilir; ikinci site oluşturulup
 * düzenlenebilir ama yayına alınamaz. İstemci bu kodu yükseltme mesajına çevirir.
 */
export const SITE_LIMIT_ERROR = 'SITE_LIMIT_REACHED'

/**
 * Yayınlamak için aktif (FREE dahil) bir abonelik kaydı gerekir. Kayıt yoksa
 * sunucu yayını reddeder ve bu kodu döner; istemci paket seçimine yönlendirir.
 */
export const PLAN_REQUIRED_ERROR = 'PLAN_REQUIRED'

/** Publishing is blocked while the subscription is suspended for non-payment. */
export const SUBSCRIPTION_SUSPENDED_ERROR = 'SUBSCRIPTION_SUSPENDED'

/**
 * Paket başına yayınlanabilir site limiti.
 *
 * E-TİCARET, PRO'nun bir üst basamağıdır: PRO kullanıcısı e-ticarete geçtiğinde
 * mevcut 3 site hakkını KAYBETMEZ; e-ticaret mağazası bunun üzerine 1 hak ekler.
 * Böylece e-ticaret pakedinde toplam 4 site yayında tutulabilir (3 kurumsal +
 * 1 e-ticaret). Yayın limiti tek bir düz sayaç olduğundan bu 4'lük limit,
 * kullanıcının kurumsal/e-ticaret site karışımını serbestçe seçmesine izin verir.
 */
export const SITE_LIMITS: Record<PlanCode, number> = {
  free: 1,
  starter: 1,
  pro: 3,
  ecommerce: 4,
}

/** Paket başına sayfa limiti. */
export const PAGE_LIMITS: Record<PlanCode, number> = {
  free: 5,
  starter: 15,
  pro: 75,
  ecommerce: 75,
}

/**
 * Şemanın (`websiteSchema.pages.max(8)`) izin verdiği GERÇEK üst sınır. Bir
 * paketin limiti bunun üstündeyse kullanıcı yine de bu kadar sayfa
 * oluşturabilir; kartlarda ve tabloda `effectivePageLimit` gösterilir.
 */
export const SITE_PAGE_HARD_CAP = 8

export function effectivePageLimit(code: PlanCode): number {
  return Math.min(PAGE_LIMITS[code], SITE_PAGE_HARD_CAP)
}

/**
 * Paket başına temel ürün limiti. `null` = pakette ürün limiti tanımlı değil
 * (FREE/STARTER; mevcut davranış korunur, ürün add-on'u uygulanmaz).
 */
export const PRODUCT_LIMITS: Record<PlanCode, number | null> = {
  free: null,
  starter: null,
  pro: 50,
  ecommerce: 150,
}

/**
 * E-ticaret sitesi hakkı. Toplam yayın limitinden (SITE_LIMITS) bağımsızdır ve
 * ek site add-on'larından etkilenmez: E-ticaret paketi 3 kurumsal + 1 e-ticaret.
 */
export const ECOMMERCE_SITE_LIMITS: Record<PlanCode, number> = {
  free: 0,
  starter: 0,
  pro: 0,
  ecommerce: 1,
}

/** Ürün limiti dolduğunda createProduct tarafından fırlatılan hata kodu. */
export const PRODUCT_LIMIT_ERROR = 'PRODUCT_LIMIT_REACHED'

/* -------------------------------------------------------------------------- */
/* Paketler                                                                    */
/* -------------------------------------------------------------------------- */

export type Plan = {
  code: PlanCode
  name: string
  headline: string
  description: string
  /** TL cinsinden aylık fiyat. 0 = ücretsiz. */
  monthlyPrice: number
  /** TL cinsinden yıllık fiyat. 0 = ücretsiz. */
  yearlyPrice: number
  cta: string
  badge?: string
  featured?: boolean
  creditSummary: string
  creditNotes: string[]
}

/**
 * Paket kartlarındaki ve karşılaştırma tablosundaki özellik satırları bu
 * dosyada DEĞİL, `lib/plan-copy.ts` içinde tek kaynaktan üretilir; sayı ve
 * limitler yalnızca bu dosyadaki sabitlerden okunur.
 */
export const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'FREE',
    headline: 'GLOVAL AI’ı keşfet',
    description: 'Denemek ve ilk siteni oluşturmak için.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    cta: 'Ücretsiz Başla',
    creditSummary: `${AI_CREDIT_CONFIG.free.credits} AI işlemi`,
    creditNotes: ['Tek seferlik. Aylık yenilenmez.'],
  },
  {
    code: 'starter',
    name: 'STARTER',
    headline: 'İşletmeni profesyonelleştir',
    description: 'Profesyonel bir web sitesine ihtiyaç duyan işletmeler için.',
    monthlyPrice: 399,
    yearlyPrice: 3990,
    cta: 'Starter ile Başla',
    creditSummary: `${AI_CREDIT_CONFIG.starter.credits} AI işlemi / ${AI_CREDIT_CONFIG.starter.creditPeriodDays} gün`,
    creditNotes: ['Kullanılmayan AI işlemleri devretmez.'],
  },
  {
    code: 'pro',
    name: 'PRO',
    headline: 'İşletmeni büyüt',
    description: 'Birden fazla site ve daha fazla AI işlemi isteyen işletmeler için.',
    monthlyPrice: 699,
    yearlyPrice: 6990,
    cta: 'PRO ile Büyümeye Başla',
    badge: 'En Çok Tercih Edilen',
    featured: true,
    creditSummary: `İlk ay ${AI_CREDIT_CONFIG.pro.initialCredits} AI işlemi`,
    creditNotes: [
      `Sonraki dönemlerde ${AI_CREDIT_CONFIG.pro.monthlyCredits} AI işlemi.`,
      'Kullanılmayan işlemler devreder.',
    ],
  },
  {
    code: 'ecommerce',
    name: 'E-TİCARET',
    headline: 'Ürünlerini online sat',
    description: 'Mağazasını internete taşımak isteyen işletmeler için.',
    monthlyPrice: 1999,
    yearlyPrice: 19990,
    cta: 'E-Ticarete Başla',
    creditSummary: `İlk ay ${AI_CREDIT_CONFIG.ecommerce.initialCredits} AI işlemi`,
    creditNotes: [
      `Sonraki dönemlerde ${AI_CREDIT_CONFIG.ecommerce.monthlyCredits} AI işlemi.`,
      'Kullanılmayan işlemler devreder.',
    ],
  },
]

/* -------------------------------------------------------------------------- */
/* Yıllık ödeme                                                                */
/* -------------------------------------------------------------------------- */

export const YEARLY_HIGHLIGHT = '10 ay öde, 2 ay bizden + com.tr domain hediye'
export const YEARLY_DOMAIN_GIFT = '.com.tr domain hediye'

/* -------------------------------------------------------------------------- */
/* AI kredi kuralları                                                          */
/* -------------------------------------------------------------------------- */

export const CREDIT_RULES_TITLE = 'AI İşlemi Kullanım Kuralları'

export const CREDIT_RULES_DESCRIPTION =
  'GLOVAL AI içerisindeki yapay zeka işlemleri farklı miktarlarda AI işlemi kullanır.'

/** Paket başına kredi kuralları — kredi kuralları ekranında gösterilir. */
export const CREDIT_RULES_BY_PLAN: Array<{
  plan: PlanCode
  name: string
  amount: string
  lines: string[]
}> = [
  {
    plan: 'free',
    name: 'FREE',
    amount: `${AI_CREDIT_CONFIG.free.credits} AI işlemi`,
    lines: ['Tek seferlik'],
  },
  {
    plan: 'starter',
    name: 'STARTER',
    amount: `${AI_CREDIT_CONFIG.starter.credits} AI işlemi / ${AI_CREDIT_CONFIG.starter.creditPeriodDays} gün`,
    lines: ['Kullanılmayan AI işlemleri devretmez.'],
  },
  {
    plan: 'pro',
    name: 'PRO',
    amount: `İlk ay ${AI_CREDIT_CONFIG.pro.initialCredits} AI işlemi`,
    lines: [
      `Sonraki dönemlerde ${AI_CREDIT_CONFIG.pro.monthlyCredits} AI işlemi.`,
      'Kullanılmayan işlemler devreder.',
      `En fazla ${trNumber(AI_CREDIT_CONFIG.pro.maxBalance)} işlem bakiyesi.`,
    ],
  },
  {
    plan: 'ecommerce',
    name: 'E-TİCARET',
    amount: `İlk ay ${AI_CREDIT_CONFIG.ecommerce.initialCredits} AI işlemi`,
    lines: [
      `Sonraki dönemlerde ${AI_CREDIT_CONFIG.ecommerce.monthlyCredits} AI işlemi.`,
      'Kullanılmayan işlemler devreder.',
      `En fazla ${trNumber(AI_CREDIT_CONFIG.ecommerce.maxBalance)} işlem bakiyesi.`,
    ],
  },
]

/**
 * Kredi harcayan GERÇEK eylemler. Değerler sunucudaki sabitlerle aynıdır
 * (lib/ai-credits.ts `AI_ACTION_COSTS`, lib/store-ai-constants.ts
 * `STORE_AI_COSTS`, lib/logo-studio/rules.ts `LOGO_EMBLEM_CREDITS`); koddaki
 * karşılığı olmayan eylem buraya eklenmez.
 */
export const CREDIT_COSTS: Array<{ action: string; credits: number }> = [
  { action: 'Metin veya bölüm düzenleme (AI sohbet)', credits: 1 },
  { action: 'Ürün metni (AI asistan, ücretli deneme)', credits: 1 },
  { action: 'AI ile logo önerisi (amblem başına)', credits: 2 },
  { action: 'Ana sayfa görseli oluştur', credits: 2 },
  { action: 'Bölüm görseli oluştur', credits: 2 },
  { action: 'Ürün görseli (AI asistan, ücretli deneme)', credits: 3 },
  { action: 'Ürün üzerinde sanal deneme (deneme başına)', credits: 5 },
]

/** Kredi kuralları penceresindeki "AI işlemleri bittiğinde" bölümü. */
export const CREDIT_RULES_EMPTY_TITLE = 'AI işlemleri bittiğinde ne olur?'

export const CREDIT_RULES_SUPPORT = {
  before: 'Ek modül veya özel istekleriniz için ',
  linkLabel: 'DESTEK',
  after: "'ten yardım alın. Talebinize göre fiyatlandırma yapılıp uygulanacaktır.",
  href: '/support/new',
}

/** "50 işlem 199 TL · 100 işlem 349 TL · 250 işlem 749 TL" — CREDIT_TOPUPS'tan türetilir. */
export function creditTopUpSummary(): string {
  return CREDIT_TOPUPS.map(
    (pack) => `${pack.credits} işlem ${formatTL(pack.priceCents / 100)}`,
  ).join(' · ')
}

export function creditRulesWhenEmpty(): string[] {
  return [
    'Yapay zekâ işlemleri durur; sitenin yayında kalır ve elle düzenlemeye devam edebilirsin.',
    `Ek AI işlemi paketi satın alabilirsin (tek seferlik, KDV dahil): ${creditTopUpSummary()}.`,
    'Satın alma yeri: Abonelikler sayfasındaki "Ek AI işlemi paketleri" bölümü. İşlemlerin bittiği anda açılan pencereden de alabilirsin.',
    'Satın aldığın işlemler aboneliğe bağlı değildir ve aylık yenilenen işlemlerine eklenir.',
    'Paketini yükselterek aylık işlem miktarını artırabilirsin.',
  ]
}

/* -------------------------------------------------------------------------- */
/* AI kredileri tükendiğinde                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Ek AI kredi paketleri — TEK fiyat kaynağı. Arayüz (modal, abonelikler
 * sayfası, ödeme özeti) ve sunucu (ödeme tutarı, doğrulama, kredi miktarı) bu
 * listeyi okur; istemciden gelen fiyat/kredi değerine asla güvenilmez.
 *
 * Fiyatlandırma hesabı (TRY, KDV dahil, tek seferlik):
 *   - Referans: STARTER aylık 399 TL / 150 kredi = 2,66 TL/kredi (yıllıkta
 *     3.990 TL / 12 / 150 = 2,22 TL/kredi). Abonelik; site, alan adı, şablon
 *     gibi başka avantajlar da içerdiğinden kredinin yalnızca "fiyatı" değildir.
 *   - Tek seferlik kredi, abonelik kredisinden daha avantajlı olmamalı; bu
 *     yüzden her paket 2,66 TL/kredi referansının ÜZERİNDE.
 *   - Birim fiyat büyük pakette düşer: 50 -> 3,98 TL, 100 -> 3,49 TL
 *     (yaklaşık %12 avantaj), 250 -> 3,00 TL (yaklaşık %25 avantaj).
 */
export type CreditTopUpId = 'ai_50' | 'ai_100' | 'ai_250'

export type CreditTopUp = {
  id: CreditTopUpId
  credits: number
  /** Kuruş cinsinden toplam fiyat (KDV dahil). */
  priceCents: number
  currency: 'TRY'
}

export const CREDIT_TOPUPS: CreditTopUp[] = [
  { id: 'ai_50', credits: 50, priceCents: 19900, currency: 'TRY' },
  { id: 'ai_100', credits: 100, priceCents: 34900, currency: 'TRY' },
  { id: 'ai_250', credits: 250, priceCents: 74900, currency: 'TRY' },
]

export const OUT_OF_CREDITS = {
  title: 'AI işlemlerin tükendi.',
  description:
    'AI işlemlerine devam etmek için ek AI işlemi satın alabilir veya paketini yükseltebilirsin.',
  upgradeCta: 'Paketimi yükselt',
}

export function getCreditTopUp(id: string): CreditTopUp | null {
  return CREDIT_TOPUPS.find((pack) => pack.id === id) ?? null
}

/** Ödeme sağlayıcısına giden sipariş kimliği ve `billing_transactions.idempotency_key`. */
export const TOPUP_ORDER_PREFIX = 'topup_'

export function buildTopUpOrderRef(packId: CreditTopUpId, nonce: string): string {
  return `${TOPUP_ORDER_PREFIX}${packId}_${nonce}`
}

/** Sipariş kimliğinden paketi çözer; tanınmayan/bozuk kimlikte null döner. */
export function parseTopUpOrderRef(orderRef: string | null | undefined): CreditTopUp | null {
  if (!orderRef || !orderRef.startsWith(TOPUP_ORDER_PREFIX)) return null
  const match = /^topup_(ai_\d+)_[A-Za-z0-9-]+$/.exec(orderRef)
  return match ? getCreditTopUp(match[1]) : null
}

/**
 * Copy for the FREE-plan daily action limit modal — see
 * `lib/free-daily-limit.ts` for the server-side gate this describes.
 * Distinct from OUT_OF_CREDITS: this fires even with credits remaining, and
 * resolves itself after the rolling 24h window, not by purchasing more.
 */
export const FREE_DAILY_LIMIT = {
  title: 'Günlük AI işlem limitine ulaştın.',
  description:
    'Free plan üzerinde 24 saatte sınırlı sayıda AI işlemi yapabilirsin. Limitin yenilenmesini bekleyebilir veya sınırsız AI işlemi için paketini yükseltebilirsin.',
  upgradeCta: 'Paketimi yükselt',
}

/* -------------------------------------------------------------------------- */
/* Karşılaştırma                                                               */
/* -------------------------------------------------------------------------- */

export type ComparisonValue = string | boolean

export type ComparisonGroup = {
  category: string
  rows: Array<{
    label: string
    free: ComparisonValue
    starter: ComparisonValue
    pro: ComparisonValue
    ecommerce: ComparisonValue
  }>
}


/* -------------------------------------------------------------------------- */
/* Upgrade deneyimi                                                            */
/* -------------------------------------------------------------------------- */

export type UpgradePrompt = {
  title: string
  description: string
  primaryCta: string
  secondaryCta: string
}

export const UPGRADE_PROMPTS: Record<LockedFeatureKey, UpgradePrompt> = {
  phone: {
    title: 'Telefon butonu Starter ve PRO paketlerinde kullanılabilir.',
    description:
      'Web sitenize telefon butonu ekleyerek müşterilerinizin size doğrudan ulaşmasını sağlayabilirsiniz.',
    primaryCta: 'Starter’a Geç',
    secondaryCta: 'PRO’yu İncele',
  },
  whatsapp: {
    title: 'WhatsApp butonu Starter ve PRO paketlerinde kullanılabilir.',
    description:
      'WhatsApp ile müşterilerinizden doğrudan mesaj alabilirsiniz.',
    primaryCta: 'Starter’a Geç',
    secondaryCta: 'PRO’yu İncele',
  },
  customDomain: {
    title: 'Kendi alan adınla yayına çık.',
    description:
      'Özel domain bağlama Starter ve PRO paketlerinde kullanılabilir. Yıllık paketlerde 1 adet .com.tr domain hediye edilir.',
    primaryCta: 'Starter’a Geç',
    secondaryCta: 'PRO’yu İncele',
  },
  analytics: {
    title: 'Ziyaretçilerini ölçmeye başla.',
    description:
      'Google Analytics ve Search Console bağlantıları Starter ve PRO paketlerinde kullanılabilir.',
    primaryCta: 'Starter’a Geç',
    secondaryCta: 'PRO’yu İncele',
  },
  social: {
    title: 'Sosyal medya bağlantıları Starter ve PRO paketlerinde kullanılabilir.',
    description:
      'Instagram, Facebook, LinkedIn gibi hesaplarını sitene ekleyerek ziyaretçilerini takipçine dönüştür.',
    primaryCta: 'Starter’a Geç',
    secondaryCta: 'PRO’yu İncele',
  },
}

/* -------------------------------------------------------------------------- */
/* Yardımcılar                                                                 */
/* -------------------------------------------------------------------------- */

const tlFormatter = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 0,
})

export function formatTL(amount: number): string {
  return `${tlFormatter.format(amount)} TL`
}

export function planPrice(plan: Plan, cycle: BillingCycle) {
  if (plan.monthlyPrice === 0 && plan.yearlyPrice === 0) {
    return { price: '0 TL', period: null as string | null }
  }
  return cycle === 'yearly'
    ? { price: formatTL(plan.yearlyPrice), period: '/ yıl' }
    : { price: formatTL(plan.monthlyPrice), period: '/ ay' }
}

/** Yıllık ödemede kazanılan avantaj (2 ay bizden). */
export function yearlySavingLabel(plan: Plan): string | null {
  if (plan.monthlyPrice === 0) return null
  const saving = plan.monthlyPrice * 12 - plan.yearlyPrice
  if (saving <= 0) return null
  return `Yıllık ödemede ${formatTL(saving)} avantaj`
}

/** `billing_plans.code` değerini pazarlama paket koduna eşler. */
export function toPlanCode(code: string | null | undefined): PlanCode {
  if (!code) return 'free'
  const normalized = code.toLowerCase()
  if (normalized.includes('ecommerce') || normalized.includes('eticaret')) {
    return 'ecommerce'
  }
  if (normalized.includes('pro')) return 'pro'
  if (normalized.includes('starter')) return 'starter'
  return 'free'
}

/** Telefon / WhatsApp gibi iletişim özellikleri bu paketlerde açıktır. */
export function canUseContactActions(plan: PlanCode): boolean {
  return plan !== 'free'
}

/** AI ile logo oluşturma/yenileme (konuşarak düzenleme dahil) FREE dışındaki paketlerde açıktır. */
export function canUseLogoGeneration(plan: PlanCode): boolean {
  return plan !== 'free'
}
