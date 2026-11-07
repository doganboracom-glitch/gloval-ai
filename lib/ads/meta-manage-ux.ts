/**
 * Phase M3 client-safe helpers: badge, visible actions, consent wording and API error copy.
 * No server imports, so the panel and the tests share the exact same rules as the routes.
 */
import { dailyBudgetToMinor } from '@/lib/ads/meta-publish-plan'
import { metaMinorToMajor } from '@/lib/ads/meta-ads-shared'
import {
  DISAPPROVED_EFFECTIVE_STATES,
  REVIEW_EFFECTIVE_STATES,
  metaPlanStatusView,
  type MetaPlanStatusKey,
  type MetaPlanTone,
} from '@/lib/ads/meta-plan-status'

export type MetaManageAction = 'activate' | 'pause' | 'budget'

export const META_MANAGE_TERMS_VERSION = 'meta-manage-2026-07'

export type MetaBadgeKey = MetaPlanStatusKey

export type MetaBadge = { key: MetaBadgeKey; label: string; tone: MetaPlanTone }

const REVIEW_STATES = REVIEW_EFFECTIVE_STATES
const DISAPPROVED_STATES = DISAPPROVED_EFFECTIVE_STATES

/** Plan status chip data; delegates to the shared colour-language mapping so a plan never shows "Etkin" while Meta still reviews its ad. */
export function metaPlanBadge(plan: { status: string; effectiveStatus?: string | null }): MetaBadge {
  const view = metaPlanStatusView(plan, 'tr')
  return { key: view.key, label: view.label, tone: view.tone }
}

export type MetaManageVisibility = {
  /** The plan is a created Meta campaign that can be managed at all. */
  managed: boolean
  activate: boolean
  pause: boolean
  budget: boolean
  /** Budget edits are limited to decreases (no spend increase without the full permission). */
  budgetDecreaseOnly: boolean
  /** Show the "give management permission" card instead of buttons. */
  needsPermission: boolean
}

const MANAGEABLE = new Set(['published', 'user_paused', 'active'])

export function metaManageVisibility(input: {
  status: string
  canManage: boolean
  canManageProtective: boolean
  hasManagementScope: boolean
}): MetaManageVisibility {
  const managed = MANAGEABLE.has(input.status)
  const none: MetaManageVisibility = { managed, activate: false, pause: false, budget: false, budgetDecreaseOnly: false, needsPermission: false }
  if (!managed) return none
  if (!input.hasManagementScope) return { ...none, needsPermission: true }
  const protective = input.canManage || input.canManageProtective
  return {
    managed,
    activate: input.canManage && (input.status === 'published' || input.status === 'user_paused'),
    pause: protective && input.status === 'active',
    budget: protective,
    budgetDecreaseOnly: !input.canManage,
    needsPermission: false,
  }
}

export type BudgetChange = 'increase' | 'decrease' | 'same' | 'invalid'

export function classifyBudgetChange(currentMinor: number | null, nextMinor: number | null): BudgetChange {
  if (nextMinor === null || !Number.isFinite(nextMinor) || nextMinor <= 0) return 'invalid'
  if (currentMinor === null) return 'increase'
  if (nextMinor === currentMinor) return 'same'
  return nextMinor > currentMinor ? 'increase' : 'decrease'
}

/** Money-increasing actions need the explicit consent checkbox; protective ones never do. */
export function manageNeedsConsent(action: MetaManageAction, change: BudgetChange = 'same'): boolean {
  return action === 'activate' || (action === 'budget' && change === 'increase')
}

export function formatMetaMoney(minor: number | null, currency: string | null): string {
  const major = metaMinorToMajor(minor, currency)
  if (major === null) return '-'
  const code = currency ?? ''
  return `${major.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${code}`.trim()
}

/** Plain-language spend consent shown in the dialog and frozen in the audit row. */
export function metaSpendConsentText(dailyBudgetMinor: number | null, currency: string | null, action: MetaManageAction = 'activate'): string {
  const money = formatMetaMoney(dailyBudgetMinor, currency)
  const lead = action === 'budget'
    ? `Günlük bütçeyi ${money} olarak güncellemeyi onaylıyorum.`
    : `Kampanyayı etkinleştirmeyi onaylıyorum.`
  return `${lead} Meta, ödeme yönteminizden günde en fazla ${money} tutarında harcama yapabilir; harcama kampanya Meta incelemesinden geçtikten sonra başlar. Kampanyayı istediğim zaman duraklatabilirim.`
}

