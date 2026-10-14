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
  tableGroup?: 'ai'
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
  /** Tooltip of the "i" icon in the credit box (rollover + balance cap). */
  maxBalanceTip: (maxBalance: string) => string
  saving: (amountTL: string) => string
}

export type ComparisonCopy = {
  toggle: string
  featureColumn: string
  yes: string
  no: string
}

type Strings = {
  common: CommonPlanCopy
  comparison: ComparisonCopy & {
    soon: string
    groups: Record<GroupKey | 'ai', string>
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
    versionHistory: string
    versionHistoryNote: string
    customDomain: string
    trackingCodes: string
    trackingCodesNote: string
    phoneWhatsapp: string
    socialLinks: string
    socialLinksNote: string
    logoStudio: string
    logoStudioNote: string
    products: (n: number) => string
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
    maxBalanceTip: (n) =>
      `Kullanılmayan işlemler devreder; en fazla ${n} işlem bakiyesi birikebilir`,
    saving: (amount) => `Yıllık ödemede ${amount} avantaj`,
  },
  comparison: {
    toggle: 'Paket özelliklerini karşılaştır',
    featureColumn: 'Özellik',
    yes: 'Var',
    no: 'Yok',
    soon: 'Yakında',
    groups: {
      ai: 'Yapay zeka işlemleri',
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
    versionHistory: 'Sürüm geçmişi',
    versionHistoryNote: 'Kaydettiğin önceki sürümlere geri dön.',
    customDomain: 'Kendi alan adını bağla',
    trackingCodes: 'Analytics ve Search Console kodu ekleme',
    trackingCodesNote: 'Takip ve doğrulama kodlarını sitene yapıştır.',
    phoneWhatsapp: 'Telefon ve WhatsApp butonları',
    socialLinks: 'Sosyal medya bağlantıları',
    socialLinksNote: 'Instagram, Facebook, LinkedIn ve diğer hesapların sitende görünür.',
    logoStudio: 'AI logo stüdyosu ve marka kiti',
    logoStudioNote: 'Logo önerileri, marka kiti ve favicon.',
    products: (n) => `${n} ürün`,
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
      'Site oluşturma, düzenleme ve ürün metni daha gelişmiş modelle çalışır. Kredi fiyatları değişmez.',
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
    maxBalanceTip: (n) =>
      `Unused actions carry over; up to ${n} actions can accumulate`,
    saving: (amount) => `Save ${amount} with yearly billing`,
  },
  comparison: {
    toggle: 'Compare plan features',
    featureColumn: 'Feature',
    yes: 'Included',
    no: 'Not included',
    soon: 'Soon',
    groups: {
      ai: 'AI actions',
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
    versionHistory: 'Version history',
    versionHistoryNote: 'Go back to earlier versions you saved.',
    customDomain: 'Connect your own domain',
    trackingCodes: 'Add Analytics and Search Console code',
    trackingCodesNote: 'Paste your tracking and verification code into your site.',
    phoneWhatsapp: 'Phone and WhatsApp buttons',
    socialLinks: 'Social media links',
    socialLinksNote: 'Show your Instagram, Facebook, LinkedIn and other accounts on your site.',
    logoStudio: 'AI logo studio and brand kit',
    logoStudioNote: 'Logo suggestions, brand kit and favicon.',
    products: (n) => `${n} products`,
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
      'Site creation, editing and product text run on a more advanced model. Credit prices stay the same.',
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
  const { toggle, featureColumn, yes, no } = STRINGS[copyLang(lang)].comparison
  return { toggle, featureColumn, yes, no }
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
 * Builds the card content for one plan. TR and EN share this single structure,
 * so both languages always list the same groups and items in the same order.
 */
export function buildPlanView(
  code: PlanCode,
  // Kept so every caller passes the billing cycle; no row depends on it now
  // that the .com.tr gift is only shown under the price.
  _cycle: BillingCycle,
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
            { id: 'versionHistory', label: f.versionHistory, note: f.versionHistoryNote },
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
            { id: 'versionHistory', label: f.versionHistory, note: f.versionHistoryNote },
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
            ...advancedAiItems,
            glovalAdsItem(),
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

const GROUP_ORDER: GroupKey[] = ['site', 'store', 'email', 'support']

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
  const rowOrder: Record<GroupKey | 'ai', string[]> = {
    site: [],
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
    for (const group of buildPlanView(code, 'yearly', lang, options).groups) {
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
