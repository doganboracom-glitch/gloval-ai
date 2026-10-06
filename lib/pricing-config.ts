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
  | 'advancedSeo'
  | 'aiSiteAudit'
  | 'googleAds'

export type PlanFeature = {
  label: string
  /** Satırın altında gösterilen küçük açıklama. */
  note?: string
  /** Pakete özgü, öne çıkarılması gereken satır. */
  highlight?: boolean
  /** Yalnızca yıllık ödemede geçerli olan satır (aylıkta gizlenir). */
  yearlyOnly?: boolean
}

/* -------------------------------------------------------------------------- */
/* AI kredi sistemi                                                            */
/* -------------------------------------------------------------------------- */

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
    // Aylık yenilenen kredi ödeme dönemine göre değişir: yıllık pakette her ay
    // +150, aylık pakette +50 AI kredisi.
    monthlyCredits: { yearly: 150, monthly: 50 },
    rollover: true,
    maxBalance: 1500,
  },
  ecommerce: {
    // E-ticaret paketi ilk ay 500 AI kredisiyle başlar, sonraki her ay 250 AI
    // kredisi alır (ödeme döneminden bağımsız).
    initialCredits: 500,
    monthlyCredits: 250,
    rollover: false,
  },
} as const

/** PRO paketinde ödeme dönemine göre aylık kazanılan AI kredisi. */
export function proMonthlyCredits(cycle: BillingCycle): number {
  return AI_CREDIT_CONFIG.pro.monthlyCredits[cycle]
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
  starter: 25,
  pro: 100,
  ecommerce: 100,
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
  features: PlanFeature[]
  /** Kartın en altında gösterilen kapsam dışı bilgisi. */
  footnote?: string
}

