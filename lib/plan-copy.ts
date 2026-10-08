import {
  AI_CREDIT_CONFIG,
  ECOMMERCE_SITE_LIMITS,
  PAGE_LIMITS,
  PRODUCT_LIMITS,
  SITE_LIMITS,
  formatTL,
  type BillingCycle,
  type Plan,
  type PlanCode,
} from '@/lib/pricing-config'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'

/**
 * User-facing plan copy (TR + EN only; every other language falls back to EN).
 *
 * This file only decides how plans are DESCRIBED. Prices, limits, credits and
 * mailbox counts are read from `pricing-config.ts` and `access-state.ts`, so
 * the wording can change without touching behaviour. The shared 11-language
 * dictionary is intentionally not used here.
 *
 * Cards are INCREMENTAL: STARTER lists everything it has, PRO lists only what
 * it adds on top of STARTER, and E-COMMERCE only what it adds on top of PRO.
 */

export type CopyLang = 'tr' | 'en'

export function copyLang(lang: string | null | undefined): CopyLang {
  return lang === 'tr' ? 'tr' : 'en'
}

export type PlanCopyItem = {
  label: string
  note?: string
  highlight?: boolean
  /** Rendered as "not included" (muted, minus icon). */
  excluded?: boolean
}

export type PlanCopyGroup = {
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
  maxBalanceLabel: string
  maxBalanceAria: string
  saving: (amountTL: string) => string
}

