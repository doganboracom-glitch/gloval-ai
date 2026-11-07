'use client'

import { useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { AlertDialog } from '@base-ui/react/alert-dialog'
import { AlertCircle, Archive, Check, Pause, Play, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { evaluateGoogleAdsAmountRisk, googleAdsMonthlyBudgetUpperBoundMinor, googleAdsRiskConfirmationError } from '@/lib/ads/google-ads-risk'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldGroup, FieldLabel, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { AdsDisclosure, openAdsDisclosure } from '@/components/ads/ads-disclosure'
import type {
  GoogleAdsManagementAction,
  GoogleAdsManagementPartial,
  GoogleAdsManagementSectionErrors,
  GoogleAdsManagementSnapshot,
} from '@/lib/ads/google-ads-management'

type Plan = { id: string; status: string; version: number }
type ActionName = 'pause' | 'enable' | 'budget' | 'ad_copy' | 'keyword' | 'archive' | 'undo'
type ManagementResponse = {
  ok?: boolean
  error?: string
  snapshot?: GoogleAdsManagementSnapshot | null
  partial?: GoogleAdsManagementPartial
  sectionErrors?: GoogleAdsManagementSectionErrors
  actions?: GoogleAdsManagementAction[]
  stateVerified?: boolean
  /** Campaign state after a mutate; derived from the mutate target when Google could not be re-read. */
  afterState?: Partial<GoogleAdsManagementSnapshot> | null
  meta?: { cacheHit: boolean; refreshedAt: string; refreshLimited: boolean; retryAfterSeconds: number }
}

const REFRESH_COOLDOWN_SECONDS = 10

type Confirmation = {
  action: ActionName
  payload?: Record<string, unknown>
  title: string
  description: string
  before?: string
  after?: string
  irreversible?: boolean
  budgetAmountMinor?: number | null
  assessRisk?: boolean
  previousDailyBudgetMinor?: number | null
  previousPublishedBudgetMinor?: number | null
  risk?: ReturnType<typeof evaluateGoogleAdsAmountRisk> | null
}

class ManagementApiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export function managementKey(planId: string) {
  return `/api/ads/google/management?planId=${encodeURIComponent(planId)}`
}

export type { ManagementResponse }

export async function fetchManagement(url: string): Promise<ManagementResponse> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  const payload = await response.json() as ManagementResponse
  if (!response.ok || payload.ok !== true) throw new ManagementApiError(payload.error ?? 'provider_error')
  return payload
}

function actionAppliedMessage(action: ActionName, isTr: boolean) {
  const tr: Record<ActionName, string> = {
    enable: 'Kampanya etkinleştirildi, Google doğrulaması bekleniyor.',
    pause: 'Kampanya duraklatıldı, Google doğrulaması bekleniyor.',
    budget: 'Günlük bütçe güncellendi, Google doğrulaması bekleniyor.',
    ad_copy: 'Reklam metni güncellendi, Google doğrulaması bekleniyor.',
    keyword: 'Anahtar kelime değişikliği uygulandı, Google doğrulaması bekleniyor.',
    archive: 'Kampanya arşivlendi, Google doğrulaması bekleniyor.',
    undo: 'Geri alma uygulandı, Google doğrulaması bekleniyor.',
  }
  const en: Record<ActionName, string> = {
    enable: 'Campaign enabled; waiting for Google to confirm.',
    pause: 'Campaign paused; waiting for Google to confirm.',
    budget: 'Daily budget updated; waiting for Google to confirm.',
    ad_copy: 'Ad copy updated; waiting for Google to confirm.',
    keyword: 'Keyword change applied; waiting for Google to confirm.',
    archive: 'Campaign archived; waiting for Google to confirm.',
    undo: 'Undo applied; waiting for Google to confirm.',
  }
  const tail = isTr
    ? ' Google doğrulaması daha sonra tamamlanacak; işlemi tekrar uygulamayın.'
    : ' Verification will complete later; do not repeat the change.'
  return (isTr ? tr : en)[action] + tail
}

function currencyDigits(currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

function majorFromMicros(micros: string, currency: string) {
  return (Number(micros) / 1_000_000).toFixed(currencyDigits(currency))
}

function minorFromMajor(value: string, currency: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) return null
  const minor = amount * 10 ** currencyDigits(currency)
  return Number.isSafeInteger(minor) ? minor : null
}

function minorFromLocalizedAmount(value: string, currency: string, isTr: boolean) {
  const trimmed = value.trim().replace(/\s/g, '')
  if (!trimmed) return null
  const locale = isTr ? 'tr-TR' : 'en-US'
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5)
  const group = parts.find((part) => part.type === 'group')?.value ?? ','
  const decimal = parts.find((part) => part.type === 'decimal')?.value ?? '.'
  let localized = trimmed
  if (decimal !== '.' && localized.includes('.') && !localized.includes(decimal)) {
    const trailingDigits = localized.length - localized.lastIndexOf('.') - 1
    if (trailingDigits !== 3) localized = localized.replace('.', decimal)
  }
  const normalized = localized.replaceAll(group, '').replace(decimal, '.').replace(/[^\d.]/g, '')
  const major = Number(normalized)
  if (!Number.isFinite(major) || major <= 0) return null
  const minor = major * 10 ** currencyDigits(currency)
  return Number.isSafeInteger(minor) ? minor : null
}

function microsFromMinor(minor: number, currency: string) {
  const micros = minor * 10 ** (6 - currencyDigits(currency))
  return Number.isSafeInteger(micros) ? micros : null
}

function formatMicros(micros: string, currency: string, isTr: boolean) {
  return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(Number(micros) / 1_000_000)
}

function formatCount(value: number, isTr: boolean) {
  return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { maximumFractionDigits: 1 }).format(value)
}

function statusLabel(status: string, isTr: boolean) {
  if (status === 'ENABLED') return isTr ? 'Etkin' : 'Enabled'
  if (status === 'PAUSED') return isTr ? 'Duraklatıldı' : 'Paused'
  if (status === 'REMOVED') return isTr ? 'Arşivlendi' : 'Archived'
  return isTr ? 'Durum doğrulanamadı' : 'Status unverified'
}