export function parseBudgetInput(value: string, currency: string | null): { ok: true; minor: number } | { ok: false; error: string } {
  const result = dailyBudgetToMinor(value, currency)
  if (result.ok) return { ok: true, minor: result.minor }
  const messages = {
    currency_unsupported: 'Bu para birimi için bütçe değiştirilemiyor.',
    invalid_amount: 'Geçerli bir günlük bütçe girin.',
    too_many_decimals: 'Bütçede en fazla iki ondalık basamak kullanılabilir.',
    amount_too_small: 'Günlük bütçe sıfırdan büyük olmalı.',
  } as const
  return { ok: false, error: messages[result.error] }
}

export const META_MANAGE_ERRORS: Record<string, string> = {
  manage_not_allowed: 'Kampanya yönetimi bu hesap için henüz açık değil.',
  manage_in_progress: 'Bu kampanyada başka bir işlem sürüyor. Birkaç saniye sonra tekrar deneyin.',
  terms_required: 'Devam etmek için harcama onayını işaretleyin.',
  transition_not_allowed: 'Kampanyanın durumu bu işleme uygun değil. Sayfayı yenileyip durumu kontrol edin.',
  activation_blocked: 'Kampanya şu an etkinleştirilemiyor.',
  ad_disapproved: 'Meta reklamı onaylamadı. Reklamı düzeltmeden kampanya başlatılamaz.',
  payment_required: 'Meta hesabında ödeme yöntemi tanımlı olmalı. Meta Reklam Yöneticisi\'nden ekleyip tekrar deneyin.',
  budget_too_low: 'Günlük bütçe Meta\'nın bu hesap için kabul ettiği alt sınırın altında.',
  publish_permission_missing: 'Yönetim izni eksik. Ayarlar sekmesinden izni verin.',
  write_outcome_unknown: 'Meta\'nın yanıtı alınamadı; sonuç doğrulanamadı. Durum birkaç dakika içinde otomatik güncellenir, yeniden denemeden önce kontrol edin.',
  kill_switch_active: 'Meta işlemleri geçici olarak durduruldu. Daha sonra tekrar deneyin.',
  plan_not_found: 'Plan bulunamadı.',
  reauth_required: 'Meta bağlantısını Ayarlar sekmesinden yenileyin.',
  token_expired: 'Meta bağlantısının süresi dolmuş. Ayarlar sekmesinden yenileyin.',
  rate_limited: 'Çok fazla deneme yaptınız. Biraz bekleyip tekrar deneyin.',
  api_quota_exceeded: 'Günlük Meta işlem sınırına ulaşıldı. Yarın tekrar deneyin.',
  invalid_request: 'İstek geçersiz. Sayfayı yenileyip tekrar deneyin.',
  network_error: 'Bağlantı kurulamadı. İnternetinizi kontrol edip tekrar deneyin.',
}

export function describeMetaManageError(error: { error?: string; message?: string | null }): string {
  const code = error.error ?? ''
  if (error.message && (code === 'activation_blocked' || code === 'ad_disapproved' || code === 'meta_rejected' || code === 'payment_required')) {
    return error.message
  }
  return META_MANAGE_ERRORS[code] ?? error.message ?? 'İşlem tamamlanamadı. Daha sonra tekrar deneyin.'
}

export type MetaLiveView = {
  campaign?: { status: string | null; effectiveStatus: string | null }
  adSet?: { status: string | null; effectiveStatus: string | null; dailyBudgetMinor: number | null }
  ad?: { status: string | null; effectiveStatus: string | null; reviewFeedback: string | null }
  spend?: { todayMajor: number | null; last7DaysMajor: number | null; impressionsToday: number | null; impressions7Days: number | null } | null
  fetchedAt?: string
}

/** One-line explanation when the ad is not simply running, so "Etkin" never hides a review or a rejection. */
export function metaEffectiveStatusNote(effective: string | null | undefined, feedback?: string | null): string | null {
  if (!effective) return null
  if (REVIEW_STATES.has(effective)) return 'Reklam Meta incelemesinde; onaylanana kadar gösterilmez ve harcama başlamaz.'
  if (DISAPPROVED_STATES.has(effective)) return feedback ? `Meta reklamı onaylamadı: ${feedback}` : 'Meta reklamı onaylamadı. Meta Reklam Yöneticisi\'nde ayrıntıyı inceleyin.'
  if (effective === 'PENDING_BILLING_INFO') return 'Meta hesabında ödeme bilgisi bekleniyor.'
  if (effective === 'CAMPAIGN_PAUSED' || effective === 'ADSET_PAUSED') return 'Üst nesne duraklatılmış olduğu için reklam gösterilmiyor.'
  return null
}
