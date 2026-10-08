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

export type AddOnCode =
  | 'extra_site_1'
  | 'extra_site_3'
  | 'extra_site_5'
  | 'extra_product_100'
  | 'extra_product_200'
  | 'extra_product_500'
  | 'extra_mail_1'
  | 'extra_mail_10'
  | 'extra_mail_25'
  | 'extra_mail_50'

export type AddOnDefinition = {
  code: AddOnCode
  kind: AddOnKind
  /** Plan limitinin üzerine eklenen kapasite. */
  capacity: number
  /** Aylık liste fiyatı (kuruş). `billing_plans.price_cents` ile aynı tutulur; DB satırı önceliklidir. */
  listPriceCents: number
  currency: 'TRY'
  /**
   * Geçerlilik modeli: add-on tek seferlik değildir ve sabit gün sayısına bağlı
   * değildir; satın alındığı ana aboneliğin faturalama dönemiyle birlikte
   * geçerlidir (bkz. `isGrantActive`).
   */
  validity: 'subscription_period'
}

export const ADD_ONS: Record<AddOnCode, AddOnDefinition> = {
  extra_site_1: { code: 'extra_site_1', kind: 'site', capacity: 1, listPriceCents: 9900, currency: 'TRY', validity: 'subscription_period' },
  extra_site_3: { code: 'extra_site_3', kind: 'site', capacity: 3, listPriceCents: 19900, currency: 'TRY', validity: 'subscription_period' },
  extra_site_5: { code: 'extra_site_5', kind: 'site', capacity: 5, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period' },
  extra_product_100: { code: 'extra_product_100', kind: 'product', capacity: 100, listPriceCents: 9900, currency: 'TRY', validity: 'subscription_period' },
  extra_product_200: { code: 'extra_product_200', kind: 'product', capacity: 200, listPriceCents: 14900, currency: 'TRY', validity: 'subscription_period' },
  extra_product_500: { code: 'extra_product_500', kind: 'product', capacity: 500, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period' },
  // GLOVAL Mail: `capacity` is the number of mailboxes. This is the only place prices and sizes live.
  extra_mail_1: { code: 'extra_mail_1', kind: 'mail', capacity: 1, listPriceCents: 4900, currency: 'TRY', validity: 'subscription_period' },
  extra_mail_10: { code: 'extra_mail_10', kind: 'mail', capacity: 10, listPriceCents: 14900, currency: 'TRY', validity: 'subscription_period' },
  extra_mail_25: { code: 'extra_mail_25', kind: 'mail', capacity: 25, listPriceCents: 29900, currency: 'TRY', validity: 'subscription_period' },
  extra_mail_50: { code: 'extra_mail_50', kind: 'mail', capacity: 50, listPriceCents: 49900, currency: 'TRY', validity: 'subscription_period' },
}

/** Every GLOVAL Mail add-on code, in catalog order. */
export const MAIL_ADD_ON_CODES: readonly AddOnCode[] = Object.values(ADD_ONS)
  .filter((def) => def.kind === 'mail')
  .map((def) => def.code)

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
      (row.interval ?? 'month') === 'month' &&
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
    if (!isAddOnCode(grant.addonCode)) continue
    const def = ADD_ONS[grant.addonCode]
    if (def.kind !== kind) continue
    if (!isGrantActive(grant, now)) continue
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
 * Etkin yayın (site) limiti = (admin istisnası ?? paket limiti) + aktif ek site.
 * Admin istisnası (user_limit_overrides) taban değeri belirler; add-on onun
 * üzerine eklenir.
 */
export function resolveEffectiveSiteLimit(input: ResolveInput & { override?: number | null }): number {
  const planCode = toPlanCode(input.planCode)
  const base = input.override ?? SITE_LIMITS[planCode]
  return base + sumActiveAddOnCapacity(input.grants, 'site', planCode, input.now)
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

/**
 * E-ticaret sitesi hakkı. Ek site add-on'ları bu sayıyı ARTIRMAZ: e-ticaret
 * paketinde 3 kurumsal + 1 e-ticaret ayrımı korunur, ek site yalnızca toplam
 * yayın kapasitesini büyütür.
 */
export function resolveEcommerceSiteLimit(planCode: string | null | undefined): number {
  return ECOMMERCE_SITE_LIMITS[toPlanCode(planCode)]
}

export type ActiveAddOn = {
  code: AddOnCode
  kind: AddOnKind
  capacity: number
  expiresAt: string | null
}

export type AddOnCatalogItem = {
  code: AddOnCode
  kind: AddOnKind
  capacity: number
  /** Sunucuda çözümlenen aylık fiyat (kuruş) ve para birimi. */
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
  /** Ek site ile ARTMAYAN e-ticaret sitesi hakkı. */
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

  const active: ActiveAddOn[] = []
  for (const grant of input.grants) {
    if (!isAddOnCode(grant.addonCode)) continue
    const def = ADD_ONS[grant.addonCode]
    if (!isAddOnEligible(def.kind, planCode)) continue
    if (!isGrantActive(grant, now)) continue
    active.push({
      code: def.code,
      kind: def.kind,
      capacity: def.capacity,
      expiresAt: grantEffectiveEnd(grant),
    })
  }

  return {
    planCode,
    site: {
      eligible: isAddOnEligible('site', planCode),
      base: input.override ?? SITE_LIMITS[planCode],
      addOn: siteAddOn,
      total: resolveEffectiveSiteLimit({ ...input, now }),
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
    ecommerceSiteLimit: resolveEcommerceSiteLimit(planCode),
    active,
    catalog: Object.values(ADD_ONS).map((def) => ({
      code: def.code,
      kind: def.kind,
      capacity: def.capacity,
      priceCents: prices[def.code].priceCents,
      currency: prices[def.code].currency,
      eligible: isAddOnEligible(def.kind, planCode),
    })),
  }
}