function actionLabel(action: GoogleAdsManagementAction, isTr: boolean) {
  let label: string
  if (action.action_type === 'google_ads_campaign_status_update') {
    label = action.target.status === 'ENABLED'
      ? (isTr ? 'Kampanya etkinleştirildi' : 'Campaign enabled')
      : (isTr ? 'Kampanya duraklatıldı' : 'Campaign paused')
  } else if (action.action_type === 'google_ads_budget_update') {
    label = isTr ? 'Günlük bütçe değiştirildi' : 'Daily budget changed'
  } else if (action.action_type === 'google_ads_ad_copy_update') {
    label = isTr ? 'Reklam metni değiştirildi' : 'Ad copy changed'
  } else if (action.action_type === 'google_ads_keyword_update') {
    const word = typeof action.target.keywordText === 'string' ? ` · ${action.target.keywordText}` : ''
    const operation = action.target.keywordOperation === 'remove' ? (isTr ? 'Anahtar kelime kaldırıldı' : 'Keyword removed') : (isTr ? 'Anahtar kelime eklendi' : 'Keyword added')
    const negative = action.target.keywordNegative ? (isTr ? ' (negatif)' : ' (negative)') : ''
    label = `${operation}${negative}${word}`
  } else {
    label = isTr ? 'Kampanya arşivlendi (kalıcı)' : 'Campaign archived (permanent)'
  }
  return action.undone_of ? `${isTr ? 'Geri alma işlemi' : 'Undo action'} · ${label}` : label
}

function actionWasUndone(action: GoogleAdsManagementAction, actions: GoogleAdsManagementAction[]) {
  return actions.some((candidate) => candidate.undone_of === action.id && ['approved', 'applied'].includes(candidate.status))
}

function actionStatus(action: GoogleAdsManagementAction, isTr: boolean, wasUndone: boolean) {
  if (action.failure_reason === 'state_unverified') return isTr ? 'Uygulandı · durum doğrulanamadı' : 'Applied · state not verified'
  if (wasUndone) return isTr ? 'Geri alındı' : 'Undone'
  if (action.status === 'applied') return isTr ? 'Uygulandı' : 'Applied'
  if (action.status === 'failed') return isTr ? 'Uygulanmadı' : 'Not applied'
  if (action.status === 'undone') return isTr ? 'Geri alındı' : 'Undone'
  if (action.status === 'approved') return isTr ? 'Google sonucu doğrulanıyor' : 'Reconciling with Google'
  return isTr ? 'Bekliyor' : 'Pending'
}

function errorMessage(code: string | undefined, isTr: boolean) {
  const messages: Record<string, [string, string]> = {
    risk_confirmation_required: ['Riskli tutarı tekrar yazıp onay kutusunu işaretleyin.', 'Re-enter the risky amount and check the acknowledgment box.'],
    risk_confirmation_mismatch: ['Tekrar yazdığınız tutar işlem tutarıyla eşleşmiyor.', 'The re-entered amount does not match the action amount.'],
    action_not_reversible: ['Bu işlem güvenli biçimde geri alınamıyor.', 'This action cannot be safely undone.'],
    action_outcome_unknown: ['Google Ads sonucu henüz doğrulanamadı. Tekrar uygulamayın; durumu yenileyip işlem günlüğünü kontrol edin.', 'Google Ads has not confirmed the outcome. Do not retry; refresh the status and check the activity log.'],
    plan_changed: ['Kampanya durumu değişmiş. Yenileyip tekrar kontrol edin.', 'Campaign state changed. Refresh and review it before acting.'],
    ad_disapproved: ['Google reklamı reddettiği için kampanya etkinleştirilemez.', 'The campaign cannot be enabled because Google disapproved the ad.'],
    ad_review_in_progress: ['Google incelemesi tamamlanmadan kampanya etkinleştirilemez.', 'The campaign cannot be enabled until Google review finishes.'],
    ad_review_status_unavailable: ['Reklam inceleme durumu doğrulanamadı.', 'Ad review status could not be verified.'],
    confirmation_required: ['Bu işlem için gerekli onayları tamamlayın.', 'Complete the required acknowledgments before continuing.'],
  }
  const value = code ? messages[code] : undefined
  return value ? (isTr ? value[0] : value[1]) : (isTr ? 'İşlem tamamlanamadı. Durumu yenileyip tekrar deneyin.' : 'The action could not be completed. Refresh the state before trying again.')
}

function formatMinorAmount(amountMinor: number, currency: string, isTr: boolean) {
  return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency })
    .format(amountMinor / 10 ** currencyDigits(currency))
}

function riskReasonText(reason: string, isTr: boolean) {
  const reasons: Record<string, [string, string]> = {
    above_recommendation: [
      'Tutar ilk plan önerisinin 3 katından fazla.',
      'The amount is more than 3 times the initial plan recommendation.',
    ],
    above_recent_spend: [
      'Tutar, son 30 gün ortalama günlük harcamanın 3 katından fazla.',
      'The amount is more than 3 times the last 30-day average daily spend.',
    ],
    fivefold_previous_budget: [
      'Yeni bütçe önceki bütçenin en az 5 katı; fazladan sıfır yazılmadığını kontrol edin.',
      'The new budget is at least 5 times the previous budget; check for an extra zero.',
    ],
    absolute_threshold: [
      '1.000 TL eşdeğeri mutlak risk eşiği aşılıyor.',
      'The absolute risk threshold equivalent to TRY 1,000 is exceeded.',
    ],
  }
  const copy = reasons[reason]
  return copy ? (isTr ? copy[0] : copy[1]) : reason
}

function actionSummary(action: GoogleAdsManagementAction, currency: string, isTr: boolean) {
  if (action.action_type === 'google_ads_budget_update' && typeof action.target.dailyBudgetMicros === 'string') {
    return formatMicros(action.target.dailyBudgetMicros, currency, isTr)
  }
  if (action.action_type === 'google_ads_ad_copy_update') {
    const headlines = Array.isArray(action.target.headlines) ? action.target.headlines.length : 0
    const descriptions = Array.isArray(action.target.descriptions) ? action.target.descriptions.length : 0
    return isTr ? `${headlines} başlık · ${descriptions} açıklama` : `${headlines} headlines · ${descriptions} descriptions`
  }
  if (action.action_type === 'google_ads_keyword_update') {
    return typeof action.target.keywordText === 'string' ? action.target.keywordText : ''
  }
  if (action.action_type === 'google_ads_campaign_archive') return isTr ? 'Google Ads kampanyası kalıcı kaldırıldı' : 'Permanently removed from Google Ads'
  return ''
}

