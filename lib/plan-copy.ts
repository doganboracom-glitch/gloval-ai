import {
  AI_CREDIT_CONFIG,
  ECOMMERCE_SITE_LIMITS,
  PRODUCT_LIMITS,
  SITE_LIMITS,
  effectivePageLimit,
  formatTL,
  type BillingCycle,
  type ComparisonGroup,
  type ComparisonValue,
  type Plan,
  type PlanCode,
} from '@/lib/pricing-config'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'
import { ADVANCED_AI_DISTINCT } from '@/lib/ai-models'
import { CATALOG_MODE_LIVE, CATALOG_PRODUCT_LIMIT } from '@/lib/commerce-mode'
import { BLOG_MAX_POSTS } from '@/lib/blog'

/**
 * User-facing plan copy (TR + EN only; every other language falls back to EN).
 *
 * This file only decides how plans are DESCRIBED. Prices, limits, credits and
 * mailbox counts are read from `pricing-config.ts` and `access-state.ts`, so
 * the wording can change without touching behaviour. The shared 11-language
 * dictionary is intentionally not used here.
 *
 * It is the ONLY place feature rows are written down. The plan cards use
 * `buildPlanView` and the comparison table is DERIVED from the very same items
 * by `buildComparison`, so the two can never disagree. Only features that exist
 * in the product may be listed here.
 *
 * Cards are INCREMENTAL: STARTER lists everything it has, PRO lists only what
 * it adds on top of STARTER, and E-COMMERCE only what it adds on top of PRO.
 * The comparison table applies the same inheritance (free -> starter -> pro ->
 * ecommerce).
 */

export type CopyLang = 'tr' | 'en'

export function copyLang(lang: string | null | undefined): CopyLang {
  return lang === 'tr' ? 'tr' : 'en'
}

export type GroupKey = 'site' | 'store' | 'email' | 'support'

export type PlanCopyItem = {
  /** Stable feature id; the comparison table matches rows on it. */
  id: string
  label: string
  note?: string
  highlight?: boolean
  /** Rendered as "not included" (muted, minus icon). */
  excluded?: boolean
  /** Row label in the comparison table when it differs from the card label. */
  rowLabel?: string
  /** Comparison cell text for limit-style rows (e.g. "3", "8"). */
  value?: string
  /** Feature is announced but not live yet; the table shows "Soon". */
  soon?: boolean
  /** Faded pill rendered next to the card label (e.g. "Yakında"). */
  badge?: string
  /** Lists the row under another comparison category than its card group. */
  tableGroup?: 'ai' | 'content'
  /**
   * Position in the plan's "most valuable" ranking (0 = most valuable). Set by
   * `buildPlanView` from `PINNED_ITEM_IDS`; the collapsed card shows these first.
   */
  pin?: number
}

export type PlanCopyOptions = {
  /** Show the advanced-AI row. Defaults to the live model flag. */
  advancedAi?: boolean
}

export type PlanCopyGroup = {
  key: GroupKey
  title: string
  items: PlanCopyItem[]
}

export type PlanView = {
  code: PlanCode
  name: string
  headline: string
  description: string
  cta: string
  badge?: string
  creditSummary: string
  creditNotes: string[]
  /** Set on cards that only list what they add on top of a lower plan. */
  extendsLabel?: string
  groups: PlanCopyGroup[]
}

export type CommonPlanCopy = {
  noCardRequired: string
  currentPlan: string
  yearlyHighlight: string
  domainGift: string
  perMonth: string
  perYear: string
  /** Feature-list toggle under each plan card. */
  showAllFeatures: string
  showFewerFeatures: string
  /** Tooltip of the "i" icon in the credit box (rollover + balance cap). */
  maxBalanceTip: (maxBalance: string) => string
  saving: (amountTL: string) => string
}

export type ComparisonCopy = {
  toggle: string
  featureColumn: string
  yes: string
  no: string
  /** Mobile plan picker: tablist label and the highlight on the popular plan. */
  planPicker: string
  popular: string
}