export const PLANS: Plan[] = [
  {
    code: 'free',
    name: 'FREE',
    headline: 'GLOVAL AI’ı keşfet',
    description: 'Denemek ve ilk siteni oluşturmak için.',
    monthlyPrice: 0,
    yearlyPrice: 0,
    cta: 'Ücretsiz Başla',
    creditSummary: '50 AI işlemi',
    creditNotes: ['Tek seferlik. Aylık yenilenmez.'],
    // Telefon ve WhatsApp bilinçli olarak YOK: kilitli satır olarak da
    // gösterilmez. FREE kullanıcı bu özelliklere editörden erişmeye
    // çalıştığında upgrade mesajı görür (UPGRADE_PROMPTS).
    features: [
      { label: '1 site' },
      { label: '50 AI işlemi', note: 'Tek seferlik', highlight: true },
      { label: '5 sayfaya kadar' },
      { label: 'GLOVAL alt alan adı' },
      { label: 'SSL' },
      { label: 'Mobil uyumluluk' },
      { label: 'Temel SEO' },
      { label: 'İletişim formu' },
      { label: 'Sosyal medya bağlantıları' },
    ],
  },
  {
    code: 'starter',
    name: 'STARTER',
    headline: 'İşletmeni profesyonelleştir',
    description: 'Profesyonel bir web sitesine ihtiyaç duyan işletmeler için.',
    monthlyPrice: 399,
    yearlyPrice: 3990,
    cta: 'Starter ile Başla',
    creditSummary: '150 AI işlemi / 30 gün',
    creditNotes: ['Kullanılmayan AI işlemleri devretmez.'],
    features: [
      { label: '1 site' },
      { label: '25 sayfaya kadar' },
      {
        label: '150 AI işlemi / 30 gün',
        note: 'Kullanılmayan AI işlemleri devretmez.',
        highlight: true,
      },
      { label: 'Özel domain' },
      {
        label: '1 adet .com.tr domain hediyesi',
        note: 'Yıllık paketlerde geçerli.',
        highlight: true,
        yearlyOnly: true,
      },
      { label: 'SSL' },
      { label: 'Mobil uyumluluk' },
      { label: 'SEO' },
      { label: 'Google Analytics' },
      { label: 'Google Search Console' },
      { label: 'Telefon' },
      { label: 'WhatsApp' },
      { label: 'Sosyal medya' },
      { label: 'İletişim formları' },
      { label: 'Otomatik yedekleme' },
      { label: 'Standart destek' },
    ],
  },
  {
    code: 'pro',
    name: 'PRO',
    headline: 'İşletmeni büyüt',
    description:
      'SEO, AI ve büyüme araçlarını aktif olarak kullanmak isteyen işletmeler için.',
    monthlyPrice: 699,
    yearlyPrice: 6990,
    cta: 'PRO ile Büyümeye Başla',
    badge: 'En Çok Tercih Edilen',
    featured: true,
    creditSummary: 'İlk ay 450 AI işlemi',
    creditNotes: [
      'Her ay +150 AI işlemi.',
      'Kullanılmayan AI işlemleri devreder.',
    ],
    features: [
      { label: '3 site' },
      { label: '100 sayfaya kadar' },
      { label: 'İlk ay 450 AI işlemi', highlight: true },
      { label: 'Her ay +150 AI işlemi', highlight: true },
      { label: 'Kullanılmayan AI işlemleri devreder', highlight: true },
      { label: 'Maksimum AI işlem bakiyesi 1.500' },
      { label: 'Özel domain' },
      {
        label: '1 adet .com.tr domain hediyesi',
        note: 'Yıllık paketlerde geçerli.',
        highlight: true,
        yearlyOnly: true,
      },
      { label: 'SSL' },
      { label: 'Mobil uyumluluk' },
      { label: 'Gelişmiş SEO' },
      { label: 'AI SEO özellikleri' },
      { label: 'AI Site Analizi' },
      { label: 'Rakip analizi' },
      { label: 'Google Analytics' },
      { label: 'Google Search Console' },
      { label: 'Gelişmiş ziyaretçi analizi' },
      { label: 'Otomatik yedekleme' },
      { label: 'Versiyon geçmişi' },
      { label: 'Telefon' },
      { label: 'WhatsApp' },
      { label: 'Google Ads özellikleri' },
      { label: 'Growth özellikleri' },
      { label: 'Öncelikli destek' },
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
    creditSummary: 'İlk ay 500 AI işlemi',
    creditNotes: [
      'Sonraki her ay 250 AI işlemi.',
      'E-ticaret içeriklerinde kullanılır.',
    ],
    features: [
      {
        label: '4 site',
        note: '3 kurumsal site + 1 e-ticaret mağazası.',
        highlight: true,
      },
      { label: 'İlk ay 500 AI işlemi', highlight: true },
      { label: 'Sonraki her ay 250 AI işlemi', highlight: true },
      { label: '150 ürün', highlight: true },
      { label: 'Ürün yönetimi' },
      { label: 'Sepet' },
      { label: 'Sipariş yönetimi' },
      { label: 'Ödeme altyapısı' },
      { label: 'PayTR / iyzico entegrasyonu' },
      { label: 'Ürün SEO' },
      { label: 'Mobil uyumlu mağaza' },
      { label: 'WhatsApp' },
      { label: 'Sosyal medya' },
      { label: 'SSL' },
      { label: 'Google SEO' },
      {
        label: '1 adet .com.tr domain hediyesi',
        note: 'Yıllık paketlerde geçerli.',
        highlight: true,
        yearlyOnly: true,
      },
    ],
    footnote:
      'Kargo entegrasyonu, pazaryeri entegrasyonları ve banka ödeme sistemleri temel pakete dahil değildir. Bu hizmetleri daha sonra ek ücretli olarak satın alabilirsin.',
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
    amount: '50 AI işlemi',
    lines: ['Tek seferlik'],
  },
  {
    plan: 'starter',
    name: 'STARTER',
    amount: '150 AI işlemi / 30 gün',
    lines: ['Kullanılmayan AI işlemleri devretmez.'],
  },
  {
    plan: 'pro',
    name: 'PRO',
    amount: '450 AI işlemi ile başlar',
    lines: [
      'Yıllık pakette her ay +150, aylık pakette +50 AI işlemi kazanır.',
      'Kullanılmayan AI işlemleri devreder.',
      'Maksimum bakiye 1.500 AI işlemidir.',
    ],
  },
  {
    plan: 'ecommerce',
    name: 'E-TİCARET',
    amount: 'İlk ay 500 AI işlemi',
    lines: [
      'Sonraki her ay 250 AI işlemi kazanır.',
      'E-ticaret içeriklerinde kullanılır.',
    ],
  },
]

/** Örnek AI işlem maliyetleri — kredi değeri arttıkça sıralanır. */
export const CREDIT_COSTS: Array<{ action: string; credits: number }> = [
  { action: 'Metni düzelt', credits: 1 },
  { action: 'Metni yeniden yaz', credits: 1 },
  { action: 'Başlık oluştur', credits: 1 },
  { action: 'CTA oluştur', credits: 1 },
  { action: 'SEO açıklaması', credits: 1 },
  { action: 'Bölüm içeriği oluştur', credits: 2 },
  { action: 'AI ile logo oluştur (öneri başına)', credits: 2 },
  { action: 'Bölüm tasarımını değiştir', credits: 3 },
  { action: 'Blog yazısı oluştur', credits: 5 },
  { action: 'Sayfa SEO optimizasyonu', credits: 5 },
  { action: 'Yeni sayfa oluştur', credits: 8 },
  { action: 'Sayfa + içerik + SEO', credits: 10 },
  { action: 'Sayfayı tamamen yeniden tasarla', credits: 15 },
  { action: 'SEO analizi', credits: 15 },
  { action: 'Rakip analizi', credits: 15 },
  { action: 'Siteyi AI ile optimize et', credits: 20 },
  { action: 'Komple site analizi', credits: 25 },
  { action: 'Yeni site oluştur', credits: 25 },
]

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

export const COMPARISON: ComparisonGroup[] = [
  {
    category: 'Site',
    rows: [
      { label: 'Site sayısı', free: '1', starter: '1', pro: '3', ecommerce: '4' },
      {
        label: 'Sayfa limiti',
        free: '5',
        starter: '25',
        pro: '100',
        ecommerce: '100',
      },
      { label: 'SSL', free: true, starter: true, pro: true, ecommerce: true },
      {
        label: 'Mobil uyumluluk',
        free: true,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: 'Otomatik yedekleme',
        free: false,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: 'Versiyon geçmişi',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
    ],
  },
  {
    category: 'AI',
    rows: [
      {
        label: 'AI işlemi',
        free: '50 AI işlemi (tek seferlik)',
        starter: '150 AI işlemi / 30 gün',
        pro: '450 AI işlemi + her ay 150 (yıllık) / 50 (aylık)',
        ecommerce: '500 AI işlemi (ilk ay) + her ay 250 AI işlemi',
      },
      {
        label: 'AI işlemi devri',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
      {
        label: 'Maksimum AI işlem bakiyesi',
        free: '—',
        starter: '—',
        pro: '1.500',
        ecommerce: '—',
      },
      {
        label: 'AI SEO özellikleri',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
      {
        label: 'AI Site Analizi',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
      {
        label: 'Rakip analizi',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
    ],
  },
  {
    category: 'Domain',
    rows: [
      {
        label: 'GLOVAL alt alan adı',
        free: true,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: 'Özel domain',
        free: false,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: '.com.tr domain hediyesi',
        free: false,
        starter: 'Yıllık pakette',
        pro: 'Yıllık pakette',
        ecommerce: 'Yıllık pakette',
      },
    ],
  },
  {
    category: 'SEO',
    rows: [
      { label: 'Temel SEO', free: true, starter: true, pro: true, ecommerce: true },
      {
        label: 'Gelişmiş SEO',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
      {
        label: 'Ürün SEO',
        free: false,
        starter: false,
        pro: false,
        ecommerce: true,
      },
    ],
  },
  {
    category: 'Analitik',
    rows: [
      {
        label: 'Google Analytics',
        free: false,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: 'Google Search Console',
        free: false,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      {
        label: 'Gelişmiş ziyaretçi analizi',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
    ],
  },
  {
    category: 'İletişim',
    rows: [
      {
        label: 'İletişim formu',
        free: true,
        starter: true,
        pro: true,
        ecommerce: true,
      },
      { label: 'Telefon', free: false, starter: true, pro: true, ecommerce: false },
      { label: 'WhatsApp', free: false, starter: true, pro: true, ecommerce: true },
      {
        label: 'Sosyal medya',
        free: true,
        starter: true,
        pro: true,
        ecommerce: true,
      },
    ],
  },
  {
    category: 'Büyüme',
    rows: [
      {
        label: 'Google Ads özellikleri',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
      {
        label: 'Growth özellikleri',
        free: false,
        starter: false,
        pro: true,
        ecommerce: false,
      },
    ],
  },
  {
    category: 'Destek',
    rows: [
      {
        label: 'Destek',
        free: 'Topluluk',
        starter: 'Standart',
        pro: 'Öncelikli',
        ecommerce: 'Standart',
      },
    ],
  },
  {
    category: 'E-ticaret',
    rows: [
      {
        label: 'Ürün yönetimi',
        free: false,
        starter: false,
        pro: false,
        ecommerce: true,
      },
      { label: 'Ürün limiti', free: '—', starter: '—', pro: '—', ecommerce: '100' },
      {
        label: 'Sepet ve sipariş yönetimi',
        free: false,
        starter: false,
        pro: false,
        ecommerce: true,
      },
      {
        label: 'Ödeme altyapısı (PayTR / iyzico — yakında)',
        free: false,
        starter: false,
        pro: false,
        ecommerce: true,
      },
      {
        label: 'Kargo / pazaryeri / banka entegrasyonu',
        free: false,
        starter: false,
        pro: false,
        ecommerce: 'Ek ücretli',
      },
    ],
  },
]

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
  advancedSeo: {
    title: 'Gelişmiş SEO araçlarını aç.',
    description:
      'Gelişmiş SEO ve AI SEO özellikleri PRO pakette kullanılabilir.',
    primaryCta: 'PRO’yu İncele',
    secondaryCta: 'Starter’ı İncele',
  },
  aiSiteAudit: {
    title: 'AI Site Analizi PRO pakette.',
    description:
      'Sitenin tamamını analiz eden, rakiplerini karşılaştıran ve iyileştirme önerileri üreten AI araçları PRO pakette kullanılabilir.',
    primaryCta: 'PRO’yu İncele',
    secondaryCta: 'Starter’ı İncele',
  },
  googleAds: {
    title: 'Google Ads özellikleri PRO pakette.',
    description:
      'Google Ads kurulumu, AI reklam önerileri ve growth araçları PRO paketiyle birlikte gelir.',
    primaryCta: 'PRO’yu İncele',
    secondaryCta: 'Starter’ı İncele',
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

/**
 * Ödeme dönemine göre paketi çözümler. PRO'nun aylık kazandığı AI kredisi
 * yıllıkta +150, aylıkta +50 olduğu için ilgili özet/not/özellik satırları
 * seçilen döneme göre yeniden yazılır. Diğer paketler değişmeden döner;
 * böylece mevcut yapı korunur, sadece PRO'nun kredi metni dinamikleşir.
 */
export function resolvePlanForCycle(plan: Plan, cycle: BillingCycle): Plan {
  if (plan.code !== 'pro') return plan
  const monthly = proMonthlyCredits(cycle)
  const monthlyLabel = `Her ay +${monthly} AI işlemi`
  return {
    ...plan,
    creditNotes: [
      `${monthlyLabel}.`,
      'Kullanılmayan AI işlemleri devreder.',
    ],
    features: plan.features.map((feature) =>
      feature.label.startsWith('Her ay +')
        ? { ...feature, label: monthlyLabel }
        : feature,
    ),
  }
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
