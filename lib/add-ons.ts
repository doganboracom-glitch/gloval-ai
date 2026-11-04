import {
  PRODUCT_LIMITS,
  SITE_LIMITS,
  ECOMMERCE_SITE_LIMITS,
  toPlanCode,
  type PlanCode,
} from '@/lib/pricing-config'
import { PLAN_INCLUDED_MAILBOXES } from '@/lib/mail/access-state'

/**
 * "Ek Hizmetler" katalogu ve kapasite çözümleyicileri.
 *
 * Bu dosya saf (I/O içermeyen) mantıktır; hem sunucu hem test tarafından
 * kullanılır. Kapasite her zaman bu katalogdan, `addon_code` üzerinden hesaplanır;
 * istemciden veya veritabanındaki serbest bir sayıdan ASLA okunmaz.
 */

export type AddOnKind = 'site' | 'product' | 'mail'
export type SiteAddOnTarget = 'corporate' | 'ecommerce'
export type AddOnBillingPeriod = 'month' | 'year'

export type AddOnCode =
  | 'extra_site_1'
  | 'extra_site_3'
  | 'extra_site_5'
  | 'extra_corporate_site_1'
  | 'extra_corporate_site_1_yearly'
  | 'extra_ecommerce_site_1'
  | 'extra_ecommerce_site_1_yearly'
  | 'extra_product_50'
  | 'extra_product_50_yearly'
  | 'extra_ecommerce_product_100'
  | 'extra_ecommerce_product_100_yearly'
  | 'extra_product_100'
  | 'extra_product_200'
  | 'extra_product_500'
  | 'extra_mail_1'
  | 'extra_mail_1_yearly'
  | 'extra_mail_5'
  | 'extra_mail_5_yearly'
  | 'extra_mail_10'
  | 'extra_mail_25'
  | 'extra_mail_50'

/** A yearly add-on costs this many monthly payments (12 months for the price of 10). */
export const ADD_ON_YEARLY_PRICE_FACTOR = 10
/** A yearly add-on is valid this many calendar months from the purchase. */
export const ADD_ON_YEARLY_VALIDITY_MONTHS = 12

export type AddOnDefinition = {
  code: AddOnCode
  kind: AddOnKind
  /** Plan limitinin üzerine eklenen kapasite. */
  capacity: number
  /** Liste fiyatı (kuruş, KDV dahil). `billing_plans.price_cents` ile aynı tutulur; DB satırı önceliklidir. */
  listPriceCents: number
  /** Omitted = monthly. A yearly SKU is a one-time charge valid for 12 months. */
  period?: AddOnBillingPeriod
  /** Yearly SKUs only: the monthly SKU this one is priced from. */
  monthlyCode?: AddOnCode
  /** New typed website offers only; legacy `extra_site_*` grants remain corporate capacity. */
  siteTarget?: SiteAddOnTarget
  /** False removes a legacy SKU from sale while preserving its existing grants and settlement mapping. */
  saleEnabled?: boolean
  currency: 'TRY'
  /**
   * Geçerlilik modeli: add-on tek seferlik değildir ve sabit gün sayısına bağlı
   * değildir; satın alındığı ana aboneliğin faturalama dönemiyle birlikte
   * geçerlidir (bkz. `isGrantActive`). Yıllık SKU'lar `twelve_months`: satın alma
   * anından 12 ay geçerli, otomatik yenilenmez.
   */
  validity: 'subscription_period' | 'twelve_months'
}