type Strings = {
  common: CommonPlanCopy
  comparison: ComparisonCopy & {
    soon: string
    groups: Record<GroupKey | 'ai' | 'content', string>
    ai: {
      credits: string
      rollover: string
      maxBalance: string
      creditsValue: (code: PlanCode, nf: Intl.NumberFormat) => string
    }
  }
  /** Card section titles (the first one is the "what's included" heading). */
  groups: Record<GroupKey, string>
  extendsLabel: {
    starter: string
    pro: string
  }
  plans: Record<
    PlanCode,
    {
      name: string
      headline: string
      description: string
      cta: string
      badge?: string
    }
  >
  credits: {
    freeSummary: (n: string) => string
    freeNote: string
    starterSummary: (n: string) => string
    starterNote: string
    firstPeriod: (n: string) => string
    following: (n: string) => string
    rollover: string
  }
  f: {
    sites: (n: number) => string
    sitesRight: (n: number) => string
    rowSites: string
    ecomSites: (corporate: number, store: number) => string
    glovalAddress: string
    pagesUpTo: (n: number) => string
    rowPages: string
    ssl: string
    sslNote: string
    mobile: string
    basicSeo: string
    seo: string
    seoRow: string
    seoNote: string
    contactSection: string
    contactSectionNote: string
    blog: string
    blogNote: (maxPosts: string) => string
    blogAi: string
    blogAiNote: (maxPosts: string) => string
    versionHistory: string
    versionHistoryNote: string
    autoBackupWeekly: string
    autoBackupDaily: string
    autoBackupRow: string
    autoBackupNote: string
    autoBackupWeeklyValue: string
    autoBackupDailyValue: string
    versionHistoryRestore: string
    versionHistoryRestoreNote: string
    customDomain: string
    trackingCodes: string
    trackingCodesNote: string
    phoneWhatsapp: string
    socialLinks: string
    socialLinksNote: string
    logoStudio: string
    logoStudioNote: string
    products: (n: number) => string
    catalogOrder: (n: number) => string
    rowProducts: string
    productMgmt: string
    collections: string
    stock: string
    vat: string
    cartOrders: string
    cartOrdersNote: string
    customers: string
    customersNote: string
    paymentMethods: string
    paymentMethodsNote: string
    cardSoon: string
    shipping: string
    shippingNote: string
    orderMails: string
    aiProduct: string
    aiProductNote: string
    advancedAi: string
    advancedAiNote: string
    legalDocs: string
    legalDocsNote: string
    productSeo: string
    productSeoNote: string
    storePages: string
    storePagesNote: string
    mailboxes: (n: number) => string
    rowMailboxes: string
    mailNote: string
    standardSupport: string
    prioritySupport: string
    rowSupport: string
    supportStandardValue: string
    supportPriorityValue: string
  }
}

