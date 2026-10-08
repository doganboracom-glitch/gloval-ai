import {
  AI_CREDIT_CONFIG,
  ECOMMERCE_SITE_LIMITS,
  PAGE_LIMITS,
  PRODUCT_LIMITS,
  SITE_LIMITS,
  formatTL,
  proMonthlyCredits,
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
 */

export type CopyLang = 'tr' | 'en'

export function copyLang(lang: string | null | undefined): CopyLang {
  return lang === 'tr' ? 'tr' : 'en'
}

export type PlanCopyItem = {
  label: string
  note?: string
  highlight?: boolean
  /** Shown only for yearly billing. */
  yearlyOnly?: boolean
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
  groups: PlanCopyGroup[]
  footnote?: string
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
    growth: string
    store: string
    email: string
    support: string
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
  ecommerceFootnote: string
  credits: {
    freeSummary: (n: string) => string
    freeNote: string
    starterSummary: (n: string) => string
    starterNote: string
    proFirst: (n: string) => string
    proMonthly: (n: number) => string
    proRollover: string
    proMax: (n: string) => string
    ecomFirst: (n: string) => string
    ecomMonthly: (n: string) => string
    ecomNote: string
  }
  f: {
    sites: (n: number) => string
    ecomSitesNote: (corporate: number, store: number) => string
    glovalAddress: string
    pagesUpTo: (n: number) => string
    ssl: string
    sslNote: string
    mobile: string
    mobileStore: string
    basicSeo: string
    seo: string
    advancedSeo: string
    seoNote: string
    contactForm: string
    contactForms: string
    socialLinks: string
    social: string
    customDomain: string
    domainGift: string
    domainGiftNote: string
    analytics: string
    analyticsNote: string
    searchConsole: string
    phoneWhatsapp: string
    whatsapp: string
    backup: string
    aiSeo: string
    aiAudit: string
    competitor: string
    visitorAnalytics: string
    versionHistory: string
    googleAds: string
    growth: string
    products: (n: number) => string
    productMgmt: string
    cart: string
    orders: string
    payments: string
    productSeo: string
    googleSeo: string
    mailboxes: (n: number) => string
    mailNote: string
    mailExcluded: string
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
    growth: 'Büyüme ve raporlar',
    store: 'Mağaza',
    email: 'E-posta',
    support: 'Destek',
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
  ecommerceFootnote:
    'Kargo entegrasyonu, pazaryeri entegrasyonları ve banka ödeme sistemleri temel pakete dahil değildir. Bu hizmetleri daha sonra ek ücretli olarak satın alabilirsin.',
  credits: {
    freeSummary: (n) => `${n} yapay zeka işlemi`,
    freeNote: 'Bir defalık. Aylık yenilenmez.',
    starterSummary: (n) => `${n} yapay zeka işlemi / 30 gün`,
    starterNote: 'Kullanılmayan işlemler devretmez.',
    proFirst: (n) => `İlk ay ${n} yapay zeka işlemi`,
    proMonthly: (n) => `Her ay +${n} yapay zeka işlemi.`,
    proRollover: 'Kullanılmayan işlemler devreder.',
    proMax: (n) => `En fazla ${n} işlem bakiyesi.`,
    ecomFirst: (n) => `İlk ay ${n} yapay zeka işlemi`,
    ecomMonthly: (n) => `Sonraki her ay ${n} yapay zeka işlemi.`,
    ecomNote: 'E-ticaret içeriklerinde kullanılır.',
  },
  f: {
    sites: (n) => `${n} site`,
    ecomSitesNote: (c, s) => `${c} kurumsal site + ${s} e-ticaret sitesi`,
    glovalAddress: 'xxx.gloval.site adresi',
    pagesUpTo: (n) => `${n} sayfaya kadar`,
    ssl: 'Güvenli bağlantı (SSL)',
    sslNote: 'Adres çubuğunda kilit simgesi görünür.',
    mobile: 'Mobil uyumlu',
    mobileStore: 'Mobil uyumlu mağaza',
    basicSeo: 'Temel SEO',
    seo: 'SEO',
    advancedSeo: 'Gelişmiş SEO',
    seoNote: 'Arama motorlarında bulunmanıza yardımcı olur.',
    contactForm: 'İletişim formu',
    contactForms: 'İletişim formları',
    socialLinks: 'Sosyal medya bağlantıları',
    social: 'Sosyal medya',
    customDomain: 'Kendi alan adınız',
    domainGift: '.com.tr alan adı hediye',
    domainGiftNote: 'Yıllık pakette geçerli.',
    analytics: 'Google Analytics',
    analyticsNote: 'Ziyaretçi istatistikleri.',
    searchConsole: 'Google Search Console',
    phoneWhatsapp: 'Telefon ve WhatsApp',
    whatsapp: 'WhatsApp',
    backup: 'Otomatik yedekleme',
    aiSeo: 'Yapay zeka SEO',
    aiAudit: 'Yapay zeka site analizi',
    competitor: 'Rakip analizi',
    visitorAnalytics: 'Gelişmiş ziyaretçi analizi',
    versionHistory: 'Sürüm geçmişi',
    googleAds: 'Google Ads özellikleri',
    growth: 'Growth özellikleri',
    products: (n) => `${n} ürün`,
    productMgmt: 'Ürün yönetimi',
    cart: 'Sepet',
    orders: 'Sipariş yönetimi',
    payments: 'Ödeme altyapısı (PayTR / iyzico)',
    productSeo: 'Ürün SEO',
    googleSeo: 'Google SEO',
    mailboxes: (n) => `${n} kurumsal e-posta`,
    mailNote: 'info@firmaadi.com gibi kendi alan adınızla e-posta adresleri.',
    mailExcluded: 'Kurumsal e-posta dahil değil',
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
    growth: 'Growth and reports',
    store: 'Store',
    email: 'Email',
    support: 'Support',
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
      description:
        'For businesses that actively use SEO, AI and growth tools.',
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
  ecommerceFootnote:
    'Shipping integrations, marketplace integrations and bank payment systems are not part of the base plan. You can buy these services later as paid extras.',
  credits: {
    freeSummary: (n) => `${n} AI actions`,
    freeNote: 'One-time. Does not renew monthly.',
    starterSummary: (n) => `${n} AI actions / 30 days`,
    starterNote: 'Unused actions do not carry over.',
    proFirst: (n) => `${n} AI actions in the first month`,
    proMonthly: (n) => `+${n} AI actions every month.`,
    proRollover: 'Unused actions carry over.',
    proMax: (n) => `Balance capped at ${n} actions.`,
    ecomFirst: (n) => `${n} AI actions in the first month`,
    ecomMonthly: (n) => `${n} AI actions every following month.`,
    ecomNote: 'Used for store content.',
  },
  f: {
    sites: (n) => `${n} ${n === 1 ? 'site' : 'sites'}`,
    ecomSitesNote: (c, s) =>
      `${c} business sites + ${s} online ${s === 1 ? 'store' : 'stores'}`,
    glovalAddress: 'xxx.gloval.site address',
    pagesUpTo: (n) => `Up to ${n} pages`,
    ssl: 'Secure connection (SSL)',
    sslNote: 'A padlock shows in the address bar.',
    mobile: 'Mobile friendly',
    mobileStore: 'Mobile-friendly store',
    basicSeo: 'Basic SEO',
    seo: 'SEO',
    advancedSeo: 'Advanced SEO',
    seoNote: 'Helps people find you in search engines.',
    contactForm: 'Contact form',
    contactForms: 'Contact forms',
    socialLinks: 'Social media links',
    social: 'Social media',
    customDomain: 'Your own domain name',
    domainGift: 'Free .com.tr domain',
    domainGiftNote: 'Included with yearly billing.',
    analytics: 'Google Analytics',
    analyticsNote: 'Visitor statistics.',
    searchConsole: 'Google Search Console',
    phoneWhatsapp: 'Phone and WhatsApp',
    whatsapp: 'WhatsApp',
    backup: 'Automatic backups',
    aiSeo: 'AI SEO',
    aiAudit: 'AI site analysis',
    competitor: 'Competitor analysis',
    visitorAnalytics: 'Advanced visitor analytics',
    versionHistory: 'Version history',
    googleAds: 'Google Ads features',
    growth: 'Growth features',
    products: (n) => `${n} products`,
    productMgmt: 'Product management',
    cart: 'Cart',
    orders: 'Order management',
    payments: 'Payment system (PayTR / iyzico)',
    productSeo: 'Product SEO',
    googleSeo: 'Google SEO',
    mailboxes: (n) => `${n} business ${n === 1 ? 'email' : 'emails'}`,
    mailNote: 'Email addresses on your own domain, like info@yourcompany.com.',
    mailExcluded: 'Business email not included',
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

function mailItems(s: Strings, code: PlanCode): PlanCopyItem[] {
  const count = PLAN_INCLUDED_MAILBOXES[code]
  if (count <= 0) return [{ label: s.f.mailExcluded, excluded: true }]
  return [{ label: s.f.mailboxes(count), note: s.f.mailNote, highlight: true }]
}

const domainGiftItem = (s: Strings): PlanCopyItem => ({
  label: s.f.domainGift,
  note: s.f.domainGiftNote,
  highlight: true,
  yearlyOnly: true,
})

/**
 * Builds the card content for one plan. TR and EN share this single structure,
 * so both languages always list the same groups and items in the same order.
 */
export function buildPlanView(
  code: PlanCode,
  cycle: BillingCycle,
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
        { title: g.email, items: mailItems(s, code) },
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
            domainGiftItem(s),
            { label: f.ssl, note: f.sslNote },
            { label: f.mobile },
            { label: f.seo, note: f.seoNote },
            { label: f.analytics, note: f.analyticsNote },
            { label: f.searchConsole },
            { label: f.phoneWhatsapp },
            { label: f.social },
            { label: f.contactForms },
            { label: f.backup },
          ],
        },
        { title: g.email, items: mailItems(s, code) },
        { title: g.support, items: [{ label: f.standardSupport }] },
      ],
    }
  }

  if (code === 'pro') {
    return {
      ...head,
      creditSummary: s.credits.proFirst(nf.format(AI_CREDIT_CONFIG.pro.initialCredits)),
      creditNotes: [
        s.credits.proMonthly(proMonthlyCredits(cycle)),
        s.credits.proRollover,
        s.credits.proMax(nf.format(AI_CREDIT_CONFIG.pro.maxBalance)),
      ],
      groups: [
        {
          title: g.site,
          items: [
            { label: f.sites(SITE_LIMITS.pro) },
            { label: f.pagesUpTo(PAGE_LIMITS.pro) },
            { label: f.customDomain },
            domainGiftItem(s),
            { label: f.ssl, note: f.sslNote },
            { label: f.mobile },
            { label: f.phoneWhatsapp },
            { label: f.backup },
            { label: f.versionHistory },
          ],
        },
        {
          title: g.growth,
          items: [
            { label: f.advancedSeo, note: f.seoNote },
            { label: f.aiSeo },
            { label: f.aiAudit },
            { label: f.competitor },
            { label: f.analytics, note: f.analyticsNote },
            { label: f.searchConsole },
            { label: f.visitorAnalytics },
            { label: f.googleAds },
            { label: f.growth },
          ],
        },
        { title: g.email, items: mailItems(s, code) },
        { title: g.support, items: [{ label: f.prioritySupport }] },
      ],
    }
  }

  const corporateSites = SITE_LIMITS.ecommerce - ECOMMERCE_SITE_LIMITS.ecommerce
  return {
    ...head,
    creditSummary: s.credits.ecomFirst(nf.format(AI_CREDIT_CONFIG.ecommerce.initialCredits)),
    creditNotes: [
      s.credits.ecomMonthly(nf.format(AI_CREDIT_CONFIG.ecommerce.monthlyCredits)),
      s.credits.ecomNote,
    ],
    footnote: s.ecommerceFootnote,
    groups: [
      {
        title: g.site,
        items: [
          {
            label: f.sites(SITE_LIMITS.ecommerce),
            note: f.ecomSitesNote(corporateSites, ECOMMERCE_SITE_LIMITS.ecommerce),
            highlight: true,
          },
          domainGiftItem(s),
          { label: f.ssl, note: f.sslNote },
          { label: f.googleSeo, note: f.seoNote },
          { label: f.social },
          { label: f.whatsapp },
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
          { label: f.productSeo },
          { label: f.mobileStore },
        ],
      },
      { title: g.email, items: mailItems(s, code) },
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