export const ADD_ONS: Record<AddOnCode, AddOnDefinition> = {
  extra_site_1: { code: 'extra_site_1', kind: 'site', capacity: 1, listPriceCents: 9900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_site_3: { code: 'extra_site_3', kind: 'site', capacity: 3, listPriceCents: 19900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_site_5: { code: 'extra_site_5', kind: 'site', capacity: 5, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  // Sold SKUs, in on-screen order. Yearly prices are 10x the monthly price (see ADD_ON_YEARLY_PRICE_FACTOR).
  extra_corporate_site_1: { code: 'extra_corporate_site_1', kind: 'site', siteTarget: 'corporate', capacity: 1, listPriceCents: 19900, currency: 'TRY', validity: 'subscription_period' },
  extra_corporate_site_1_yearly: { code: 'extra_corporate_site_1_yearly', kind: 'site', siteTarget: 'corporate', capacity: 1, listPriceCents: 199000, period: 'year', monthlyCode: 'extra_corporate_site_1', currency: 'TRY', validity: 'twelve_months' },
  extra_ecommerce_site_1: { code: 'extra_ecommerce_site_1', kind: 'site', siteTarget: 'ecommerce', capacity: 1, listPriceCents: 49900, currency: 'TRY', validity: 'subscription_period' },
  extra_ecommerce_site_1_yearly: { code: 'extra_ecommerce_site_1_yearly', kind: 'site', siteTarget: 'ecommerce', capacity: 1, listPriceCents: 499000, period: 'year', monthlyCode: 'extra_ecommerce_site_1', currency: 'TRY', validity: 'twelve_months' },
  // GLOVAL Mail: `capacity` is the number of mailboxes. This is the only place prices and sizes live.
  extra_mail_1: { code: 'extra_mail_1', kind: 'mail', capacity: 1, listPriceCents: 4900, currency: 'TRY', validity: 'subscription_period' },
  extra_mail_1_yearly: { code: 'extra_mail_1_yearly', kind: 'mail', capacity: 1, listPriceCents: 49000, period: 'year', monthlyCode: 'extra_mail_1', currency: 'TRY', validity: 'twelve_months' },
  extra_mail_5: { code: 'extra_mail_5', kind: 'mail', capacity: 5, listPriceCents: 19900, currency: 'TRY', validity: 'subscription_period' },
  extra_mail_5_yearly: { code: 'extra_mail_5_yearly', kind: 'mail', capacity: 5, listPriceCents: 199000, period: 'year', monthlyCode: 'extra_mail_5', currency: 'TRY', validity: 'twelve_months' },
  extra_product_50: { code: 'extra_product_50', kind: 'product', capacity: 50, listPriceCents: 19900, currency: 'TRY', validity: 'subscription_period' },
  extra_product_50_yearly: { code: 'extra_product_50_yearly', kind: 'product', capacity: 50, listPriceCents: 199000, period: 'year', monthlyCode: 'extra_product_50', currency: 'TRY', validity: 'twelve_months' },
  extra_ecommerce_product_100: { code: 'extra_ecommerce_product_100', kind: 'product', capacity: 100, listPriceCents: 34900, currency: 'TRY', validity: 'subscription_period' },
  extra_ecommerce_product_100_yearly: { code: 'extra_ecommerce_product_100_yearly', kind: 'product', capacity: 100, listPriceCents: 349000, period: 'year', monthlyCode: 'extra_ecommerce_product_100', currency: 'TRY', validity: 'twelve_months' },
  // Legacy product SKUs: off sale, but existing grants keep counting.
  extra_product_100: { code: 'extra_product_100', kind: 'product', capacity: 100, listPriceCents: 9900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_product_200: { code: 'extra_product_200', kind: 'product', capacity: 200, listPriceCents: 14900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_product_500: { code: 'extra_product_500', kind: 'product', capacity: 500, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_mail_10: { code: 'extra_mail_10', kind: 'mail', capacity: 10, listPriceCents: 14900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_mail_25: { code: 'extra_mail_25', kind: 'mail', capacity: 25, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
  extra_mail_50: { code: 'extra_mail_50', kind: 'mail', capacity: 50, listPriceCents: 49900, currency: 'TRY', validity: 'subscription_period', saleEnabled: false },
}

/** Every GLOVAL Mail add-on code (monthly and yearly), in catalog order. */
export const MAIL_ADD_ON_CODES: readonly AddOnCode[] = Object.values(ADD_ONS)
  .filter((def) => def.kind === 'mail')
  .map((def) => def.code)

/** Every yearly (12-month, one-time) add-on code. */
export const YEARLY_ADD_ON_CODES: readonly AddOnCode[] = Object.values(ADD_ONS)
  .filter((def) => def.period === 'year')
  .map((def) => def.code)

export function addOnBillingPeriod(code: string): AddOnBillingPeriod {
  return Object.prototype.hasOwnProperty.call(ADD_ONS, code) && ADD_ONS[code as AddOnCode].period === 'year'
    ? 'year'
    : 'month'
}

/** Adds calendar months in UTC, clamping to the last day of a shorter month (31 Jan + 1 = 28/29 Feb). */
export function addMonthsUtc(from: Date, months: number): Date {
  const target = new Date(from.getTime())
  const day = target.getUTCDate()
  target.setUTCDate(1)
  target.setUTCMonth(target.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return target
}

/**
 * The `expires_at` a new grant receives. Monthly add-ons end with the
 * subscription period they were bought in; yearly ones last 12 months from the
 * purchase and are never renewed.
 */
export function resolveAddOnExpiry(code: AddOnCode, subscriptionPeriodEnd: string, purchasedAt: Date): string {
  if (ADD_ONS[code].period === 'year') {
    return addMonthsUtc(purchasedAt, ADD_ON_YEARLY_VALIDITY_MONTHS).toISOString()
  }
  return subscriptionPeriodEnd
}

/** What the sales screen shows, grouped per card and ordered as the menu rows. */
export type AddOnSaleGroupId = 'website' | 'email' | 'product'
export const ADD_ON_SALE_GROUPS: Record<AddOnSaleGroupId, readonly AddOnCode[]> = {
  website: [
    'extra_corporate_site_1',
    'extra_corporate_site_1_yearly',
    'extra_ecommerce_site_1',
    'extra_ecommerce_site_1_yearly',
  ],
  email: ['extra_mail_1', 'extra_mail_1_yearly', 'extra_mail_5', 'extra_mail_5_yearly'],
  product: [
    'extra_product_50',
    'extra_product_50_yearly',
    'extra_ecommerce_product_100',
    'extra_ecommerce_product_100_yearly',
  ],
}

/** `billing_plans` içinden add-on fiyatını çözmek için gereken alanlar. */
export type AddOnPlanRow = {
  code: string
  price_cents: number
  currency: string
  interval?: string | null
  product_category?: string | null
  active?: boolean | null
}

export type AddOnPrice = {
  priceCents: number
  currency: string
  /** `db`: billing_plans satırı; `catalog`: satır yok/pasif, katalog liste fiyatı. */
  source: 'db' | 'catalog'
}

/**
 * Add-on fiyat çözümleyicisi. Fiyat HİÇBİR ZAMAN istemciden gelmez: önce
 * `billing_plans` (aktif, add-on kategorisi, aylık) satırı, yoksa katalog liste
 * fiyatı kullanılır. Bozuk bir satır (negatif/tam sayı olmayan tutar) yok sayılır.
 */
export function resolveAddOnPrices(rows: readonly AddOnPlanRow[]): Record<AddOnCode, AddOnPrice> {
  const byCode = new Map(rows.map((r) => [r.code, r]))
  const out = {} as Record<AddOnCode, AddOnPrice>
  for (const def of Object.values(ADD_ONS)) {
    const row = byCode.get(def.code)
    const usable =
      row &&
      row.active !== false &&
      (row.product_category ?? 'addon') === 'addon' &&
      (row.interval ?? 'month') === (def.period ?? 'month') &&
      Number.isInteger(row.price_cents) &&
      row.price_cents > 0
    out[def.code] = usable
      ? { priceCents: row.price_cents, currency: row.currency.toUpperCase(), source: 'db' }
      : { priceCents: def.listPriceCents, currency: def.currency, source: 'catalog' }
  }
  return out
}

/**
 * Hangi paketler hangi add-on türünü kullanabilir. FREE ve STARTER için ürün
 * add-on'u satın alınamaz/uygulanmaz; paket düşürülürse eski add-on kayıtları
 * silinmez ama uygun olmayan pakette kapasite sağlamaz.
 */
export const ADD_ON_ELIGIBLE_PLANS: Record<AddOnKind, readonly PlanCode[]> = {
  site: ['pro', 'ecommerce'],
  product: ['pro', 'ecommerce'],
  // Mail is open to every package; the buyer still needs an active subscription
  // row, which `purchaseAddOn` enforces before eligibility is even checked.
  mail: ['free', 'starter', 'pro', 'ecommerce'],
}

export function isAddOnCode(value: unknown): value is AddOnCode {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ADD_ONS, value)
}

export function isAddOnEligible(kind: AddOnKind, planCode: PlanCode): boolean {
  return ADD_ON_ELIGIBLE_PLANS[kind].includes(planCode)
}

export function isAddOnEligibleForCode(value: unknown, planCode: PlanCode): value is AddOnCode {
  if (!isAddOnCode(value)) return false
  const def = ADD_ONS[value]
  return isAddOnEligible(def.kind, planCode) && (def.siteTarget !== 'ecommerce' || planCode === 'ecommerce')
}

export function isAddOnPurchasableCode(value: unknown): value is AddOnCode {
  return isAddOnCode(value) && ADD_ONS[value].saleEnabled !== false
}

/** `user_addon_entitlements` satırının kapasite hesabı için gereken alanları. */
export type AddOnGrant = {
  addonCode: string
  status: string
  startsAt: string | null
  /** Hak verildiği andaki dönem sonu anlık görüntüsü; canlı abonelik satırı yoksa yedek. */
  expiresAt: string | null
  /** Add-on'un bağlı olduğu ana abonelik. Yoksa hak kapasite SAĞLAMAZ. */
  subscriptionId: string | null
  subscriptionStatus: string | null
  /** Canlı `billing_subscriptions.current_period_end`; geçerlilik buradan türetilir. */
  subscriptionPeriodEnd: string | null
}

/** Planın kendisinin de geçerli saydığı abonelik durumları (lib/billing.ts ile aynı). */
export const ADD_ON_ENTITLED_SUBSCRIPTION_STATUSES: readonly string[] = [
  'trialing',
  'active',
  'past_due',
]

/**
 * Bir add-on yalnızca bağlı olduğu abonelik hâlâ geçerliyken ve o aboneliğin
 * mevcut faturalama dönemi bitmediyse kapasite sağlar. Abonelik iptal/dolmuş/
 * ödeme bekleyen ise ya da aboneliğe bağlı değilse kapasite 0'dır.
 */
export function grantEffectiveEnd(grant: AddOnGrant): string | null {
  if (addOnBillingPeriod(grant.addonCode) === 'year') {
    // Yearly: the 12-month window is the grant's own `expiresAt`; it also stops
    // when the main subscription's period does (same rule as a monthly add-on).
    if (!grant.expiresAt) return null
    if (!grant.subscriptionPeriodEnd) return grant.expiresAt
    return new Date(grant.subscriptionPeriodEnd) < new Date(grant.expiresAt)
      ? grant.subscriptionPeriodEnd
      : grant.expiresAt
  }
  return grant.subscriptionPeriodEnd ?? grant.expiresAt
}

function isGrantActive(grant: AddOnGrant, now: Date): boolean {
  if (grant.status !== 'active') return false
  if (!grant.subscriptionId) return false
  if (!grant.subscriptionStatus || !ADD_ON_ENTITLED_SUBSCRIPTION_STATUSES.includes(grant.subscriptionStatus)) {
    return false
  }
  if (grant.startsAt && new Date(grant.startsAt) > now) return false
  const end = grantEffectiveEnd(grant)
  if (!end || new Date(end) <= now) return false
  return true
}

/**
 * Aktif add-on kapasitesinin toplamı. Satın alınmamış add-on = 0. Bilinmeyen
 * kodlar ve pakete uygun olmayan türler sayılmaz.
 */
export function sumActiveAddOnCapacity(
  grants: readonly AddOnGrant[],
  kind: AddOnKind,
  planCode: PlanCode,
  now: Date = new Date(),
): number {
  if (!isAddOnEligible(kind, planCode)) return 0
  let total = 0
  for (const grant of grants) {
    if (!isAddOnEligibleForCode(grant.addonCode, planCode)) continue
    const def = ADD_ONS[grant.addonCode]
    if (def.kind !== kind) continue
    if (!isGrantActive(grant, now)) continue
    total += def.capacity
  }
  return total
}

export function sumActiveSiteAddOnCapacity(
  grants: readonly AddOnGrant[],
  target: SiteAddOnTarget,
  planCode: PlanCode,
  now: Date = new Date(),
): number {
  if (!isAddOnEligible('site', planCode)) return 0
  let total = 0
  for (const grant of grants) {
    if (!isAddOnEligibleForCode(grant.addonCode, planCode)) continue
    const def = ADD_ONS[grant.addonCode]
    if (def.kind !== 'site' || !isGrantActive(grant, now)) continue
    if (target === 'ecommerce' ? def.siteTarget !== 'ecommerce' : def.siteTarget === 'ecommerce') continue
    total += def.capacity
  }
  return total
}

type ResolveInput = {
  planCode: string | null | undefined
  grants: readonly AddOnGrant[]
  now?: Date
}

/**
 * Etkin toplam yayın limiti = (admin istisnası ?? paket limiti) + etkin site SKU'ları.
 * Admin istisnası (user_limit_overrides) taban değeri belirler; add-onlar onun
 * üzerine eklenir.
 */
export function resolveEffectiveSiteLimit(input: ResolveInput & { override?: number | null }): number {
  const planCode = toPlanCode(input.planCode)
  const base = input.override ?? SITE_LIMITS[planCode]
  return base + sumActiveAddOnCapacity(input.grants, 'site', planCode, input.now)
}

export type EffectiveSiteLimits = {
  total: number
  corporate: number
  ecommerce: number
}

export function resolveEffectiveEcommerceSiteLimit(input: ResolveInput): number {
  const planCode = toPlanCode(input.planCode)
  return ECOMMERCE_SITE_LIMITS[planCode] +
    sumActiveSiteAddOnCapacity(input.grants, 'ecommerce', planCode, input.now)
}

export function resolveEffectiveSiteLimits(
  input: ResolveInput & { override?: number | null },
): EffectiveSiteLimits {
  const total = resolveEffectiveSiteLimit(input)
  const ecommerce = resolveEffectiveEcommerceSiteLimit(input)
  return { total, ecommerce, corporate: Math.max(0, total - ecommerce) }
}

/**
 * Etkin ürün limiti = paket ürün limiti + aktif ek ürün. Pakette ürün limiti
 * tanımlı değilse (FREE/STARTER) `null` döner: mevcut davranış korunur.
 */
export function resolveEffectiveProductLimit(input: ResolveInput): number | null {
  const planCode = toPlanCode(input.planCode)
  const base = PRODUCT_LIMITS[planCode]
  if (base === null) return null
  return base + sumActiveAddOnCapacity(input.grants, 'product', planCode, input.now)
}

/** Base e-commerce site allowance before any typed add-on grants. */
export function resolveEcommerceSiteLimit(planCode: string | null | undefined): number {
  return ECOMMERCE_SITE_LIMITS[toPlanCode(planCode)]
}

export type ActiveAddOn = {
  code: AddOnCode
  kind: AddOnKind
  siteTarget?: SiteAddOnTarget
  capacity: number
  expiresAt: string | null
}

export type AddOnCatalogItem = {
  code: AddOnCode
  kind: AddOnKind
  siteTarget?: SiteAddOnTarget
  capacity: number
  period: AddOnBillingPeriod
  /** Sunucuda çözümlenen fiyat (kuruş, KDV dahil; yıllıkta 12 aylık tek tahsilat) ve para birimi. */
  priceCents: number
  currency: string
  /** Sunucunun, kullanıcının paketine göre belirlediği uygunluk. */
  eligible: boolean
}

/**
 * /billing ve /billing/add-ons ekranlarının tükettiği, istemciye güvenle
 * serileştirilebilen özet. Uygunluk ve kapasite yalnızca sunucuda hesaplanır;
 * istemci bu değerleri değiştirmez, yalnızca gösterir.
 */
export type AddOnOverview = {
  planCode: PlanCode
  site: { eligible: boolean; base: number; addOn: number; total: number }
  product: { eligible: boolean; base: number | null; addOn: number; total: number | null }
  /** Mailboxes: included by the package + active GLOVAL Mail add-ons. */
  mail: { eligible: boolean; base: number; addOn: number; total: number }
  /** Site-type allowances after eligible, active add-ons. */
  corporateSiteLimit: number
  ecommerceSiteLimit: number
  /** Yalnızca şu an kapasiteye gerçekten katkı veren kayıtlar. */
  active: ActiveAddOn[]
  catalog: AddOnCatalogItem[]
}

export function buildAddOnOverview(
  input: ResolveInput & { override?: number | null; prices?: Record<AddOnCode, AddOnPrice> },
): AddOnOverview {
  const planCode = toPlanCode(input.planCode)
  const prices = input.prices ?? resolveAddOnPrices([])
  const now = input.now ?? new Date()
  const siteAddOn = sumActiveAddOnCapacity(input.grants, 'site', planCode, now)
  const productAddOn = sumActiveAddOnCapacity(input.grants, 'product', planCode, now)
  const productBase = PRODUCT_LIMITS[planCode]
  const mailAddOn = sumActiveAddOnCapacity(input.grants, 'mail', planCode, now)
  const mailBase = PLAN_INCLUDED_MAILBOXES[planCode]
  const siteLimits = resolveEffectiveSiteLimits({ ...input, now })

  const active: ActiveAddOn[] = []
  for (const grant of input.grants) {
    if (!isAddOnCode(grant.addonCode)) continue
    const def = ADD_ONS[grant.addonCode]
    if (!isAddOnEligibleForCode(def.code, planCode)) continue
    if (!isGrantActive(grant, now)) continue
    active.push({
      code: def.code,
      kind: def.kind,
      ...(def.siteTarget ? { siteTarget: def.siteTarget } : {}),
      capacity: def.capacity,
      // A yearly add-on shows its own 12-month end, not the monthly plan's period end.
      expiresAt: def.period === 'year' ? grant.expiresAt : grantEffectiveEnd(grant),
    })
  }

  return {
    planCode,
    site: {
      eligible: isAddOnEligible('site', planCode),
      base: input.override ?? SITE_LIMITS[planCode],
      addOn: siteAddOn,
      total: siteLimits.total,
    },
    product: {
      eligible: isAddOnEligible('product', planCode),
      base: productBase,
      addOn: productAddOn,
      total: resolveEffectiveProductLimit({ ...input, now }),
    },
    mail: {
      eligible: isAddOnEligible('mail', planCode),
      base: mailBase,
      addOn: mailAddOn,
      total: mailBase + mailAddOn,
    },
    corporateSiteLimit: siteLimits.corporate,
    ecommerceSiteLimit: siteLimits.ecommerce,
    active,
    catalog: Object.values(ADD_ONS)
      .filter((def) => def.saleEnabled !== false)
      .map((def) => ({
        code: def.code,
        kind: def.kind,
        ...(def.siteTarget ? { siteTarget: def.siteTarget } : {}),
        capacity: def.capacity,
        period: def.period ?? 'month',
        priceCents: prices[def.code].priceCents,
        currency: prices[def.code].currency,
        eligible: isAddOnEligibleForCode(def.code, planCode),
      })),
  }
}