const TR: Strings = {
  common: {
    noCardRequired: 'Kredi kartı gerekmez',
    currentPlan: 'Mevcut paketin',
    yearlyHighlight: '10 ay öde, 12 ay kullan + .com.tr alan adı hediye',
    domainGift: '.com.tr alan adı hediye',
    perMonth: '/ ay',
    perYear: '/ yıl',
    showAllFeatures: 'Tüm özellikleri göster',
    showFewerFeatures: 'Daha az göster',
    maxBalanceTip: (n) =>
      `Kullanılmayan işlemler devreder; en fazla ${n} işlem bakiyesi birikebilir`,
    saving: (amount) => `Yıllık ödemede ${amount} avantaj`,
  },
  comparison: {
    toggle: 'Paket özelliklerini karşılaştır',
    featureColumn: 'Özellik',
    yes: 'Var',
    no: 'Yok',
    planPicker: 'Paket seç',
    popular: 'En çok tercih edilen',
    soon: 'Yakında',
    groups: {
      ai: 'Yapay zeka işlemleri',
      content: 'İçerik ve blog',
      site: 'Site',
      store: 'Mağaza',
      email: 'E-posta',
      support: 'Destek',
    },
    ai: {
      credits: 'Yapay zeka işlemi',
      rollover: 'Kullanılmayan işlemler devreder',
      maxBalance: 'Maksimum işlem bakiyesi',
      creditsValue: (code, nf) => {
        const c = AI_CREDIT_CONFIG
        if (code === 'free') return `${nf.format(c.free.credits)} (bir defa)`
        if (code === 'starter') {
          return `${nf.format(c.starter.credits)} / ${c.starter.creditPeriodDays} gün`
        }
        const p = code === 'pro' ? c.pro : c.ecommerce
        return `${nf.format(p.initialCredits)} + ${nf.format(p.monthlyCredits)} / ay`
      },
    },
  },
  groups: {
    site: 'Pakete neler dahil',
    store: 'Mağaza',
    email: 'E-posta',
    support: 'Destek',
  },
  extendsLabel: {
    starter: 'STARTER PAKET’E EK OLARAK',
    pro: 'PRO PAKET’E EK OLARAK',
  },
  plans: {
    free: {
      name: 'FREE',
      headline: 'GLOVAL AI’ı keşfet',
      description: 'Denemek ve ilk siteni oluşturmak için.',
      cta: 'Ücretsiz Başla',
    },
    starter: {
      name: 'STARTER',
      headline: 'İşletmeni profesyonelleştir',
      description: 'Profesyonel bir web sitesine ihtiyaç duyan işletmeler için.',
      cta: 'Starter ile Başla',
    },
    pro: {
      name: 'PRO',
      headline: 'İşletmeni büyüt',
      description: 'Birden fazla site ve daha fazla yapay zeka işlemi isteyen işletmeler için.',
      cta: 'PRO ile Büyümeye Başla',
      badge: 'En Çok Tercih Edilen',
    },
    ecommerce: {
      name: 'E-TİCARET',
      headline: 'Ürünlerini online sat',
      description: 'Mağazasını internete taşımak isteyen işletmeler için.',
      cta: 'E-Ticarete Başla',
    },
  },
  credits: {
    freeSummary: (n) => `${n} yapay zeka işlemi`,
    freeNote: 'Bir defalık. Aylık yenilenmez.',
    starterSummary: (n) => `${n} yapay zeka işlemi / 30 gün`,
    starterNote: 'Kullanılmayan işlemler devretmez.',
    firstPeriod: (n) => `İlk ay ${n} yapay zeka işlemi`,
    following: (n) => `Sonraki dönemlerde ${n} yapay zeka işlemi.`,
    rollover: 'Kullanılmayan işlemler devreder.',
  },
  f: {
    sites: (n) => `${n} site`,
    sitesRight: (n) => `${n} site hakkı`,
    rowSites: 'Site hakkı',
    ecomSites: (c, s) => `${c + s} site hakkı`,
    glovalAddress: 'xxx.gloval.site adresi',
    pagesUpTo: (n) => `${n} sayfaya kadar`,
    rowPages: 'Sayfa limiti (site başına)',
    ssl: 'SSL',
    sslNote: 'Adres çubuğunda kilit simgesi: güvenli bağlantı.',
    mobile: 'Mobil uyumluluk',
    basicSeo: 'Temel SEO',
    seo: 'SEO uyumlu',
    seoRow: 'SEO ayarları (başlık, açıklama, site haritası)',
    seoNote: 'Arama motorlarında bulunmanıza yardımcı olur.',
    contactSection: 'İletişim bölümü',
    contactSectionNote: 'E-posta, telefon ve adres bilgilerini sitende göster.',
    blog: 'Site blogu (ayrı blog sayfaları + AI yazı üretimi)',
    blogNote: (n) => `Sitende ayrı blog sayfaları açılır; yazılarını kendin yazıp yayınlayabilirsin. Site başına en fazla ${n} yazı.`,
    blogAi: 'AI yazı üretimi (kredi ile)',
    blogAiNote: (n) => `AI ile yazı taslağı hazırlamak AI işlemi (kredi) kullanır; elle yazı eklemek işlem harcamaz. Site başına en fazla ${n} yazı.`,
    versionHistory: 'Sürüm geçmişi',
    versionHistoryNote: 'Kaydettiğin önceki sürümlere geri dön.',
    autoBackupWeekly: 'Haftalık otomatik yedekleme',
    autoBackupDaily: 'Günlük otomatik yedekleme (son 14 gün)',
    autoBackupRow: 'Otomatik yedekleme',
    autoBackupNote: 'Sitenin taslağı otomatik yedeklenir; yedekler hesabında saklanır.',
    autoBackupWeeklyValue: 'Haftalık',
    autoBackupDailyValue: 'Günlük (son 14 gün)',
    versionHistoryRestore: 'Sürüm geçmişi ve geri yükleme',
    versionHistoryRestoreNote: 'Kaydettiğin önceki sürümlere ve yedeklere geri dön.',
    customDomain: 'Kendi alan adını bağla',
    trackingCodes: 'Analytics ve Search Console kodu ekleme',
    trackingCodesNote: 'Takip ve doğrulama kodlarını sitene yapıştır.',
    phoneWhatsapp: 'Telefon ve WhatsApp butonları',
    socialLinks: 'Sosyal medya bağlantıları',
    socialLinksNote: 'Instagram, Facebook, LinkedIn ve diğer hesapların sitende görünür.',
    logoStudio: 'AI logo stüdyosu ve marka kiti',
    logoStudioNote: 'Logo önerileri, marka kiti ve favicon.',
    products: (n) => `${n} ürün`,
    catalogOrder: (n) => `Ürün kataloğu (${n} ürüne kadar) ve WhatsApp ile sipariş`,
    rowProducts: 'Ürün limiti',
    productMgmt: 'Ürün yönetimi',
    collections: 'Ürün koleksiyonları',
    stock: 'Stok yönetimi',
    vat: 'KDV ayarı',
    cartOrders: 'Sepet ve sipariş yönetimi',
    cartOrdersNote: 'Siparişleri panelden takip et ve durumunu güncelle.',
    customers: 'Müşteri hesapları ve müşteri listesi',
    customersNote: 'Alıcılar hesap açabilir; müşterilerini panelden görürsün.',
    paymentMethods: 'Havale/EFT ve kapıda ödeme',
    paymentMethodsNote: 'Ödeme yöntemlerini mağaza ayarlarından aç veya kapat.',
    cardSoon: 'Kart ile ödeme (yakında)',
    shipping: 'Kargo ücreti ve kargo takip bilgisi',
    shippingNote: 'Kargo ücretini belirle; kargoya verilince alıcıya takip e-postası gider.',
    orderMails: 'Sipariş e-posta bildirimleri',
    aiProduct: 'Yapay zeka ürün asistanı',
    aiProductNote: 'Ürün metni ve görseli üretir (işlem kullanır).',
    advancedAi: 'Gelişmiş AI işlemleri',
    advancedAiNote:
      'Site oluşturma, ürün metni ve logo çizimi daha gelişmiş modelle çalışır. Kredi fiyatları değişmez.',
    legalDocs: 'Resmi metin şablonları',
    legalDocsNote: 'Mesafeli satış, iptal ve iade, gizlilik şablonları; düzenlenebilir.',
    productSeo: 'Ürün SEO',
    productSeoNote: 'Ürünlerinizin arama motorlarında bulunmasına yardımcı olur.',
    storePages: 'Hazır mağaza sayfaları',
    storePagesNote:
      'Ürün listesi, ürün detayı, sepet ve sipariş sayfaları sitenizin içinde hazır gelir.',
    mailboxes: (n) => `${n} kurumsal e-posta`,
    rowMailboxes: 'Kurumsal e-posta adresi',
    mailNote: 'info@firmaadi.com gibi kendi alan adınızla e-posta adresleri.',
    standardSupport: 'Standart destek',
    prioritySupport: 'Öncelikli destek',
    rowSupport: 'Destek',
    supportStandardValue: 'Standart',
    supportPriorityValue: 'Öncelikli',
  },
}