type Strings = {
  common: CommonPlanCopy
  groups: {
    site: string
    store: string
    email: string
    support: string
  }
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
    max: (n: string) => string
  }
  f: {
    sites: (n: number) => string
    sitesRight: (n: number) => string
    ecomSites: (corporate: number, store: number) => string
    glovalAddress: string
    pagesUpTo: (n: number) => string
    ssl: string
    sslNote: string
    mobile: string
    basicSeo: string
    seo: string
    seoNote: string
    contactForm: string
    contactForms: string
    socialLinks: string
    customDomain: string
    analytics: string
    analyticsNote: string
    searchConsole: string
    phoneWhatsapp: string
    backup: string
    versionHistory: string
    products: (n: number) => string
    productMgmt: string
    cart: string
    orders: string
    payments: string
    paymentProviders: string
    productSeo: string
    productSeoNote: string
    storePages: string
    storePagesNote: string
    mailboxes: (n: number) => string
    mailNote: string
    standardSupport: string
    prioritySupport: string
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
    maxBalanceLabel: 'Maksimum bakiye',
    maxBalanceAria: 'Maksimum yapay zeka işlemi bakiyesi',
    saving: (amount) => `Yıllık ödemede ${amount} avantaj`,
  },
  groups: {
    site: 'Sitenizde neler var',
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
      description:
        'SEO, yapay zeka ve büyüme araçlarını aktif olarak kullanmak isteyen işletmeler için.',
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
    max: (n) => `En fazla ${n} işlem bakiyesi.`,
  },
  f: {
    sites: (n) => `${n} site`,
    sitesRight: (n) => `${n} site hakkı`,
    ecomSites: (c, s) => `${c} kurumsal site + ${s} e-ticaret sitesi`,
    glovalAddress: 'xxx.gloval.site adresi',
    pagesUpTo: (n) => `${n} sayfaya kadar`,
    ssl: 'SSL',
    sslNote: 'Adres çubuğunda kilit simgesi: güvenli bağlantı.',
    mobile: 'Mobil uyumluluk',
    basicSeo: 'Temel SEO',
    seo: 'SEO uyumlu',
    seoNote: 'Arama motorlarında bulunmanıza yardımcı olur.',
    contactForm: 'İletişim formu',
    contactForms: 'İletişim formları',
    socialLinks: 'Sosyal medya bağlantıları',
    customDomain: 'Kendi alan adını bağla',
    analytics: 'Google Analytics',
    analyticsNote: 'Ziyaretçi istatistikleri.',
    searchConsole: 'Google Search Console',
    phoneWhatsapp: 'Telefon ve WhatsApp',
    backup: 'Otomatik yedekleme',
    versionHistory: 'Sürüm geçmişi',
    products: (n) => `${n} ürün`,
    productMgmt: 'Ürün yönetimi',
    cart: 'Sepet',
    orders: 'Sipariş yönetimi',
    payments: 'Ödeme altyapısı',
    paymentProviders: 'PayTR / iyzico entegrasyonu',
    productSeo: 'Ürün SEO',
    productSeoNote: 'Ürünlerinizin arama motorlarında bulunmasına yardımcı olur.',
    storePages: 'Hazır mağaza sayfaları',
    storePagesNote:
      'Ürün listesi, ürün detayı, sepet ve sipariş sayfaları sitenizin içinde hazır gelir.',
    mailboxes: (n) => `${n} kurumsal e-posta`,
    mailNote: 'info@firmaadi.com gibi kendi alan adınızla e-posta adresleri.',
    standardSupport: 'Standart destek',
    prioritySupport: 'Öncelikli destek',
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
    maxBalanceLabel: 'Maximum balance',
    maxBalanceAria: 'Maximum AI action balance',
    saving: (amount) => `Save ${amount} with yearly billing`,
  },
  groups: {
    site: 'What’s on your site',
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
      description: 'For businesses that actively use SEO, AI and growth tools.',
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
    max: (n) => `Balance capped at ${n} actions.`,
  },
  f: {
    sites: (n) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    sitesRight: (n) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    ecomSites: (c, s) =>
      `${c} business sites + ${s} online ${s === 1 ? 'store' : 'stores'}`,
    glovalAddress: 'xxx.gloval.site address',
    pagesUpTo: (n) => `Up to ${n} pages`,
    ssl: 'SSL',
    sslNote: 'A padlock in the address bar: a secure connection.',
    mobile: 'Mobile friendly',
    basicSeo: 'Basic SEO',
    seo: 'SEO friendly',
    seoNote: 'Helps people find you in search engines.',
    contactForm: 'Contact form',
    contactForms: 'Contact forms',
    socialLinks: 'Social media links',
    customDomain: 'Connect your own domain',
    analytics: 'Google Analytics',
    analyticsNote: 'Visitor statistics.',
    searchConsole: 'Google Search Console',
    phoneWhatsapp: 'Phone and WhatsApp',
    backup: 'Automatic backups',
    versionHistory: 'Version history',
    products: (n) => `${n} products`,
    productMgmt: 'Product management',
    cart: 'Cart',
    orders: 'Order management',
    payments: 'Payment system',
    paymentProviders: 'PayTR / iyzico integration',
    productSeo: 'Product SEO',
    productSeoNote: 'Helps people find your products in search engines.',
    storePages: 'Ready-made store pages',
    storePagesNote:
      'Product list, product detail, cart and order pages come ready inside your site.',
    mailboxes: (n) => `${n} business ${n === 1 ? 'email' : 'emails'}`,
    mailNote: 'Email addresses on your own domain, like info@yourcompany.com.',
    standardSupport: 'Standard support',
    prioritySupport: 'Priority support',
  },
}

const STRINGS: Record<CopyLang, Strings> = { tr: TR, en: EN }

