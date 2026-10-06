import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveSiteLimitOverride } from '@/lib/site-limit-override'
import { toPlanCode } from '@/lib/pricing-config'
import {
  ADD_ONS,
  ADD_ON_ENTITLED_SUBSCRIPTION_STATUSES,
  buildAddOnOverview,
  isAddOnCode,
  isAddOnEligible,
  resolveAddOnPrices,
  resolveEffectiveProductLimit,
  resolveEffectiveSiteLimit,
  type AddOnCode,
  type AddOnGrant,
  type AddOnOverview,
  type AddOnPlanRow,
  type AddOnPrice,
} from '@/lib/add-ons'

type SubscriptionEmbed = {
  id: string
  status: string
  current_period_end: string | null
}

/**
 * Kullanıcının add-on kayıtlarını bağlı oldukları abonelik satırıyla birlikte
 * okur (sunucu tarafı, service role). Geçerlilik canlı abonelik satırından
 * türetilir. Hata durumunda boş döner: okuma sorunu hiçbir zaman kapasiteyi
 * yükseltmez.
 */
export async function getAddOnGrants(userId: string): Promise<AddOnGrant[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('user_addon_entitlements')
      .select(
        'addon_code, status, starts_at, expires_at, subscription_id, billing_subscriptions(id, status, current_period_end)',
      )
      .eq('user_id', userId)
      .eq('status', 'active')
    if (error || !data) return []
    return (data as unknown as Array<Record<string, unknown>>).map((row) => {
      // The embedded relation arrives as an object or a one-item array.
      const rawSub = row.billing_subscriptions as SubscriptionEmbed | SubscriptionEmbed[] | null
      const sub = Array.isArray(rawSub) ? rawSub[0] : rawSub
      return {
        addonCode: row.addon_code as string,
        status: row.status as string,
        startsAt: (row.starts_at as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
        subscriptionId: (row.subscription_id as string | null) ?? null,
        subscriptionStatus: sub?.status ?? null,
        subscriptionPeriodEnd: sub?.current_period_end ?? null,
      }
    })
  } catch {
    return []
  }
}

/**
 * Add-on fiyatlarını `billing_plans` kataloğundan çözer. Okuma hatasında
 * katalog liste fiyatına düşer; fiyat asla istemciden gelmez.
 */
export async function getAddOnPrices(): Promise<Record<AddOnCode, AddOnPrice>> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('billing_plans')
      .select('code, price_cents, currency, interval, product_category, active')
      .eq('product_category', 'addon')
    if (error || !data) return resolveAddOnPrices([])
    return resolveAddOnPrices(data as AddOnPlanRow[])
  } catch {
    return resolveAddOnPrices([])
  }
}

/** Tek bir add-on'un sunucu tarafı fiyatı; bilinmeyen kod için null. */
export async function resolveServerAddOnPrice(code: unknown): Promise<AddOnPrice | null> {
  if (!isAddOnCode(code)) return null
  return (await getAddOnPrices())[code]
}

/** Etkin yayın limiti: (admin istisnası ?? paket limiti) + aktif ek site. */
export async function getEffectiveSiteLimit(
  userId: string,
  planCode: string | null | undefined,
): Promise<number> {
  const [override, grants] = await Promise.all([
    getActiveSiteLimitOverride(userId),
    getAddOnGrants(userId),
  ])
  return resolveEffectiveSiteLimit({ planCode, override, grants })
}

/** Etkin ürün limiti: paket ürün limiti + aktif ek ürün. null = limitsiz paket. */
export async function getEffectiveProductLimit(
  userId: string,
  planCode: string | null | undefined,
): Promise<number | null> {
  const grants = await getAddOnGrants(userId)
  return resolveEffectiveProductLimit({ planCode, grants })
}

/**
 * Kullanıcının "Ek Hizmetler" ekranı için sunucu tarafı özeti: plan limiti,
 * aktif ek kapasite, uygunluk, fiyatlı katalog. Aboneliği sona ermiş veya
 * süresi dolmuş kayıtlar dahil edilmez.
 */
export async function getAddOnOverview(
  userId: string,
  planCode: string | null | undefined,
): Promise<AddOnOverview> {
  const [override, grants, prices] = await Promise.all([
    getActiveSiteLimitOverride(userId),
    getAddOnGrants(userId),
    getAddOnPrices(),
  ])
  return buildAddOnOverview({ planCode, override, grants, prices })
}

export type GrantAddOnError =
  | 'invalid_addon'
  | 'invalid_key'
  | 'subscription_not_found'
  | 'subscription_inactive'
  | 'not_eligible'
  | 'db_error'

/**
 * Gerçek bir satın alma (ileride ödeme akışı) sonrasında add-on hakkı verir.
 * Hak her zaman kullanıcının GEÇERLİ bir abonelik satırına bağlanır ve
 * `expires_at` o aboneliğin `current_period_end` değerinden alınır (sabit gün
 * sayısı yok, süresiz kayıt yok). Kapasite yalnızca katalogdaki koddan türetilir;
 * çağıran sayı veremez. `idempotencyKey` aynıysa tekrar çağrı yeni kayıt
 * oluşturmaz. Şu an hiçbir ödeme akışına bağlı DEĞİLDİR.
 */
export async function grantAddOn(input: {
  userId: string
  addonCode: AddOnCode
  subscriptionId: string
  idempotencyKey: string
  source?: string
  /** `addon_purchases.id` that paid for this grant; unique, so a purchase yields at most one grant. */
  purchaseId?: string
}): Promise<{ ok: true } | { ok: false; error: GrantAddOnError }> {
  if (!isAddOnCode(input.addonCode)) return { ok: false, error: 'invalid_addon' }
  if (!input.idempotencyKey.trim()) return { ok: false, error: 'invalid_key' }
  const def = ADD_ONS[input.addonCode]
  const admin = createAdminClient()

  const { data: sub, error: subErr } = await admin
    .from('billing_subscriptions')
    .select(
      'id, user_id, status, current_period_end, billing_plans!billing_subscriptions_plan_id_fkey(code)',
    )
    .eq('id', input.subscriptionId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (subErr) return { ok: false, error: 'db_error' }
  if (!sub) return { ok: false, error: 'subscription_not_found' }

  const periodEnd = sub.current_period_end as string | null
  if (
    !ADD_ON_ENTITLED_SUBSCRIPTION_STATUSES.includes(sub.status as string) ||
    !periodEnd ||
    new Date(periodEnd) <= new Date()
  ) {
    return { ok: false, error: 'subscription_inactive' }
  }

  const rawPlan = (sub as unknown as { billing_plans: { code: string } | { code: string }[] | null })
    .billing_plans
  const planCode = toPlanCode((Array.isArray(rawPlan) ? rawPlan[0] : rawPlan)?.code)
  if (!isAddOnEligible(def.kind, planCode)) return { ok: false, error: 'not_eligible' }

  const { error } = await admin.from('user_addon_entitlements').upsert(
    {
      user_id: input.userId,
      subscription_id: input.subscriptionId,
      addon_code: def.code,
      kind: def.kind,
      status: 'active',
      expires_at: periodEnd,
      idempotency_key: input.idempotencyKey,
      source: input.source ?? null,
      ...(input.purchaseId ? { purchase_id: input.purchaseId } : {}),
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true },
  )
  return error ? { ok: false, error: 'db_error' } : { ok: true }
}