const EN: Strings = {
  common: {
    noCardRequired: 'No credit card required',
    currentPlan: 'Your current plan',
    yearlyHighlight: 'Pay for 10 months, use 12 + free .com.tr domain',
    domainGift: 'Free .com.tr domain',
    perMonth: '/ month',
    perYear: '/ year',
    showAllFeatures: 'Show all features',
    showFewerFeatures: 'Show less',
    maxBalanceTip: (n) =>
      `Unused actions carry over; up to ${n} actions can accumulate`,
    saving: (amount) => `Save ${amount} with yearly billing`,
  },
  comparison: {
    toggle: 'Compare plan features',
    featureColumn: 'Feature',
    yes: 'Included',
    no: 'Not included',
    planPicker: 'Choose a plan',
    popular: 'Most popular',
    soon: 'Soon',
    groups: {
      ai: 'AI actions',
      content: 'Content and blog',
      site: 'Site',
      store: 'Store',
      email: 'Email',
      support: 'Support',
    },
    ai: {
      credits: 'AI actions',
      rollover: 'Unused actions carry over',
      maxBalance: 'Maximum action balance',
      creditsValue: (code, nf) => {
        const c = AI_CREDIT_CONFIG
        if (code === 'free') return `${nf.format(c.free.credits)} (one-time)`
        if (code === 'starter') {
          return `${nf.format(c.starter.credits)} / ${c.starter.creditPeriodDays} days`
        }
        const p = code === 'pro' ? c.pro : c.ecommerce
        return `${nf.format(p.initialCredits)} + ${nf.format(p.monthlyCredits)} / mo`
      },
    },
  },
  groups: {
    site: 'What’s included',
    store: 'Store',
    email: 'Email',
    support: 'Support',
  },
  extendsLabel: {
    starter: 'IN ADDITION TO THE STARTER PLAN',
    pro: 'IN ADDITION TO THE PRO PLAN',
  },
  plans: {
    free: {
      name: 'FREE',
      headline: 'Discover GLOVAL AI',
      description: 'To try it out and build your first site.',
      cta: 'Start for Free',
    },
    starter: {
      name: 'STARTER',
      headline: 'Make your business look professional',
      description: 'For businesses that need a professional website.',
      cta: 'Start with Starter',
    },
    pro: {
      name: 'PRO',
      headline: 'Grow your business',
      description: 'For businesses that want several sites and more AI actions.',
      cta: 'Start Growing with PRO',
      badge: 'Most Popular',
    },
    ecommerce: {
      name: 'E-COMMERCE',
      headline: 'Sell your products online',
      description: 'For businesses that want to take their store online.',
      cta: 'Start Selling',
    },
  },
  credits: {
    freeSummary: (n) => `${n} AI actions`,
    freeNote: 'One-time. Does not renew monthly.',
    starterSummary: (n) => `${n} AI actions / 30 days`,
    starterNote: 'Unused actions do not carry over.',
    firstPeriod: (n) => `${n} AI actions in the first month`,
    following: (n) => `${n} AI actions in following periods.`,
    rollover: 'Unused actions carry over.',
  },
  f: {
    sites: (n) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    sitesRight: (n) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    rowSites: 'Sites',
    ecomSites: (c, s) => `${c + s} sites`,
    glovalAddress: 'xxx.gloval.site address',
    pagesUpTo: (n) => `Up to ${n} pages`,
    rowPages: 'Page limit (per site)',
    ssl: 'SSL',
    sslNote: 'A padlock in the address bar: a secure connection.',
    mobile: 'Mobile friendly',
    basicSeo: 'Basic SEO',
    seo: 'SEO friendly',
    seoRow: 'SEO settings (title, description, sitemap)',
    seoNote: 'Helps people find you in search engines.',
    contactSection: 'Contact section',
    contactSectionNote: 'Show your email, phone and address on your site.',
    blog: 'Site blog (separate blog pages + AI post writing)',
    blogNote: (n) => `Your site gets its own blog pages; you can write and publish posts yourself. Up to ${n} posts per site.`,
    blogAi: 'AI post writing (uses credits)',
    blogAiNote: (n) => `Drafting a post with AI uses AI actions (credits); adding a post by hand does not. Up to ${n} posts per site.`,
    versionHistory: 'Version history',
    versionHistoryNote: 'Go back to earlier versions you saved.',
    autoBackupWeekly: 'Weekly automatic backups',
    autoBackupDaily: 'Daily automatic backups (last 14 days)',
    autoBackupRow: 'Automatic backups',
    autoBackupNote: 'Your site draft is backed up automatically; backups are kept in your account.',
    autoBackupWeeklyValue: 'Weekly',
    autoBackupDailyValue: 'Daily (last 14 days)',
    versionHistoryRestore: 'Version history and restore',
    versionHistoryRestoreNote: 'Go back to earlier versions and backups you saved.',
    customDomain: 'Connect your own domain',
    trackingCodes: 'Add Analytics and Search Console code',
    trackingCodesNote: 'Paste your tracking and verification code into your site.',
    phoneWhatsapp: 'Phone and WhatsApp buttons',
    socialLinks: 'Social media links',
    socialLinksNote: 'Show your Instagram, Facebook, LinkedIn and other accounts on your site.',
    logoStudio: 'AI logo studio and brand kit',
    logoStudioNote: 'Logo suggestions, brand kit and favicon.',
    products: (n) => `${n} products`,
    catalogOrder: (n) => `Product catalog (up to ${n} products) and ordering via WhatsApp`,
    rowProducts: 'Product limit',
    productMgmt: 'Product management',
    collections: 'Product collections',
    stock: 'Stock management',
    vat: 'VAT setting',
    cartOrders: 'Cart and order management',
    cartOrdersNote: 'Track orders from the panel and update their status.',
    customers: 'Customer accounts and customer list',
    customersNote: 'Buyers can create accounts; you see your customers in the panel.',
    paymentMethods: 'Bank transfer and cash on delivery',
    paymentMethodsNote: 'Turn payment methods on or off in the store settings.',
    cardSoon: 'Card payments (coming soon)',
    shipping: 'Shipping fee and tracking info',
    shippingNote: 'Set your shipping fee; buyers get a tracking email when it ships.',
    orderMails: 'Order email notifications',
    aiProduct: 'AI product assistant',
    aiProductNote: 'Writes product text and images (uses AI actions).',
    advancedAi: 'Advanced AI actions',
    advancedAiNote:
      'Site creation, product text and logo drawing run on a more advanced model. Credit prices stay the same.',
    legalDocs: 'Legal document templates',
    legalDocsNote: 'Distance sales, cancellation and refund, privacy templates; editable.',
    productSeo: 'Product SEO',
    productSeoNote: 'Helps people find your products in search engines.',
    storePages: 'Ready-made store pages',
    storePagesNote:
      'Product list, product detail, cart and order pages come ready inside your site.',
    mailboxes: (n) => `${n} business ${n === 1 ? 'email' : 'emails'}`,
    rowMailboxes: 'Business email addresses',
    mailNote: 'Email addresses on your own domain, like info@yourcompany.com.',
    standardSupport: 'Standard support',
    prioritySupport: 'Priority support',
    rowSupport: 'Support',
    supportStandardValue: 'Standard',
    supportPriorityValue: 'Priority',
  },
}