export function GoogleAdsCampaignManager({ plan, hasConnection, currency, isTr }: {
  plan: Plan | null
  hasConnection: boolean
  currency: string
  isTr: boolean
}) {
  const liveKey = plan?.status === 'published' ? managementKey(plan.id) : null
  const { data, error, isLoading, mutate } = useSWR<ManagementResponse>(liveKey, fetchManagement, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const [budgetValue, setBudgetValue] = useState('')
  const [headlinesValue, setHeadlinesValue] = useState('')
  const [descriptionsValue, setDescriptionsValue] = useState('')
  const [keywordValue, setKeywordValue] = useState('')
  const [keywordMatch, setKeywordMatch] = useState<'PHRASE' | 'EXACT'>('PHRASE')
  const [keywordNegative, setKeywordNegative] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [riskAmountText, setRiskAmountText] = useState('')
  const [riskAck, setRiskAck] = useState(false)
  const [actionAck, setActionAck] = useState(false)
  const [budgetAck, setBudgetAck] = useState(false)
  const [billingAck, setBillingAck] = useState(false)
  const [pending, setPending] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = window.setTimeout(() => setCooldownSeconds((value) => Math.max(0, value - 1)), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldownSeconds])

  async function refreshFromGoogle() {
    if (!liveKey || refreshing || pending || cooldownSeconds > 0) return
    setRefreshing(true)
    setCooldownSeconds(REFRESH_COOLDOWN_SECONDS)
    setActionError(null)
    try {
      const fresh = await fetchManagement(`${liveKey}&refresh=1`)
      await mutate(fresh, { revalidate: false })
      if (fresh.meta?.refreshLimited) {
        setCooldownSeconds(Math.max(1, fresh.meta.retryAfterSeconds))
      } else if (fresh.snapshot) {
        setAwaitingVerification(false)
        setStatusMessage('')
      }
    } catch (caught) {
      setActionError(errorMessage(caught instanceof ManagementApiError ? caught.code : undefined, isTr))
    } finally {
      setRefreshing(false)
    }
  }

  const management = data?.snapshot ?? undefined
  const sectionErrors = data?.sectionErrors ?? {}
  const activity = data?.actions ?? []
  const activeCampaign = plan?.status === 'published' && management !== undefined && management.campaignStatus !== 'REMOVED'
  const currentBudget = management ? majorFromMicros(management.dailyBudgetMicros, currency) : ''
  const inputBudget = budgetValue || currentBudget
  const targetMinor = minorFromMajor(inputBudget, currency)
  const currentBudgetMinor = currentBudget ? minorFromMajor(currentBudget, currency) : null
  const currentStatus = management?.campaignStatus
  const performance = management?.performance ?? data?.partial?.performance ?? null
  const recommendationLabel = management?.recommendationSource === 'ai'
    ? (isTr ? 'İlk AI önerisi' : 'Initial AI recommendation')
    : (isTr ? 'Kaydedilen başlangıç bütçesi' : 'Saved starting budget')
  const confirmationRiskRequired = confirmation?.risk?.risky === true
  const confirmationTypedMinor = confirmationRiskRequired ? minorFromLocalizedAmount(riskAmountText, currency, isTr) : null
  const confirmationRiskMatches = confirmationRiskRequired && confirmation?.budgetAmountMinor !== null && confirmation?.budgetAmountMinor !== undefined && confirmationTypedMinor === confirmation.budgetAmountMinor
  const recommendations = useMemo(() => {
    if (!performance) return []
    const items: { key: string; text: string; target: 'copy' | 'keywords' }[] = []
    if (performance.impressions >= 500 && performance.ctr < 0.01) {
      items.push({
        key: 'ctr',
        text: isTr
          ? `Son 7 günde ${formatCount(performance.impressions, true)} gösterimde tıklama oranı %${(performance.ctr * 100).toFixed(2)} oldu. Yeni reklam metnini incelemeyi düşünün.`
          : `CTR was ${(performance.ctr * 100).toFixed(2)}% across ${formatCount(performance.impressions, false)} impressions in the last 7 days. Consider reviewing the ad copy.`,
        target: 'copy',
      })
    }
    if (performance.conversions === 0 && performance.costMicros !== '0' && management && Number(performance.costMicros) >= Number(management.dailyBudgetMicros) * 3) {
      items.push({
        key: 'terms',
        text: isTr
          ? 'Son 7 günde harcama en az üç günlük bütçeye ulaştı ve dönüşüm görünmüyor. Arama terimlerini ve negatif anahtar kelimeleri gözden geçirin.'
          : 'Seven-day spend reached at least three daily budgets with no conversions recorded. Review search terms and negative keywords.',
        target: 'keywords',
      })
    }
    return items
  }, [isTr, management, performance])

  async function sendAction(action: ActionName, payload: Record<string, unknown> = {}) {
    if (!plan || !management || pending) return
    setPending(true)
    setActionError(null)
    setStatusMessage('')
    try {
      const response = await fetch('/api/ads/google/management', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          actionId: crypto.randomUUID(),
          expectedVersion: plan.version,
          expectedStateHash: management.stateHash,
          action,
          confirm: true,
          ...payload,
        }),
      })
      const result = await response.json() as ManagementResponse
      if (!response.ok || result.ok !== true) throw new ManagementApiError(result.error ?? 'provider_error')
      if (result.stateVerified === false && result.afterState) {
        const derived = result.afterState
        await mutate(
          (current) => current?.snapshot ? { ...current, snapshot: { ...current.snapshot, ...derived } } : current,
          { revalidate: false },
        )
        setAwaitingVerification(true)
        setStatusMessage(actionAppliedMessage(action, isTr))
      } else {
        await mutate()
        setAwaitingVerification(false)
        setStatusMessage(isTr ? 'Değişiklik uygulandı ve işlem günlüğüne kaydedildi.' : 'Change applied and recorded in the activity log.')
      }
      setBudgetValue('')
      setHeadlinesValue('')
      setDescriptionsValue('')
      setKeywordValue('')
      setConfirmation(null)
      setRiskAmountText('')
      setRiskAck(false)
      setActionAck(false)
      setBudgetAck(false)
      setBillingAck(false)

    } catch (caught) {
      setActionError(errorMessage(caught instanceof ManagementApiError ? caught.code : undefined, isTr))
      await mutate()
    } finally {
      setPending(false)
    }
  }

  function openConfirmation(next: Confirmation) {
    const amountMinor = next.budgetAmountMinor ?? currentBudgetMinor
    const assessRisk = next.assessRisk === true
    const risk = assessRisk && amountMinor !== null && management
      ? evaluateGoogleAdsAmountRisk({
          amountMinor,
          currency,
          recommendedDailyBudgetMinor: management.recommendedDailyBudgetMinor,
          averageDailySpend30dMinor: management.averageDailySpend30dMinor,
          previousDailyBudgetMinor: next.previousDailyBudgetMinor ?? null,
          previousPublishedBudgetMinor: next.previousPublishedBudgetMinor ?? null,
        })
      : null
    setConfirmation({ ...next, budgetAmountMinor: amountMinor, risk })
    setRiskAmountText('')
    setRiskAck(false)
    setActionAck(false)
    setBudgetAck(false)
    setBillingAck(false)
  }

  function confirmAction() {
    if (!confirmation) return
    if (!actionAck) return
    const riskRequired = confirmation.risk?.risky === true
    const typedMinor = riskRequired ? minorFromLocalizedAmount(riskAmountText, currency, isTr) : null
    const riskError = confirmation.budgetAmountMinor === null || confirmation.budgetAmountMinor === undefined
      ? riskRequired ? 'risk_confirmation_required' : null
      : googleAdsRiskConfirmationError({
          risky: riskRequired,
          amountMinor: confirmation.budgetAmountMinor,
          riskAcknowledged: riskAck,
          riskConfirmedAmountMinor: typedMinor,
        })
    if (riskError) return
    if (confirmation.action === 'enable' && management?.paymentMethodWarning && !billingAck) return
    const payload = {
      ...confirmation.payload,
      ...(riskRequired ? { riskAcknowledged: true, riskConfirmedAmountMinor: typedMinor } : {}),
    }
    void sendAction(confirmation.action, payload)
  }

  function goTo(id: string) {
    openAdsDisclosure(id)
  }

  if (!hasConnection) {
    return (
      <Card id="google-ads-manager">
        <CardHeader><CardTitle>{isTr ? 'Ads Manager' : 'Ads Manager'}</CardTitle><CardDescription>{isTr ? 'Yayınlanmış kampanyaların güvenli yönetimi' : 'Safe management for published campaigns'}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Alert><AlertCircle aria-hidden="true" /><AlertTitle>{isTr ? 'Google Ads hesabı bağlı değil' : 'No Google Ads account connected'}</AlertTitle><AlertDescription>{isTr ? 'Yönetim kontrolleri yalnızca bu kullanıcıya ait etkin bir müşteri hesabı bağlandığında açılır.' : 'Management controls appear only after this user connects an active customer account.'}</AlertDescription></Alert>
          <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href="#google-ads-workspace-account">{isTr ? 'Hesap bağlantısına git' : 'Go to account connection'}</a>
        </CardContent>
      </Card>
    )
  }

  if (!plan || plan.status !== 'published') {
    const isDraft = plan && ['draft', 'approved', 'failed'].includes(plan.status)
    return (
      <Card id="google-ads-manager">
        <CardHeader><CardTitle>{isTr ? 'Ads Manager' : 'Ads Manager'}</CardTitle><CardDescription>{isTr ? 'Yayınlanmış kampanyaların güvenli yönetimi' : 'Safe management for published campaigns'}</CardDescription></CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{isDraft ? (isTr ? 'Taslak kampanya' : 'Campaign draft') : (isTr ? 'Yayınlanmış kampanya seçin' : 'Select a published campaign')}</AlertTitle>
            <AlertDescription>{isDraft
              ? (isTr ? 'Taslaklar Ads Manager’dan değiştirilemez. Önce mevcut yayınlama incelemesini tamamlayın; yayınlanan kampanya ilk olarak duraklatılmış olur.' : 'Drafts cannot be changed from Ads Manager. Complete the existing publish review first; published campaigns start paused.')
              : (isTr ? 'Bir kampanya seçildiğinde gerçek Google Ads durumu, performansı ve işlem geçmişi burada gösterilir.' : 'The live Google Ads state, performance, and activity history appear here after you select a campaign.')}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card id="google-ads-manager">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{isTr ? 'Ads Manager' : 'Ads Manager'}</CardTitle>
            <CardDescription>{isTr ? 'Google Ads hesabına doğrudan yansır; uygulama harcamayı faturalandırmaz.' : 'Changes go directly to Google Ads; this app does not bill ad spend.'}</CardDescription>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void refreshFromGoogle()} disabled={isLoading || pending || refreshing || cooldownSeconds > 0}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {cooldownSeconds > 0
              ? (isTr ? `Durumu yenile (${cooldownSeconds} sn)` : `Refresh state (${cooldownSeconds}s)`)
              : (isTr ? 'Durumu yenile' : 'Refresh state')}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {isLoading ? <div className="flex flex-col gap-3" aria-label={isTr ? 'Yükleniyor' : 'Loading'}><Skeleton className="h-20" /><Skeleton className="h-24" /></div> : null}
          {error ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{isTr ? 'Kampanya verisi alınamadı' : 'Campaign data unavailable'}</AlertTitle><AlertDescription>{errorMessage(error instanceof ManagementApiError ? error.code : undefined, isTr)}</AlertDescription></Alert> : null}
          {actionError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{actionError}</AlertDescription></Alert> : null}
          {statusMessage ? <Alert><Check aria-hidden="true" /><AlertDescription>{statusMessage}</AlertDescription></Alert> : null}
          {data && !management ? (
            <>
              <section className="flex flex-col gap-3 rounded-xl border border-border p-4" aria-label={isTr ? 'Kampanya durumu' : 'Campaign status'}>
                <Alert variant="destructive">
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>{isTr ? 'Kampanya durumu alınamadı' : 'Campaign state unavailable'}</AlertTitle>
                  <AlertDescription>{sectionErrors.campaign_state ?? (isTr ? 'Google bu bilgiyi vermedi.' : 'Google did not return this data.')} {isTr ? 'Bütçe, reklam metni ve anahtar kelime değişiklikleri durum okunana kadar kapalı.' : 'Budget, ad copy, and keyword changes stay disabled until the state can be read.'}</AlertDescription>
                </Alert>
                <p className="text-sm text-muted-foreground">{isTr ? 'Reklam incelemesi' : 'Ad review'}: <span className="font-medium text-foreground">{data.partial?.reviewStatus === 'approved' ? (isTr ? 'Onaylandı' : 'Approved') : data.partial?.reviewStatus === 'disapproved' ? (isTr ? 'Reddedildi' : 'Disapproved') : data.partial?.reviewStatus === 'review_in_progress' ? (isTr ? 'İncelemede' : 'In review') : (isTr ? 'Doğrulanamadı' : 'Unavailable')}</span></p>
                {sectionErrors.policy ? <p className="text-sm text-destructive" role="status">{sectionErrors.policy}</p> : null}
              </section>
              {performance ? (
                <section className="flex flex-col gap-3" aria-labelledby="ads-manager-performance-partial-title">
                  <h3 id="ads-manager-performance-partial-title" className="font-semibold">{isTr ? 'Son 7 gün · Google Ads verisi' : 'Last 7 days · Google Ads data'}</h3>
                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 sm:grid-cols-5">
                    {[
                      [isTr ? 'Gösterim' : 'Impressions', formatCount(performance.impressions, isTr)],
                      [isTr ? 'Tıklama' : 'Clicks', formatCount(performance.clicks, isTr)],
                      ['CTR', `${(performance.ctr * 100).toFixed(2)}%`],
                      [isTr ? 'Dönüşüm' : 'Conversions', formatCount(performance.conversions, isTr)],
                      [isTr ? 'Harcama' : 'Spend', formatMicros(performance.costMicros, currency, isTr)],
                    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
                  </dl>
                </section>
              ) : <p className="text-sm text-muted-foreground">{sectionErrors.performance ?? (isTr ? 'Son 7 günlük performans verisi henüz alınamıyor.' : 'Seven-day performance data is unavailable.')}</p>}
            </>
          ) : null}
          {management ? (
            <>
              <section className="flex flex-col gap-3 rounded-xl border border-border p-4" aria-label={isTr ? 'Kampanya durumu' : 'Campaign status'}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={currentStatus === 'ENABLED' ? 'default' : 'secondary'}>{statusLabel(currentStatus ?? 'UNKNOWN', isTr)}</Badge>
                    <span className="text-sm text-muted-foreground">{isTr ? 'Google Ads canlı durumu' : 'Live Google Ads status'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentStatus === 'ENABLED' ? (
                      <Button type="button" variant="outline" onClick={() => openConfirmation({ action: 'pause', title: isTr ? 'Kampanyayı duraklat?' : 'Pause this campaign?', description: isTr ? 'Reklam gösterimi durur. Kampanya Google Ads’te istediğiniz zaman yeniden etkinleştirilebilir.' : 'Ad delivery stops. You can re-enable the campaign from Google Ads at any time.', before: statusLabel('ENABLED', isTr), after: statusLabel('PAUSED', isTr) })} disabled={pending}>
                        <Pause data-icon="inline-start" aria-hidden="true" />{isTr ? 'Duraklat' : 'Pause'}
                      </Button>
                    ) : null}
                    {currentStatus === 'PAUSED' ? (
                      <Button type="button" onClick={() => openConfirmation({ action: 'enable', budgetAmountMinor: currentBudgetMinor, assessRisk: true, title: isTr ? 'Kampanyayı etkinleştir?' : 'Enable this campaign?', description: isTr ? 'Bu işlem Google Ads’te reklam gösterimini başlatır ve doğrudan hesabına harcama yansıtabilir.' : 'This starts ad delivery in Google Ads and can create spend billed directly to the account.', before: statusLabel('PAUSED', isTr), after: statusLabel('ENABLED', isTr) })} disabled={pending || management.reviewStatus !== 'approved'}>
                        <Play data-icon="inline-start" aria-hidden="true" />{isTr ? 'Etkinleştir' : 'Enable'}
                      </Button>
                    ) : null}
                    {currentStatus === 'REMOVED' ? <Badge variant="outline">{isTr ? 'Arşivlenmiş · işlem yapılamaz' : 'Archived · no further changes'}</Badge> : null}
                  </div>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <p className="text-muted-foreground">{isTr ? 'Reklam incelemesi' : 'Ad review'}: <span className="font-medium text-foreground">{management.reviewStatus === 'approved' ? (isTr ? 'Onaylandı' : 'Approved') : management.reviewStatus === 'disapproved' ? (isTr ? 'Reddedildi' : 'Disapproved') : management.reviewStatus === 'review_in_progress' ? (isTr ? 'İncelemede' : 'In review') : (isTr ? 'Doğrulanamadı' : 'Unavailable')}</span></p>
                  <p className="text-muted-foreground">{isTr ? 'Faturalama' : 'Billing'}: <span className="font-medium text-foreground">{management.billingVerified ? (isTr ? 'Doğrulandı' : 'Verified') : (isTr ? 'Dikkat gerekli' : 'Needs attention')}</span></p>
                  <p className="text-muted-foreground">{isTr ? 'Günlük bütçe' : 'Daily budget'}: <span className="font-medium text-foreground">{formatMicros(management.dailyBudgetMicros, currency, isTr)}</span></p>
                </div>
                {sectionErrors.policy ? <p className="text-sm text-destructive" role="status">{isTr ? 'Reklam incelemesi alınamadı: ' : 'Ad review unavailable: '}{sectionErrors.policy}</p> : null}
                {management.campaignStatus === 'PAUSED' && management.reviewStatus !== 'approved' ? <p className="text-sm text-muted-foreground">{isTr ? 'Etkinleştirmeden önce Google reklam incelemesi tamamlanmalıdır.' : 'Google ad review must be approved before enabling.'}</p> : null}
                {management.campaignStatus === 'PAUSED' && management.paymentMethodWarning ? <Alert><AlertCircle aria-hidden="true" /><AlertDescription>{isTr ? 'Google Ads faturalama yöntemi doğrulanamadı; etkinleştirme onayında bunu ayrıca kabul etmeniz gerekir.' : 'Google Ads could not verify the billing method; acknowledge this in the enable confirmation.'}</AlertDescription></Alert> : null}

              </section>

              {activeCampaign && performance ? (
                <section className="flex flex-col gap-3" aria-labelledby="ads-manager-performance-title">
                  <div><h3 id="ads-manager-performance-title" className="font-semibold">{isTr ? 'Son 7 gün · Google Ads verisi' : 'Last 7 days · Google Ads data'}</h3><p className="text-xs text-muted-foreground">{isTr ? 'Öneriler yalnızca bu gerçek ölçümlere dayanır; otomatik değişiklik yapılmaz.' : 'Suggestions use these live metrics only; no changes are made automatically.'}</p></div>
                  <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border p-4 sm:grid-cols-5">
                    {[
                      [isTr ? 'Gösterim' : 'Impressions', formatCount(performance.impressions, isTr)],
                      [isTr ? 'Tıklama' : 'Clicks', formatCount(performance.clicks, isTr)],
                      ['CTR', `${(performance.ctr * 100).toFixed(2)}%`],
                      [isTr ? 'Dönüşüm' : 'Conversions', formatCount(performance.conversions, isTr)],
                      [isTr ? 'Harcama' : 'Spend', formatMicros(performance.costMicros, currency, isTr)],
                    ].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}
                  </dl>
                  {recommendations.length ? <div className="flex flex-col gap-2">
                    <h4 className="text-sm font-semibold">{isTr ? 'Veriye dayalı inceleme önerileri' : 'Data-based review prompts'}</h4>
                    {recommendations.map((item) => <Alert key={item.key}><AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span>{item.text}</span><Button type="button" size="sm" variant="outline" onClick={() => goTo(item.target === 'copy' ? 'google-ads-manager-copy' : 'google-ads-manager-keywords')}>{item.target === 'copy' ? (isTr ? 'Reklam metnini incele' : 'Review ad copy') : (isTr ? 'Anahtar kelimeleri incele' : 'Review keywords')}</Button></AlertDescription></Alert>)}
                  </div> : null}
                </section>
              ) : activeCampaign ? <p className="text-sm text-muted-foreground">{sectionErrors.performance ? `${sectionErrors.performance} ` : ''}{isTr ? 'Son 7 günlük performans verisi henüz alınamıyor; veri olmadan öneri gösterilmiyor.' : 'Seven-day performance data is unavailable; no recommendations are shown without data.'}</p> : null}

              {activeCampaign ? (
                <div className="grid gap-5 xl:grid-cols-2">
                  <section id="google-ads-manager-budget" className="flex flex-col gap-3 rounded-xl border border-border p-4" aria-labelledby="ads-manager-budget-title">
                    <div><h3 id="ads-manager-budget-title" className="font-semibold">{isTr ? 'Günlük bütçe' : 'Daily budget'}</h3><p className="text-sm leading-relaxed text-muted-foreground">{isTr ? 'Uygulama tarafında bütçe veya kampanya sayısı tavanı yoktur. Belirgin artışlarda tutarı yeniden yazıp onaylamanız istenir.' : 'There is no app-side budget or campaign-count ceiling. Significant increases require re-entering and confirming the exact amount.'}</p></div>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="google-ads-manager-budget-input">{isTr ? `Yeni günlük bütçe (${currency})` : `New daily budget (${currency})`}</FieldLabel>
                        <Input id="google-ads-manager-budget-input" type="number" min={1 / 10 ** currencyDigits(currency)} step={1 / 10 ** currencyDigits(currency)} value={inputBudget} onChange={(event) => setBudgetValue(event.target.value)} disabled={pending} />
                      </Field>
                      <p className="text-xs text-muted-foreground">{isTr ? `Önce: ${formatMicros(management.dailyBudgetMicros, currency, true)} · Sonra: ${targetMinor ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(targetMinor / 10 ** currencyDigits(currency)) : '—'}` : `Before: ${formatMicros(management.dailyBudgetMicros, currency, false)} · After: ${targetMinor ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(targetMinor / 10 ** currencyDigits(currency)) : '—'}`}</p>
                      <p className="text-xs text-muted-foreground">{isTr ? `${recommendationLabel}: ${management.recommendedDailyBudgetMinor === null ? '—' : formatMinorAmount(management.recommendedDailyBudgetMinor, currency, true)} · Son 30 gün ortalama günlük harcama: ${management.averageDailySpend30dMinor === null ? '—' : formatMinorAmount(Math.round(management.averageDailySpend30dMinor), currency, true)}` : `${recommendationLabel}: ${management.recommendedDailyBudgetMinor === null ? '—' : formatMinorAmount(management.recommendedDailyBudgetMinor, currency, false)} · 30-day average daily spend: ${management.averageDailySpend30dMinor === null ? '—' : formatMinorAmount(Math.round(management.averageDailySpend30dMinor), currency, false)}`}</p>
                      <Button type="button" variant="outline" onClick={() => {
                        if (!targetMinor) { setActionError(errorMessage('invalid_budget', isTr)); return }
                        const amount = new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(targetMinor / 10 ** currencyDigits(currency))
                        openConfirmation({ action: 'budget', payload: { dailyBudgetMinor: targetMinor }, title: isTr ? 'Günlük bütçeyi değiştir?' : 'Change daily budget?', description: isTr ? 'Bu tutar Google Ads hesabına doğrudan uygulanır.' : 'This amount is applied directly to the Google Ads account.', before: formatMicros(management.dailyBudgetMicros, currency, isTr), after: amount, budgetAmountMinor: targetMinor, assessRisk: true, previousDailyBudgetMinor: currentBudgetMinor, previousPublishedBudgetMinor: management.recommendedDailyBudgetMinor })
                      }} disabled={pending || !targetMinor}>{isTr ? 'Bütçeyi incele' : 'Review budget change'}</Button>
                    </FieldGroup>
                  </section>

                  <AdsDisclosure id="google-ads-manager-copy" title={isTr ? 'Reklam metni' : 'Ad copy'} summary={isTr ? 'Değişiklik yayına gitmeden önce eski ve yeni metni karşılaştırıp onaylamanız gerekir.' : 'Review the old and new copy and confirm before the update is sent live.'}>
                    <FieldGroup>
                      <Field><FieldLabel htmlFor="google-ads-manager-headlines">{isTr ? 'Başlıklar (satır başına bir tane)' : 'Headlines (one per line)'}</FieldLabel><Textarea id="google-ads-manager-headlines" rows={4} value={headlinesValue || management.headlines.join('\n')} onChange={(event) => setHeadlinesValue(event.target.value)} disabled={pending} /></Field>
                      <Field><FieldLabel htmlFor="google-ads-manager-descriptions">{isTr ? 'Açıklamalar (satır başına bir tane)' : 'Descriptions (one per line)'}</FieldLabel><Textarea id="google-ads-manager-descriptions" rows={4} value={descriptionsValue || management.descriptions.join('\n')} onChange={(event) => setDescriptionsValue(event.target.value)} disabled={pending} /></Field>
                      <Button type="button" variant="outline" onClick={() => {
                        const headlines = (headlinesValue || management.headlines.join('\n')).split('\n').map((value) => value.trim()).filter(Boolean)
                        const descriptions = (descriptionsValue || management.descriptions.join('\n')).split('\n').map((value) => value.trim()).filter(Boolean)
                        openConfirmation({ action: 'ad_copy', payload: { headlines, descriptions }, title: isTr ? 'Reklam metnini değiştir?' : 'Update ad copy?', description: isTr ? 'Yeni metin Google Ads’e gönderilecek. Onaylanana kadar mevcut reklam yayında kalır.' : 'The new copy will be sent to Google Ads. The current ad remains until the update is confirmed.', before: `${management.headlines.join(' · ')} / ${management.descriptions.join(' · ')}`, after: `${headlines.join(' · ')} / ${descriptions.join(' · ')}` })
                      }} disabled={pending}>{isTr ? 'Metni incele' : 'Review copy'}</Button>
                    </FieldGroup>
                  </AdsDisclosure>

                  <AdsDisclosure id="google-ads-manager-keywords" className="xl:col-span-2" title={isTr ? 'Anahtar kelimeler ve negatifler' : 'Keywords and negatives'} summary={isTr ? `${management.keywords.length} kelime · ekleme ve kaldırma ayrı ayrı onaylanır.` : `${management.keywords.length} keywords · additions and removals are confirmed separately.`}>
                    {management.keywords.length ? <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
                      {management.keywords.map((keyword) => <li key={keyword.resourceName} className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{keyword.text}</span><Badge variant="outline">{keyword.negative ? (isTr ? 'Negatif' : 'Negative') : (isTr ? 'Pozitif' : 'Positive')}</Badge><span className="text-xs text-muted-foreground">{keyword.matchType}</span></div><Button type="button" size="sm" variant="outline" onClick={() => openConfirmation({ action: 'keyword', payload: { keywordOperation: 'remove', keywordResourceName: keyword.resourceName }, title: isTr ? 'Anahtar kelimeyi kaldır?' : 'Remove this keyword?', description: isTr ? 'Bu değişiklik Google Ads reklam grubuna yansır.' : 'This change will be applied to the Google Ads ad group.', before: keyword.text, after: isTr ? 'Kaldırıldı' : 'Removed' })} disabled={pending}><Trash2 data-icon="inline-start" aria-hidden="true" />{isTr ? 'Kaldır' : 'Remove'}</Button></li>)}
                    </ul> : <p className="text-sm text-muted-foreground">{isTr ? 'Bu reklam grubunda etkin anahtar kelime bulunamadı.' : 'No active keywords were found in this ad group.'}</p>}
                    <FieldGroup className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                      <Field><FieldLabel htmlFor="google-ads-manager-keyword">{isTr ? 'Anahtar kelime' : 'Keyword'}</FieldLabel><Input id="google-ads-manager-keyword" value={keywordValue} onChange={(event) => setKeywordValue(event.target.value)} maxLength={80} disabled={pending} /></Field>
                      <Field><FieldLabel htmlFor="google-ads-manager-match">{isTr ? 'Eşleme' : 'Match type'}</FieldLabel><select id="google-ads-manager-match" value={keywordMatch} onChange={(event) => setKeywordMatch(event.target.value as 'PHRASE' | 'EXACT')} className="h-9 rounded-md border border-input bg-background px-3 text-sm" disabled={pending}><option value="PHRASE">{isTr ? 'Sıralı' : 'Phrase'}</option><option value="EXACT">{isTr ? 'Tam' : 'Exact'}</option></select></Field>
                      <Field orientation="horizontal" className="md:pb-2"><Checkbox id="google-ads-manager-negative" checked={keywordNegative} onCheckedChange={(checked) => setKeywordNegative(checked === true)} disabled={pending} /><FieldLabel htmlFor="google-ads-manager-negative">{isTr ? 'Negatif kelime' : 'Negative keyword'}</FieldLabel></Field>
                    </FieldGroup>
                    <Button type="button" variant="outline" className="self-start" disabled={pending || !keywordValue.trim()} onClick={() => openConfirmation({ action: 'keyword', payload: { keywordOperation: 'add', keywordText: keywordValue.trim().replace(/\s+/g, ' '), keywordMatchType: keywordMatch, keywordNegative }, title: isTr ? (keywordNegative ? 'Negatif kelime ekle?' : 'Anahtar kelime ekle?') : (keywordNegative ? 'Add negative keyword?' : 'Add keyword?'), description: isTr ? 'Yeni eşleme Google Ads’e eklenecek.' : 'The new match will be added to Google Ads.', before: isTr ? 'Değişiklik yok' : 'No change', after: `${keywordNegative ? (isTr ? 'Negatif' : 'Negative') : (isTr ? 'Pozitif' : 'Positive')} · ${keywordValue.trim()} · ${keywordMatch}` })}>{isTr ? 'Anahtar kelimeyi incele' : 'Review keyword'}</Button>
                  </AdsDisclosure>

                  <AdsDisclosure id="google-ads-manager-archive" className="xl:col-span-2" title={isTr ? 'Tehlikeli işlemler' : 'Danger zone'} summary={isTr ? 'Kampanyayı kalıcı olarak arşivleme.' : 'Permanently archive the campaign.'}>
                    <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-semibold">{isTr ? 'Kampanyayı arşivle' : 'Archive campaign'}</h4><p className="text-sm leading-relaxed text-muted-foreground">{isTr ? 'Google Ads’te kalıcı olarak kaldırır. Geri alınamaz; önce kampanyayı duraklatın.' : 'Permanently removes it from Google Ads. This cannot be undone; pause the campaign first.'}</p></div><Button type="button" variant="destructive" onClick={() => openConfirmation({ action: 'archive', title: isTr ? 'Kampanyayı kalıcı olarak kaldır?' : 'Permanently remove campaign?', description: isTr ? 'Google Ads REMOVE çağrısı kalıcıdır; uygulamadan geri yüklenemez.' : 'The Google Ads REMOVE operation is permanent and cannot be restored from this app.', before: statusLabel(currentStatus ?? 'UNKNOWN', isTr), after: isTr ? 'Kalıcı kaldırıldı' : 'Permanently removed', irreversible: true })} disabled={pending || currentStatus !== 'PAUSED'}><Archive data-icon="inline-start" aria-hidden="true" />{isTr ? 'Kalıcı arşivle' : 'Archive permanently'}</Button></div>
                  </AdsDisclosure>
                </div>
              ) : null}

              <AdsDisclosure id="google-ads-manager-activity" title={isTr ? 'İşlem geçmişi' : 'Activity log'} summary={isTr ? `${activity.length} kayıt · kullanıcı, onay, önce/sonra ve geri alınabilirlik bilgileri.` : `${activity.length} entries · actor, approval, before/after, and reversibility.`}>
                <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => void mutate()} disabled={isLoading || pending}><RefreshCw data-icon="inline-start" aria-hidden="true" />{isTr ? 'Geçmişi yenile' : 'Refresh log'}</Button></div>
                {activity.length ? <ol className="flex flex-col gap-2">
                  {activity.map((action) => {
                    const wasUndone = actionWasUndone(action, activity)
                    return <li key={action.id} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 flex-col gap-1"><p className="font-medium">{actionLabel(action, isTr)}</p><p className="text-sm text-muted-foreground">{actionSummary(action, currency, isTr)}</p><p className="text-xs text-muted-foreground"><time dateTime={action.created_at}>{new Intl.DateTimeFormat(isTr ? 'tr-TR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(action.created_at))}</time> · {actionStatus(action, isTr, wasUndone)}</p>{action.failure_reason && action.failure_reason !== 'state_unverified' ? <p className="text-xs text-muted-foreground">{isTr ? 'Ayrıntı' : 'Detail'}: {action.failure_reason}</p> : null}</div>
                      {action.status === 'applied' && action.reversible && action.after_state && !wasUndone ? <Button type="button" size="sm" variant="outline" onClick={() => {
                        const undoBudgetMinor = action.action_type === 'google_ads_budget_update' && action.before_state
                          ? minorFromMajor(majorFromMicros(action.before_state.dailyBudgetMicros, currency), currency)
                          : null
                        const undoEnables = action.action_type === 'google_ads_campaign_status_update' && action.before_state?.campaignStatus === 'ENABLED'
                        openConfirmation({ action: 'undo', budgetAmountMinor: undoBudgetMinor ?? currentBudgetMinor, assessRisk: undoBudgetMinor !== null || undoEnables, previousDailyBudgetMinor: currentBudgetMinor, payload: { undoActionId: action.id }, title: isTr ? 'Bu işlemi geri al?' : 'Undo this action?', description: isTr ? 'Önceki değer Google Ads’ten yeniden okunacak ve yalnızca hâlâ aynıysa geri yüklenecek.' : 'The prior value will be restored only if Google Ads still matches this action’s after-state.', before: actionSummary(action, currency, isTr) || actionLabel(action, isTr), after: isTr ? 'Önceki değer' : 'Previous value' })
                      }} disabled={pending}><RotateCcw data-icon="inline-start" aria-hidden="true" />{isTr ? 'Geri al' : 'Undo'}</Button> : null}
                    </li>
                  })}
                </ol> : <p className="text-sm text-muted-foreground">{isTr ? 'Henüz yönetim işlemi yok.' : 'No management actions yet.'}</p>}
              </AdsDisclosure>
            </>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog.Root open={Boolean(confirmation)} onOpenChange={(open) => { if (!open && !pending) setConfirmation(null) }}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 bg-foreground/40" />
          <AlertDialog.Popup className="fixed left-1/2 top-1/2 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-background p-5 text-foreground shadow-xl">
            {confirmation ? <>
              <div className="flex flex-col gap-1"><AlertDialog.Title className="text-lg font-semibold">{confirmation.title}</AlertDialog.Title><AlertDialog.Description className="text-sm leading-relaxed text-muted-foreground">{confirmation.description}</AlertDialog.Description></div>
              {confirmation.budgetAmountMinor !== undefined && confirmation.budgetAmountMinor !== null ? <section className="rounded-xl border border-border bg-muted/40 p-4" aria-label={isTr ? 'Bütçe özeti' : 'Budget summary'}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{isTr ? 'Günlük bütçe' : 'Daily budget'}</p><p className="mt-1 text-3xl font-semibold tabular-nums text-balance">{formatMinorAmount(confirmation.budgetAmountMinor, currency, isTr)}</p><p className="mt-2 text-sm text-muted-foreground">{isTr ? '30,4 günlük tahmini üst sınır' : 'Estimated 30.4-day upper bound'}: <span className="font-medium text-foreground">{formatMinorAmount(googleAdsMonthlyBudgetUpperBoundMinor(confirmation.budgetAmountMinor), currency, isTr)}</span></p></section> : null}
              {confirmation.before !== undefined || confirmation.after !== undefined ? <dl className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3 text-sm"><div><dt className="text-xs text-muted-foreground">{isTr ? 'Önce' : 'Before'}</dt><dd className="mt-1 break-words font-medium">{confirmation.before}</dd></div><div><dt className="text-xs text-muted-foreground">{isTr ? 'Sonra' : 'After'}</dt><dd className="mt-1 break-words font-medium">{confirmation.after}</dd></div></dl> : null}
              {confirmation.risk?.risky ? <Alert className="border-warning/50 bg-warning/10"><AlertCircle aria-hidden="true" /><AlertTitle>{isTr ? 'Yüksek harcama riski' : 'High spend risk'}</AlertTitle><AlertDescription><ul className="list-disc ps-5">{confirmation.risk.reasons.map((reason) => <li key={reason}>{riskReasonText(reason, isTr)}</li>)}</ul></AlertDescription></Alert> : null}
              {confirmation.risk?.risky ? <FieldSet><FieldGroup>
                <Field data-invalid={riskAmountText.length > 0 && !confirmationRiskMatches}>
                  <FieldLabel htmlFor="google-ads-risk-amount">{isTr ? 'Tutarı aynen tekrar yazın' : 'Re-enter the exact amount'}</FieldLabel>
                  <Input id="google-ads-risk-amount" type="text" inputMode="decimal" autoComplete="off" value={riskAmountText} onChange={(event) => setRiskAmountText(event.target.value)} placeholder={confirmation.budgetAmountMinor === null || confirmation.budgetAmountMinor === undefined ? '' : formatMinorAmount(confirmation.budgetAmountMinor, currency, isTr)} aria-invalid={riskAmountText.length > 0 && !confirmationRiskMatches} aria-describedby="google-ads-risk-amount-help" />
                  <p id="google-ads-risk-amount-help" className="text-xs text-muted-foreground">{isTr ? 'Para birimi biçimini koruyun; tutar işlemle eşleşmelidir.' : 'Use the displayed currency format; the amount must match the action.'}</p>
                  {riskAmountText.length > 0 && !confirmationRiskMatches ? <p className="text-sm text-destructive">{isTr ? 'Tutar eşleşmiyor.' : 'The amount does not match.'}</p> : null}
                </Field>
                <Field orientation="horizontal"><Checkbox id="google-ads-risk-ack" checked={riskAck} onCheckedChange={(checked) => setRiskAck(checked === true)} /><FieldLabel htmlFor="google-ads-risk-ack">{isTr ? 'Tutarı doğruladım ve bu harcama riskini anlıyorum.' : 'I verified the amount and understand the spend risk.'}</FieldLabel></Field>
              </FieldGroup></FieldSet> : null}
              {confirmation.irreversible ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{isTr ? 'Bu işlem kalıcıdır ve geri alınamaz.' : 'This action is permanent and cannot be undone.'}</AlertDescription></Alert> : null}
              <FieldSet><FieldGroup>
                {confirmation.action === 'enable' ? <>
                  <Field orientation="horizontal"><Checkbox id="google-ads-enable-budget-ack" checked={budgetAck} onCheckedChange={(checked) => setBudgetAck(checked === true)} disabled={pending} /><FieldLabel htmlFor="google-ads-enable-budget-ack">{isTr ? 'Günlük bütçeyi ve Google Ads harcamasını anlıyorum.' : 'I understand the daily budget and Google Ads spend.'}</FieldLabel></Field>
                  {management?.paymentMethodWarning ? <Field orientation="horizontal"><Checkbox id="google-ads-enable-billing-ack" checked={billingAck} onCheckedChange={(checked) => setBillingAck(checked === true)} disabled={pending} /><FieldLabel htmlFor="google-ads-enable-billing-ack">{isTr ? 'Faturalama uyarısını kabul ediyorum.' : 'I acknowledge the billing warning.'}</FieldLabel></Field> : null}
                </> : null}
                <Field orientation="horizontal"><Checkbox id="google-ads-action-ack" checked={actionAck} onCheckedChange={(checked) => setActionAck(checked === true)} disabled={pending} /><FieldLabel htmlFor="google-ads-action-ack">{confirmation.irreversible
                  ? (isTr ? 'Kampanyanın kalıcı olarak kaldırılmasını onaylıyorum.' : 'I confirm permanent campaign removal.')
                  : (isTr ? 'Bu değişikliğin Google Ads’e uygulanmasını onaylıyorum.' : 'I confirm this change will be applied to Google Ads.')}</FieldLabel></Field>
              </FieldGroup></FieldSet>
              <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={() => setConfirmation(null)} disabled={pending}>{isTr ? 'Vazgeç' : 'Cancel'}</Button><Button type="button" variant={confirmation.irreversible ? 'destructive' : 'default'} onClick={confirmAction} disabled={pending || !actionAck || (confirmationRiskRequired && (!confirmationRiskMatches || !riskAck)) || (confirmation.action === 'enable' && (!budgetAck || (management?.paymentMethodWarning && !billingAck)))}>{pending ? (isTr ? 'Uygulanıyor…' : 'Applying…') : confirmation.irreversible ? (isTr ? 'Kalıcı kaldır' : 'Remove permanently') : (isTr ? 'Onayla ve uygula' : 'Confirm and apply')}</Button></div>
            </> : null}
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
      <div className="sr-only" aria-live="polite">{statusMessage || actionError}</div>
    </>
  )
}