export function getCommonPlanCopy(lang: string | null | undefined): CommonPlanCopy {
  return STRINGS[copyLang(lang)].common
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
      title: s.groups.email,
      items: [{ label: s.f.mailboxes(count), note: s.f.mailNote, highlight: true }],
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
): PlanView {
  const lang = copyLang(langInput)
  const s = STRINGS[lang]
  const nf = numberFormatter(lang)
  const base = s.plans[code]
  const { f, groups: g } = s

  const head = {
    code,
    name: base.name,
    headline: base.headline,
    description: base.description,
    cta: base.cta,
    badge: base.badge,
  }

  if (code === 'free') {
    return {
      ...head,
      creditSummary: s.credits.freeSummary(nf.format(AI_CREDIT_CONFIG.free.credits)),
      creditNotes: [s.credits.freeNote],
      groups: [
        {
          title: g.site,
          items: [
            { label: f.sites(SITE_LIMITS.free) },
            { label: f.glovalAddress },
            { label: f.pagesUpTo(PAGE_LIMITS.free) },
            { label: f.ssl, note: f.sslNote },
            { label: f.mobile },
            { label: f.basicSeo, note: f.seoNote },
            { label: f.contactForm },
            { label: f.socialLinks },
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
          title: g.site,
          items: [
            { label: f.sites(SITE_LIMITS.starter) },
            { label: f.pagesUpTo(PAGE_LIMITS.starter) },
            { label: f.customDomain },
            { label: f.ssl, note: f.sslNote },
            { label: f.mobile },
            { label: f.seo, note: f.seoNote },
            { label: f.analytics, note: f.analyticsNote },
            { label: f.searchConsole },
            { label: f.phoneWhatsapp },
            { label: f.socialLinks },
            { label: f.contactForms },
            { label: f.backup },
          ],
        },
        ...mailGroup(s, code),
        { title: g.support, items: [{ label: f.standardSupport }] },
      ],
    }
  }

  if (code === 'pro') {
    return {
      ...head,
      extendsLabel: s.extendsLabel.starter,
      creditSummary: s.credits.firstPeriod(nf.format(AI_CREDIT_CONFIG.pro.initialCredits)),
      creditNotes: [
        s.credits.following(nf.format(AI_CREDIT_CONFIG.pro.monthlyCredits)),
        s.credits.rollover,
        s.credits.max(nf.format(AI_CREDIT_CONFIG.pro.maxBalance)),
      ],
      groups: [
        {
          title: g.site,
          items: [
            { label: f.sitesRight(SITE_LIMITS.pro), highlight: true },
            { label: f.pagesUpTo(PAGE_LIMITS.pro) },
            { label: f.backup },
            { label: f.versionHistory },
          ],
        },
        ...mailGroup(s, code),
        { title: g.support, items: [{ label: f.prioritySupport }] },
      ],
    }
  }

  const corporateSites = SITE_LIMITS.ecommerce - ECOMMERCE_SITE_LIMITS.ecommerce
  // Pages are inherited from PRO; only mention them if the limits ever diverge.
  const pageItems: PlanCopyItem[] =
    PAGE_LIMITS.ecommerce === PAGE_LIMITS.pro
      ? []
      : [{ label: f.pagesUpTo(PAGE_LIMITS.ecommerce) }]

  return {
    ...head,
    extendsLabel: s.extendsLabel.pro,
    creditSummary: s.credits.firstPeriod(nf.format(AI_CREDIT_CONFIG.ecommerce.initialCredits)),
    creditNotes: [s.credits.following(nf.format(AI_CREDIT_CONFIG.ecommerce.monthlyCredits))],
    groups: [
      {
        title: g.site,
        items: [
          {
            label: f.ecomSites(corporateSites, ECOMMERCE_SITE_LIMITS.ecommerce),
            highlight: true,
          },
          ...pageItems,
        ],
      },
      {
        title: g.store,
        items: [
          { label: f.products(PRODUCT_LIMITS.ecommerce ?? 0), highlight: true },
          { label: f.productMgmt },
          { label: f.cart },
          { label: f.orders },
          { label: f.payments },
          { label: f.paymentProviders },
          { label: f.productSeo, note: f.productSeoNote },
          { label: f.storePages, note: f.storePagesNote },
        ],
      },
      ...mailGroup(s, code),
    ],
  }
}

/** Localised "saving with yearly billing" line (null when nothing is saved). */
export function yearlySavingText(plan: Plan, lang: string | null | undefined): string | null {
  if (plan.monthlyPrice === 0) return null
  const saving = plan.monthlyPrice * 12 - plan.yearlyPrice
  if (saving <= 0) return null
  return getCommonPlanCopy(lang).saving(formatTL(saving))
}