const STRINGS: Record<CopyLang, Strings> = { tr: TR, en: EN }

export function getCommonPlanCopy(lang: string | null | undefined): CommonPlanCopy {
  return STRINGS[copyLang(lang)].common
}

export function getComparisonCopy(lang: string | null | undefined): ComparisonCopy {
  const { toggle, featureColumn, yes, no, planPicker, popular } =
    STRINGS[copyLang(lang)].comparison
  return { toggle, featureColumn, yes, no, planPicker, popular }
}

function numberFormatter(lang: CopyLang) {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US')
}

/** Nothing is shown for a plan without mailboxes (FREE): no "not included" row. */
function mailGroup(s: Strings, code: PlanCode): PlanCopyGroup[] {
  const count = PLAN_INCLUDED_MAILBOXES[code]
  if (count <= 0) return []
  return [
    {
      key: 'email',
      title: s.groups.email,
      items: [
        {
          id: 'mailboxes',
          label: s.f.mailboxes(count),
          rowLabel: s.f.rowMailboxes,
          value: String(count),
          note: s.f.mailNote,
          highlight: true,
        },
      ],
    },
  ]
}

/**
 * Everything a plan lists on its own, BEFORE de-duplication against the plan
 * below. TR and EN share this single structure, so both languages always list
 * the same groups and items in the same order.
 */
function buildRawPlanView(
  code: PlanCode,
  langInput: string | null | undefined,
  options: PlanCopyOptions = {},
): PlanView {
  const lang = copyLang(langInput)
  const s = STRINGS[lang]
  const nf = numberFormatter(lang)
  const base = s.plans[code]
  const { f, groups: g } = s
  const advancedAiItems: PlanCopyItem[] =
    (options.advancedAi ?? ADVANCED_AI_DISTINCT)
      ? [{ id: 'advancedAi', label: f.advancedAi, note: f.advancedAiNote, tableGroup: 'ai' }]
      : []

  // Blog is not plan-gated: every plan gets it, capped at BLOG_MAX_POSTS per site.
  // Writing with AI is the only part that spends credits.
  const blogMaxPosts = nf.format(BLOG_MAX_POSTS)
  const blogItems: PlanCopyItem[] = [
    {
      id: 'blog',
      label: f.blog,
      rowLabel: f.blog,
      note: f.blogNote(blogMaxPosts),
      tableGroup: 'content',
    },
    {
      id: 'blogAi',
      label: f.blogAi,
      note: f.blogAiNote(blogMaxPosts),
      tableGroup: 'content',
    },
  ]

  const head = {
    code,
    name: base.name,
    headline: base.headline,
    description: base.description,
    cta: base.cta,
    badge: base.badge,
  }

  const sitesItem = (label: string, highlight = false): PlanCopyItem => ({
    id: 'sites',
    label,
    rowLabel: f.rowSites,
    value: String(SITE_LIMITS[code]),
    highlight,
  })
  const pagesItem = (): PlanCopyItem => ({
    id: 'pages',
    label: f.pagesUpTo(effectivePageLimit(code)),
    rowLabel: f.rowPages,
    value: String(effectivePageLimit(code)),
  })

  // Both rows are live: the daily/weekly cron step and the restore flow exist and run.
  const autoBackupItem = (label: string, value: string): PlanCopyItem => ({
    id: 'autoBackup',
    label,
    rowLabel: f.autoBackupRow,
    value,
    note: f.autoBackupNote,
  })
  const versionHistoryRestoreItem = (): PlanCopyItem => ({
    id: 'versionHistory',
    label: f.versionHistoryRestore,
    note: f.versionHistoryRestoreNote,
  })

  // Announced, not built yet: faded row with a "Yakında" pill, never a link.
  const glovalAdsItem = (): PlanCopyItem => ({
    id: 'glovalAds',
    label: GLOVAL_ADS_LABEL,
    badge: s.comparison.soon,
    excluded: true,
    soon: true,
  })

  if (code === 'free') {
    return {
      ...head,
      creditSummary: s.credits.freeSummary(nf.format(AI_CREDIT_CONFIG.free.credits)),
      creditNotes: [s.credits.freeNote],
      groups: [
        {
          key: 'site',
          title: g.site,
          items: [
            sitesItem(f.sites(SITE_LIMITS.free)),
            pagesItem(),
            { id: 'glovalAddress', label: f.glovalAddress },
            { id: 'ssl', label: f.ssl, note: f.sslNote },
            { id: 'mobile', label: f.mobile },
            { id: 'seo', label: f.basicSeo, rowLabel: f.seoRow, note: f.seoNote },
            { id: 'contact', label: f.contactSection, note: f.contactSectionNote },
            ...blogItems,
          ],
        },
        ...mailGroup(s, code),
      ],
    }
  }

  if (code === 'starter') {
    return {
      ...head,
      creditSummary: s.credits.starterSummary(nf.format(AI_CREDIT_CONFIG.starter.credits)),
      creditNotes: [s.credits.starterNote],
      groups: [
        {
          key: 'site',
          title: g.site,
          items: [
            sitesItem(f.sites(SITE_LIMITS.starter)),
            pagesItem(),
            { id: 'customDomain', label: f.customDomain },
            { id: 'ssl', label: f.ssl, note: f.sslNote },
            { id: 'mobile', label: f.mobile },
            { id: 'seo', label: f.seo, rowLabel: f.seoRow, note: f.seoNote },
            { id: 'contact', label: f.contactSection, note: f.contactSectionNote },
            ...blogItems,
            autoBackupItem(f.autoBackupWeekly, f.autoBackupWeeklyValue),
            { id: 'trackingCodes', label: f.trackingCodes, note: f.trackingCodesNote },
            { id: 'phoneWhatsapp', label: f.phoneWhatsapp },
            { id: 'socialLinks', label: f.socialLinks, note: f.socialLinksNote },
            { id: 'logoStudio', label: f.logoStudio, note: f.logoStudioNote },
          ],
        },
        ...mailGroup(s, code),
        {
          key: 'support',
          title: g.support,
          items: [
            {
              id: 'support',
              label: f.standardSupport,
              rowLabel: f.rowSupport,
              value: f.supportStandardValue,
            },
          ],
        },
      ],
    }
  }

  if (code === 'pro') {
    // Pages are inherited from STARTER; only mention them if the limits diverge.
    const pageItems =
      effectivePageLimit('pro') === effectivePageLimit('starter') ? [] : [pagesItem()]
    return {
      ...head,
      extendsLabel: s.extendsLabel.starter,
      creditSummary: s.credits.firstPeriod(nf.format(AI_CREDIT_CONFIG.pro.initialCredits)),
      creditNotes: [
        s.credits.following(nf.format(AI_CREDIT_CONFIG.pro.monthlyCredits)),
        s.credits.rollover,
      ],
      groups: [
        {
          key: 'site',
          title: g.site,
          items: [
            sitesItem(f.sitesRight(SITE_LIMITS.pro), true),
            ...pageItems,
            autoBackupItem(f.autoBackupDaily, f.autoBackupDailyValue),
            versionHistoryRestoreItem(),
            ...advancedAiItems,
            glovalAdsItem(),
            ...(CATALOG_MODE_LIVE
              ? [{ id: 'catalogOrder', label: f.catalogOrder(CATALOG_PRODUCT_LIMIT) } as PlanCopyItem]
              : []),
          ],
        },
        ...mailGroup(s, code),
        {
          key: 'support',
          title: g.support,
          items: [
            {
              id: 'support',
              label: f.prioritySupport,
              rowLabel: f.rowSupport,
              value: f.supportPriorityValue,
            },
          ],
        },
      ],
    }
  }

  const corporateSites = SITE_LIMITS.ecommerce - ECOMMERCE_SITE_LIMITS.ecommerce
  const pageItems =
    effectivePageLimit('ecommerce') === effectivePageLimit('pro') ? [] : [pagesItem()]

  return {
    ...head,
    extendsLabel: s.extendsLabel.pro,
    creditSummary: s.credits.firstPeriod(nf.format(AI_CREDIT_CONFIG.ecommerce.initialCredits)),
    creditNotes: [
      s.credits.following(nf.format(AI_CREDIT_CONFIG.ecommerce.monthlyCredits)),
      s.credits.rollover,
    ],
    groups: [
      {
        key: 'site',
        title: g.site,
        items: [
          sitesItem(f.ecomSites(corporateSites, ECOMMERCE_SITE_LIMITS.ecommerce), true),
          ...pageItems,
          autoBackupItem(f.autoBackupDaily, f.autoBackupDailyValue),
          versionHistoryRestoreItem(),
          ...advancedAiItems,
          glovalAdsItem(),
        ],
      },
      {
        key: 'store',
        title: g.store,
        items: [
          {
            id: 'products',
            label: f.products(PRODUCT_LIMITS.ecommerce ?? 0),
            rowLabel: f.rowProducts,
            value: String(PRODUCT_LIMITS.ecommerce ?? 0),
            highlight: true,
          },
          { id: 'productMgmt', label: f.productMgmt },
          { id: 'collections', label: f.collections },
          { id: 'stock', label: f.stock },
          { id: 'vat', label: f.vat },
          { id: 'cartOrders', label: f.cartOrders, note: f.cartOrdersNote },
          { id: 'customers', label: f.customers, note: f.customersNote },
          { id: 'paymentMethods', label: f.paymentMethods, note: f.paymentMethodsNote },
          { id: 'cardSoon', label: f.cardSoon, excluded: true, soon: true },
          { id: 'shipping', label: f.shipping, note: f.shippingNote },
          { id: 'orderMails', label: f.orderMails },
          { id: 'aiProduct', label: f.aiProduct, note: f.aiProductNote },
          { id: 'legalDocs', label: f.legalDocs, note: f.legalDocsNote },
          { id: 'productSeo', label: f.productSeo, note: f.productSeoNote },
          { id: 'storePages', label: f.storePages, note: f.storePagesNote },
        ],
      },
      ...mailGroup(s, code),
    ],
  }
}

export const GLOVAL_ADS_LABEL = 'GLOVAL ADS'

const PLAN_ORDER: PlanCode[] = ['free', 'starter', 'pro', 'ecommerce']

/** Each plan includes everything the plan below it has. */
const PARENT_PLAN: Record<PlanCode, PlanCode | null> = {
  free: null,
  starter: 'free',
  pro: 'starter',
  ecommerce: 'pro',
}

const GROUP_ORDER: Array<GroupKey | 'content'> = ['site', 'content', 'store', 'email', 'support']

/** How many feature rows a collapsed plan card shows. */
export const PLAN_VISIBLE_ITEM_COUNT = 6

/**
 * The most valuable rows of each plan, best first. The collapsed card shows
 * these (topped up in list order if a plan has fewer than six); everything else
 * sits behind "Show all features". Ids that a plan does not list (or that were
 * de-duplicated away) are simply skipped.
 */
export const PINNED_ITEM_IDS: Record<PlanCode, string[]> = {
  // FREE: the limits a visitor tries first (sites, pages), the blog, then the trust basics.
  free: ['sites', 'pages', 'blog', 'glovalAddress', 'ssl', 'seo'],
  // STARTER: the reasons to leave FREE (own domain, blog, backups, a mailbox).
  starter: ['sites', 'pages', 'customDomain', 'blog', 'autoBackup', 'mailboxes'],
  // PRO: what it adds over STARTER: more sites, catalog, daily backups, restore,
  // advanced AI, priority support. Pages and the mailbox count sit behind the toggle.
  pro: ['sites', 'catalogOrder', 'autoBackup', 'versionHistory', 'advancedAi', 'support'],
  // E-COMMERCE: the store itself first (products, store pages, orders, payments);
  // the 5 mailboxes close the list.
  ecommerce: ['sites', 'products', 'storePages', 'cartOrders', 'paymentMethods', 'mailboxes'],
}

/** Two rows are "the same" when a reader would see no difference on the card. */
function itemSignature(item: PlanCopyItem): string {
  return [item.label, item.value ?? '', item.excluded ? 1 : 0, item.badge ?? ''].join('|')
}

/** What a plan has once everything below it is counted (id -> signature). */
function inheritedSignatures(
  code: PlanCode,
  langInput: string | null | undefined,
  options: PlanCopyOptions,
): Map<string, string> {
  const chain: PlanCode[] = []
  for (let c: PlanCode | null = code; c; c = PARENT_PLAN[c]) chain.unshift(c)
  const signatures = new Map<string, string>()
  for (const c of chain) {
    for (const group of buildRawPlanView(c, langInput, options).groups) {
      for (const item of group.items) signatures.set(item.id, itemSignature(item))
    }
  }
  return signatures
}

/**
 * Builds the card content for one plan. Cards that "extend" a lower plan drop
 * every row the lower plan already has in identical form; a row that changed
 * (3 -> 4 sites, 50 -> 150 products, weekly -> daily backups) stays.
 */
export function buildPlanView(
  code: PlanCode,
  // Kept so every caller passes the billing cycle; no row depends on it now
  // that the .com.tr gift is only shown under the price.
  _cycle: BillingCycle,
  langInput: string | null | undefined,
  options: PlanCopyOptions = {},
): PlanView {
  const raw = buildRawPlanView(code, langInput, options)
  const parent = PARENT_PLAN[code]
  const inherited =
    raw.extendsLabel && parent ? inheritedSignatures(parent, langInput, options) : null
  const pinOrder = PINNED_ITEM_IDS[code]

  const groups = raw.groups
    .map((group) => ({
      ...group,
      items: group.items
        .filter((item) => !inherited || inherited.get(item.id) !== itemSignature(item))
        .map((item) => {
          const pin = pinOrder.indexOf(item.id)
          return pin === -1 ? item : { ...item, pin }
        }),
    }))
    .filter((group) => group.items.length > 0)

  return { ...raw, groups }
}

export type PlanItemSplit = {
  /** The rows shown while the card is collapsed, most valuable first. */
  featured: PlanCopyItem[]
  /** Everything else, in the original order, still grouped under its heading. */
  restGroups: PlanCopyGroup[]
  hiddenCount: number
}

/** Splits a plan's rows into the always-visible top rows and the collapsible rest. */
export function splitPlanItems(
  view: PlanView,
  limit: number = PLAN_VISIBLE_ITEM_COUNT,
): PlanItemSplit {
  const all = view.groups.flatMap((group) => group.items)
  const pinned = all
    .filter((item) => item.pin !== undefined)
    .sort((a, b) => a.pin! - b.pin!)
  const featured = pinned.slice(0, limit)
  if (featured.length < limit) {
    for (const item of all) {
      if (featured.length >= limit) break
      if (!featured.includes(item)) featured.push(item)
    }
  }
  const restGroups = view.groups
    .map((group) => ({ ...group, items: group.items.filter((item) => !featured.includes(item)) }))
    .filter((group) => group.items.length > 0)
  return { featured, restGroups, hiddenCount: all.length - featured.length }
}

/**
 * Comparison table, DERIVED from the card items so it can never list a feature
 * the cards do not (or the other way round). Limit-style rows (sites, pages,
 * products, mailboxes, support) show their value; a plan that does not repeat
 * a row inherits it from the plan below.
 */
export function buildComparison(
  langInput: string | null | undefined,
  options: PlanCopyOptions = {},
): ComparisonGroup[] {
  const lang = copyLang(langInput)
  const s = STRINGS[lang]
  const nf = numberFormatter(lang)

  const rowLabels = new Map<string, string>()
  const rowOrder: Record<GroupKey | 'ai' | 'content', string[]> = {
    site: [],
    content: [],
    store: [],
    email: [],
    support: [],
    ai: [],
  }
  const cells: Record<PlanCode, Map<string, ComparisonValue>> = {
    free: new Map(),
    starter: new Map(),
    pro: new Map(),
    ecommerce: new Map(),
  }

  for (const code of PLAN_ORDER) {
    const parent = PARENT_PLAN[code]
    if (parent) {
      for (const [key, value] of cells[parent]) cells[code].set(key, value)
    }
    for (const group of buildRawPlanView(code, lang, options).groups) {
      for (const item of group.items) {
        const target = item.tableGroup ?? group.key
        const key = `${target}:${item.id}`
        if (!rowLabels.has(key)) {
          rowLabels.set(key, item.rowLabel ?? item.label)
          rowOrder[target].push(key)
        }
        cells[code].set(key, item.soon ? s.comparison.soon : (item.value ?? true))
      }
    }
  }

  const aiCodes = AI_CREDIT_CONFIG
  const aiGroup: ComparisonGroup = {
    category: s.comparison.groups.ai,
    rows: [
      {
        label: s.comparison.ai.credits,
        free: s.comparison.ai.creditsValue('free', nf),
        starter: s.comparison.ai.creditsValue('starter', nf),
        pro: s.comparison.ai.creditsValue('pro', nf),
        ecommerce: s.comparison.ai.creditsValue('ecommerce', nf),
      },
      {
        label: s.comparison.ai.rollover,
        free: false,
        starter: false,
        pro: aiCodes.pro.rollover,
        ecommerce: aiCodes.ecommerce.rollover,
      },
      {
        label: s.comparison.ai.maxBalance,
        free: false,
        starter: false,
        pro: nf.format(aiCodes.pro.maxBalance),
        ecommerce: nf.format(aiCodes.ecommerce.maxBalance),
      },
      ...rowOrder.ai.map((rowKey) => ({
        label: rowLabels.get(rowKey) ?? rowKey,
        free: cells.free.get(rowKey) ?? false,
        starter: cells.starter.get(rowKey) ?? false,
        pro: cells.pro.get(rowKey) ?? false,
        ecommerce: cells.ecommerce.get(rowKey) ?? false,
      })),
    ],
  }

  const featureGroups = GROUP_ORDER.filter((key) => rowOrder[key].length > 0).map(
    (key): ComparisonGroup => ({
      category: s.comparison.groups[key],
      rows: rowOrder[key].map((rowKey) => ({
        label: rowLabels.get(rowKey) ?? rowKey,
        free: cells.free.get(rowKey) ?? false,
        starter: cells.starter.get(rowKey) ?? false,
        pro: cells.pro.get(rowKey) ?? false,
        ecommerce: cells.ecommerce.get(rowKey) ?? false,
      })),
    }),
  )

  return [aiGroup, ...featureGroups]
}

/** Localised "saving with yearly billing" line (null when nothing is saved). */
export function yearlySavingText(plan: Plan, lang: string | null | undefined): string | null {
  if (plan.monthlyPrice === 0) return null
  const saving = plan.monthlyPrice * 12 - plan.yearlyPrice
  if (saving <= 0) return null
  return getCommonPlanCopy(lang).saving(formatTL(saving))
}
