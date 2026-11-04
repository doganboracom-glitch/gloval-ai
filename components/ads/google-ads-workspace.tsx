'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, Check, RefreshCw, Save, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { GoogleAdsConnectionView } from '@/components/ads/google-ads-dashboard'
import { PLAN_COUNTRIES, PLAN_SECTORS } from '@/lib/ads/planner'
import { cn } from '@/lib/utils'
import { buildGoogleAdsApprovalSummary, type GoogleAdsApprovalSummary } from '@/lib/ads/google-ads-publish-plan'

type PlanRow = {
  id: string
  connection_id: string | null
  status: string
  plan: Record<string, unknown>
  version: number
  approved_version: number | null
  approval_id: string | null
  approval_hash: string | null
  validation_hash: string | null
  validated_version: number | null
  eu_political_advertising: 'yes' | 'no' | null
  currency: string
  daily_budget_minor: number | null
  budget_cap_minor: number | null
  google_daily_budget_minor: number | null
  external_campaign_id: string | null
  publish_billing_verified: boolean | null
  google_campaign_status: 'PAUSED' | 'ENABLED'
  publish_credit_charged: boolean
  approval_summary: GoogleAdsApprovalSummary | null
}

type PlansPayload = { plans: PlanRow[] }
type ManagementSnapshot = {
  campaignId: string
  campaignStatus: 'PAUSED' | 'ENABLED' | 'UNKNOWN'
  dailyBudgetMicros: string
  headlines: string[]
  descriptions: string[]
  stateHash: string
  reviewStatus: 'approved' | 'disapproved' | 'review_in_progress' | 'unavailable'
  billingVerified: boolean
  paymentMethodWarning: boolean
}
type ManagementPayload = { snapshot: ManagementSnapshot }
type ApiPayload = {
  ok?: boolean
  error?: string
  planId?: string
  version?: number
  approvalId?: string
  approvalHash?: string
  approvalSummary?: GoogleAdsApprovalSummary
  state?: string
  externalCampaignId?: string | null
  campaignStatus?: string
  billingVerified?: boolean | null
  paymentMethodWarning?: boolean
  creditsCharged?: number | null
  balance?: number | null
  before?: unknown
  target?: unknown
  after?: unknown
}

type PlanForm = {
  brand: string
  sector: string
  sectorLabel: string
  services: string
  language: 'tr' | 'en'
  keywords: string
  negativeKeywords: string
  country: string
  cities: string
  finalUrl: string
  modelPolicyCategory: string
  modelPolicyEvidence: 'none' | 'ambiguous'
  headlines: string
  descriptions: string
  displayUrl: string
}

class WorkspaceApiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as ApiPayload).error === 'string'
      ? String((payload as ApiPayload).error)
      : 'provider_error'
    throw new WorkspaceApiError(code)
  }
  return payload as T
}

async function postJson(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<ApiPayload> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as ApiPayload).error === 'string'
      ? String((payload as ApiPayload).error)
      : 'provider_error'
    throw new WorkspaceApiError(code)
  }
  return payload as ApiPayload
}

function splitLines(value: string): string[] {
  return value.split('\n').map((item) => item.trim()).filter(Boolean)
}

function currencyDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

function majorToMinor(value: string, currency: string): number | null {
  const amount = Number(value.replace(',', '.'))
  if (!Number.isFinite(amount) || amount <= 0) return null
  const minor = Math.round(amount * 10 ** currencyDigits(currency))
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null
}

function minorToMajor(value: number | null | undefined, currency: string): string {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) return ''
  return ((value as number) / 10 ** currencyDigits(currency)).toFixed(currencyDigits(currency))
}

function microsToMajor(value: string | undefined, currency: string): string {
  const micros = Number(value)
  if (!Number.isFinite(micros) || micros <= 0) return ''
  return (micros / 1_000_000).toFixed(currencyDigits(currency))
}

function defaultPlanForm(initialAddress: string | null): PlanForm {
  const url = initialAddress
    ? initialAddress.startsWith('http') ? initialAddress : `https://${initialAddress}`
    : ''
  return {
    brand: '',
    sector: 'services',
    sectorLabel: 'Services',
    services: '',
    language: 'tr',
    keywords: '',
    negativeKeywords: '',
    country: 'TR',
    cities: '',
    finalUrl: url,
    modelPolicyCategory: 'none',
    modelPolicyEvidence: 'none',
    headlines: '',
    descriptions: '',
    displayUrl: url,
  }
}

function formFromPlan(plan: Record<string, unknown>): PlanForm {
  const adCopy = (plan.adCopy && typeof plan.adCopy === 'object' ? plan.adCopy : {}) as Record<string, unknown>
  const asLines = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').join('\n') : ''
  return {
    brand: typeof plan.brand === 'string' ? plan.brand : '',
    sector: typeof plan.sector === 'string' ? plan.sector : 'services',
    sectorLabel: typeof plan.sectorLabel === 'string' ? plan.sectorLabel : '',
    services: asLines(plan.services),
    language: plan.language === 'en' ? 'en' : 'tr',
    keywords: asLines(plan.keywords),
    negativeKeywords: asLines(plan.negativeKeywords),
    country: typeof plan.country === 'string' ? plan.country : 'TR',
    cities: asLines(plan.cities),
    finalUrl: typeof plan.finalUrl === 'string' ? plan.finalUrl : '',
    modelPolicyCategory: typeof plan.modelPolicyCategory === 'string' ? plan.modelPolicyCategory : 'none',
    modelPolicyEvidence: plan.modelPolicyEvidence === 'ambiguous' ? 'ambiguous' : 'none',
    headlines: asLines(adCopy.headlines),
    descriptions: asLines(adCopy.descriptions),
    displayUrl: typeof adCopy.displayUrl === 'string' ? adCopy.displayUrl : '',
  }
}

function planFromForm(form: PlanForm) {
  return {
    brand: form.brand.trim(),
    sector: form.sector,
    sectorLabel: form.sectorLabel.trim(),
    services: splitLines(form.services),
    language: form.language,
    keywords: splitLines(form.keywords),
    negativeKeywords: splitLines(form.negativeKeywords),
    country: form.country,
    cities: splitLines(form.cities),
    modelPolicyCategory: form.modelPolicyCategory || 'none',
    modelPolicyEvidence: form.modelPolicyEvidence,
    euPoliticalAdvertising: 'no',
    euPoliticalDeclarationConfirmed: false,
    finalUrl: form.finalUrl.trim(),
    adCopy: {
      headlines: splitLines(form.headlines),
      descriptions: splitLines(form.descriptions),
      displayUrl: form.displayUrl.trim(),
    },
  }
}

function statusText(status: string, isTr: boolean): string {
  const labels: Record<string, [string, string]> = {
    draft: ['Taslak', 'Draft'],
    approved: ['Onaylandı', 'Approved'],
    publishing: ['Yayınlanıyor', 'Publishing'],
    reconciling: ['Kontrol gerekiyor', 'Needs review'],
    published: ['Yayınlandı · Duraklatıldı', 'Published · Paused'],
    failed: ['Başarısız', 'Failed'],
  }
  const pair = labels[status] ?? [status, status]
  return pair[isTr ? 0 : 1]
}

function errorText(code: string | undefined, isTr: boolean): string {
  const tr: Record<string, string> = {
    invalid_request: 'Bilgileri kontrol edip tekrar deneyin.',
    invalid_publish_plan: 'Plan, başlıklar veya açıklamalar Google Ads koşullarını karşılamıyor.',
    invalid_budget: 'Bütçe veya CPC sınırı geçersiz.',
    budget_limit_exceeded: 'Günlük toplam bütçe üst sınırı aşılıyor.',
    budget_limit_not_configured: 'Bu para birimi için günlük üst sınır yapılandırılmamış.',
    insufficient_credits: 'Yayınlama için yeterli kredi yok.',
    plan_changed: 'Plan veya kampanya durumu değişmiş. Yenileyip tekrar kontrol edin.',
    confirmation_required: 'Devam etmek için tüm onayları açıkça işaretleyin.',
    eu_political_declaration_required: 'AB siyasi reklam beyanı onayı gerekiyor.',
    ad_disapproved: 'Reklam Google tarafından reddedildi; etkinleştirilemez.',
    ad_review_in_progress: 'Reklam incelemesi tamamlanmadan etkinleştirilemez.',
    ad_review_status_unavailable: 'Reklam inceleme durumu doğrulanamadı.',
    reauth_required: 'Google Ads bağlantısı yeniden yetkilendirilmeli.',
    publish_in_progress: 'Bu kampanya için başka bir işlem devam ediyor.',
  }
  const en: Record<string, string> = {
    invalid_request: 'Check the details and try again.',
    invalid_publish_plan: 'The plan, headlines, or descriptions do not meet Google Ads requirements.',
    invalid_budget: 'The budget or CPC ceiling is invalid.',
    budget_limit_exceeded: 'The aggregate daily budget cap would be exceeded.',
    budget_limit_not_configured: 'A daily cap is not configured for this currency.',
    insufficient_credits: 'There are not enough credits to publish.',
    plan_changed: 'The plan or campaign state changed. Refresh and review again.',
    confirmation_required: 'Explicitly confirm each required item before continuing.',
    eu_political_declaration_required: 'The EU political advertising declaration must be confirmed.',
    ad_disapproved: 'Google disapproved the ad; it cannot be enabled.',
    ad_review_in_progress: 'The ad cannot be enabled until review is complete.',
    ad_review_status_unavailable: 'The ad review status could not be verified.',
    reauth_required: 'Reconnect Google Ads to continue.',
    publish_in_progress: 'Another action is already in progress for this campaign.',
  }
  const dict = isTr ? tr : en
  return (code && dict[code]) || (isTr ? 'İşlem tamamlanamadı. Lütfen tekrar deneyin.' : 'The action could not be completed. Try again.')
}

function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  description,
  disabled = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  description?: string
  disabled?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} disabled={disabled} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  placeholder,
  description,
  disabled = false,
  rows = 4,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  disabled?: boolean
  rows?: number
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}

export function GoogleAdsWorkspace({
  enabled,
  connections,
  initialAddress,
}: {
  enabled: boolean
  connections: GoogleAdsConnectionView[]
  initialAddress: string | null
}) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const copy = isTr
    ? {
        title: 'Google Ads kampanya çalışma alanı', subtitle: 'Taslağı hazırla, değişiklikleri incele ve Google Ads hesabında duraklatılmış olarak yayınla.',
        builder: 'Kampanya planı', plans: 'Planların', noPlans: 'Henüz plan yok. İlk planını oluşturarak başla.',
        selectAccount: 'Google Ads hesabı', selectPlan: 'Bir plan seç', newPlan: 'Yeni plan', saveDraft: 'Taslağı kaydet', saving: 'Kaydediliyor…',
        brand: 'Marka adı', sector: 'Sektör', sectorLabel: 'Sektör açıklaması', services: 'Ürün veya hizmetler (satır başına bir tane)',
        language: 'Reklam dili', country: 'Hedef ülke', cities: 'Hedef şehirler (satır başına bir tane)', url: 'Açılış sayfası URL’si',
        keywords: 'Anahtar kelimeler (satır başına bir tane)', negatives: 'Hariç tutulacak anahtar kelimeler', headlines: 'Başlıklar (satır başına bir tane)',
        descriptions: 'Açıklamalar (satır başına bir tane)', displayUrl: 'Görünen URL', daily: 'Günlük bütçe', cap: 'Kampanya bütçe üst sınırı',
        policyCategory: 'Kısıtlı içerik kategorisi', policyEvidence: 'Politika kanıtı', createHint: 'Planı kaydetmek Google Ads’te kampanya oluşturmaz.',
        reviewTitle: 'Onay ve yayınlama', noSelection: 'Yayınlamadan önce bir taslak plan seçin.',
        declaration: 'AB siyasi reklam beyanı', euNo: 'Hayır', euYes: 'Evet', confirmEu: 'Bu beyanın doğru olduğunu onaylıyorum.',
        acceptTerms: 'Google politikalarına uygunluktan ben sorumluyum ve sonuç garantisi olmadığını anlıyorum.', approve: 'Planı onayla', approved: 'Onay kaydedildi. Önce validate_only ile doğrulayın.',
        validate: 'Google’da doğrula (validate_only)', publish: 'Duraklatılmış kampanyayı yayınla', validating: 'Doğrulanıyor…', publishing: 'Yayınlanıyor…',
        summary: 'Plan özeti', dailyLabel: 'Günlük bütçe', cpc: 'CPC teklif tavanı', target: 'Hedefleme', terms: 'Arama terimleri', noTerms: 'Belirtilmedi',
        pausedNote: 'Kampanya Google Ads’te önce DURAKLATILMIŞ oluşturulur. Etkinleştirme ayrı ve açık bir kullanıcı işlemidir.',
        directBilling: 'Reklam bütçesi doğrudan Google Ads hesabınızdan tahsil edilir; GLOVAL bütçe tutmaz.', credits: 'Yayınlama başarılı olursa 15 GLOVAL kredisi düşer.',
        result: 'Yayın sonucu', campaignId: 'Kampanya kimliği', status: 'Google Ads durumu', review: 'Reklam incelemesi', billing: 'Faturalama kurulumu',
        billingWarning: 'Google Ads hesabında ödeme yöntemi doğrulanamadı. Kampanyayı etkinleştirmek için bu uyarıyı kabul edin.',
        noConnection: 'Yayınlama için etkin bir Google Ads hesabı bağlayın.', loading: 'Planlar yükleniyor…', refresh: 'Yenile',
        management: 'Kampanya yönetimi', pause: 'Kampanyayı duraklat', enable: 'Kampanyayı etkinleştir', budgetEdit: 'Günlük bütçeyi değiştir',
        copyEdit: 'Reklam metnini değiştir', apply: 'Değişikliği uygula', reviewAcknowledged: 'Bütçe ve olası performans değişikliğini anlıyorum.',
        before: 'Önce', after: 'Sonra', reviewRequired: 'Etkinleştirmeden önce Google incelemesi tamamlanmalı.',
        restricted: 'Kısıtlı sektör uyarısı: sağlık, finans, kumar ve benzeri kategoriler ek Google politikalarına tabi olabilir.',
        summaryGuarantee: 'Sonuç garantisi yoktur. Harcama ve kampanya performansını Google Ads hesabınızdan takip edin.',
        close: 'Temizle', edit: 'Planı düzenle', noActive: 'Bu hesapta yönetilebilir aktif kampanya yok.',
      }
    : {
        title: 'Google Ads campaign workspace', subtitle: 'Prepare a draft, review every change, and publish paused in your Google Ads account.',
        builder: 'Campaign plan', plans: 'Your plans', noPlans: 'No plans yet. Start by creating your first campaign plan.',
        selectAccount: 'Google Ads account', selectPlan: 'Select a plan', newPlan: 'New plan', saveDraft: 'Save draft', saving: 'Saving…',
        brand: 'Brand name', sector: 'Sector', sectorLabel: 'Sector label', services: 'Products or services (one per line)',
        language: 'Ad language', country: 'Target country', cities: 'Target cities (one per line)', url: 'Landing page URL',
        keywords: 'Keywords (one per line)', negatives: 'Negative keywords', headlines: 'Headlines (one per line)',
        descriptions: 'Descriptions (one per line)', displayUrl: 'Display URL', daily: 'Daily budget', cap: 'Campaign budget ceiling',
        policyCategory: 'Restricted content category', policyEvidence: 'Policy evidence', createHint: 'Saving a draft does not create a Google Ads campaign.',
        reviewTitle: 'Approval and publishing', noSelection: 'Select a draft plan before publishing.',
        declaration: 'EU political advertising declaration', euNo: 'No', euYes: 'Yes', confirmEu: 'I confirm this declaration is accurate.',
        acceptTerms: 'I am responsible for Google policy compliance and understand that results are not guaranteed.', approve: 'Approve plan', approved: 'Approval recorded. Validate with validate_only first.',
        validate: 'Validate with Google (validate_only)', publish: 'Publish paused campaign', validating: 'Validating…', publishing: 'Publishing…',
        summary: 'Plan summary', dailyLabel: 'Daily budget', cpc: 'CPC bid ceiling', target: 'Targeting', terms: 'Search terms', noTerms: 'Not specified',
        pausedNote: 'The campaign is created PAUSED in Google Ads first. Enabling it is a separate, explicit user action.',
        directBilling: 'Google Ads bills the ad budget directly; GLOVAL does not hold campaign funds.', credits: '15 GLOVAL credits are charged only after a successful publish.',
        result: 'Publish result', campaignId: 'Campaign ID', status: 'Google Ads status', review: 'Ad review', billing: 'Billing setup',
        billingWarning: 'A payment method could not be verified in Google Ads. Acknowledge this warning before enabling.',
        noConnection: 'Connect an active Google Ads account to publish.', loading: 'Loading plans…', refresh: 'Refresh',
        management: 'Campaign management', pause: 'Pause campaign', enable: 'Enable campaign', budgetEdit: 'Change daily budget',
        copyEdit: 'Edit ad copy', apply: 'Apply change', reviewAcknowledged: 'I understand the budget and possible performance impact.',
        before: 'Before', after: 'After', reviewRequired: 'Google review must be complete before enabling.',
        restricted: 'Restricted-industry notice: health, finance, gambling, and similar categories may have additional Google policy requirements.',
        summaryGuarantee: 'Results are not guaranteed. Monitor spend and performance in your Google Ads account.',
        close: 'Clear', edit: 'Edit plan', noActive: 'No manageable active campaign is available for this account.',
      }

  const availableConnections = connections.filter((connection) => connection.status === 'active' && !connection.isManager)
  const [connectionId, setConnectionId] = useState(() => availableConnections[0]?.id ?? '')
  const [planId, setPlanId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanForm>(() => defaultPlanForm(initialAddress))
  const [dailyBudget, setDailyBudget] = useState('1000')
  const [budgetCap, setBudgetCap] = useState('1000')
  const [euPoliticalAdvertising, setEuPoliticalAdvertising] = useState<'yes' | 'no'>('no')
  const [confirmedEu, setConfirmedEu] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [enableBudgetAcknowledged, setEnableBudgetAcknowledged] = useState(false)
  const [enableBillingAcknowledged, setEnableBillingAcknowledged] = useState(false)
  const [managementBudget, setManagementBudget] = useState('')
  const [managementHeadlines, setManagementHeadlines] = useState('')
  const [managementDescriptions, setManagementDescriptions] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const { data: plansData, error: plansError, isLoading: plansLoading, mutate: mutatePlans } = useSWR<PlansPayload>(
    enabled ? '/api/ads/google/plans' : null,
    fetchJson,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const plans = plansData?.plans ?? []
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null
  const selectedConnection = availableConnections.find((connection) => connection.id === connectionId) ?? null
  const activeCampaignPlan = selectedPlan?.status === 'published' ? selectedPlan : null
  const managementKey = activeCampaignPlan ? `/api/ads/google/management?planId=${encodeURIComponent(activeCampaignPlan.id)}` : null
  const { data: managementData, error: managementError, isLoading: managementLoading, mutate: mutateManagement } = useSWR<ManagementPayload>(
    managementKey,
    fetchJson,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const management = managementData?.snapshot
  const isEditable = !selectedPlan || ['draft', 'failed', 'approved'].includes(selectedPlan.status)
  const selectedCurrency = selectedPlan?.currency ?? selectedConnection?.currency ?? 'TRY'

  const summary = useMemo(() => {
    if (!selectedPlan) return null
    try {
      return buildGoogleAdsApprovalSummary({
        currency: selectedPlan.currency,
        dailyBudgetMinor: selectedPlan.daily_budget_minor as number,
        budgetCapMinor: selectedPlan.budget_cap_minor as number,
      })
    } catch {
      return null
    }
  }, [selectedPlan])

  if (!enabled) return null

  function updateForm<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function clearSelection() {
    setPlanId(null)
    setForm(defaultPlanForm(initialAddress))
    setDailyBudget('1000')
    setBudgetCap('1000')
    setEuPoliticalAdvertising('no')
    setConfirmedEu(false)
    setAcceptedTerms(false)
    setMessage(null)
    setErrorCode(null)
  }

  function selectPlan(plan: PlanRow) {
    setPlanId(plan.id)
    setConnectionId(plan.connection_id ?? '')
    setForm(formFromPlan(plan.plan))
    setDailyBudget(minorToMajor(plan.daily_budget_minor, plan.currency))
    setBudgetCap(minorToMajor(plan.budget_cap_minor, plan.currency))
    setEuPoliticalAdvertising(plan.eu_political_advertising ?? 'no')
    setConfirmedEu(false)
    setAcceptedTerms(false)
    setMessage(null)
    setErrorCode(null)
    setManagementBudget(minorToMajor(plan.google_daily_budget_minor ?? plan.daily_budget_minor, plan.currency))
    setManagementHeadlines('')
    setManagementDescriptions('')
  }

  async function saveDraft() {
    if (!selectedConnection || pending) return
    setPending('save')
    setErrorCode(null)
    setMessage(null)
    try {
      const dailyBudgetMinor = majorToMinor(dailyBudget, selectedConnection.currency ?? selectedCurrency)
      const budgetCapMinor = majorToMinor(budgetCap, selectedConnection.currency ?? selectedCurrency)
      if (!dailyBudgetMinor || !budgetCapMinor) throw new WorkspaceApiError('invalid_budget')
      const body = {
        connectionId: selectedConnection.id,
        plan: planFromForm(form),
        dailyBudgetMinor,
        budgetCapMinor,
        ...(selectedPlan ? { planId: selectedPlan.id, expectedVersion: selectedPlan.version } : {}),
      }
      const response = await postJson('/api/ads/google/plans', selectedPlan ? 'PATCH' : 'POST', body)
      if (response.planId) setPlanId(response.planId)
      await mutatePlans()
      setMessage(isTr ? 'Taslak kaydedildi. Google Ads’te henüz değişiklik yapılmadı.' : 'Draft saved. No Google Ads changes were made.')
    } catch (error) {
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
    } finally {
      setPending(null)
    }
  }

  async function approvePlan() {
    if (!selectedPlan || !confirmedEu || !acceptedTerms || pending) return
    setPending('approve')
    setErrorCode(null)
    setMessage(null)
    try {
      await postJson('/api/ads/google/approval', 'POST', {
        planId: selectedPlan.id,
        expectedVersion: selectedPlan.version,
        euPoliticalAdvertising,
        declarationConfirmed: true,
        termsAccepted: true,
      })
      await mutatePlans()
      setMessage(isTr ? 'Onay kaydedildi. Google Ads’te değişiklik yapılmadı; sıradaki adım validate_only doğrulamasıdır.' : 'Approval recorded. No Google Ads changes were made; run validate_only next.')
    } catch (error) {
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
    } finally {
      setPending(null)
    }
  }

  async function runPublish(phase: 'validate' | 'publish') {
    if (!selectedPlan?.approval_hash || pending) return
    setPending(phase)
    setErrorCode(null)
    setMessage(null)
    try {
      const response = await postJson('/api/ads/google/publish', 'POST', {
        planId: selectedPlan.id,
        expectedVersion: selectedPlan.version,
        approvalHash: selectedPlan.approval_hash,
        confirm: true,
        phase,
      })
      await mutatePlans()
      if (response.state === 'validated') {
        setMessage(isTr ? 'Google validate_only doğrulaması başarılı. Kampanya henüz oluşturulmadı.' : 'Google validate_only succeeded. The campaign has not been created.')
      } else if (response.state === 'published') {
        setMessage(isTr ? 'Kampanya duraklatılmış olarak oluşturuldu.' : 'The campaign was created in paused state.')
      } else if (response.state === 'reconciling') {
        setMessage(isTr ? 'Google sonucu belirsiz. Tekrar yayınlamayın; durum incelemeye alındı.' : 'Google’s result is uncertain. Do not retry publishing; the result is being reconciled.')
      }
    } catch (error) {
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
    } finally {
      setPending(null)
    }
  }

  async function applyAction(action: 'pause' | 'enable' | 'budget' | 'ad_copy') {
    if (!activeCampaignPlan || !management || pending) return
    setPending(action)
    setErrorCode(null)
    setMessage(null)
    try {
      const body: Record<string, unknown> = {
        planId: activeCampaignPlan.id,
        actionId: crypto.randomUUID(),
        expectedVersion: activeCampaignPlan.version,
        expectedStateHash: management.stateHash,
        action,
        confirm: true,
        acknowledgedBillingWarning: enableBillingAcknowledged,
        acknowledgedBudget: enableBudgetAcknowledged,
      }
      if (action === 'budget') {
        const dailyBudgetMinor = majorToMinor(managementBudget, selectedCurrency)
        if (!dailyBudgetMinor) throw new WorkspaceApiError('invalid_budget')
        body.dailyBudgetMinor = dailyBudgetMinor
      }
      if (action === 'ad_copy') {
        body.headlines = splitLines(managementHeadlines)
        body.descriptions = splitLines(managementDescriptions)
      }
      await postJson('/api/ads/google/management', 'POST', body)
      await Promise.all([mutatePlans(), mutateManagement()])
      setMessage(isTr ? 'Değişiklik Google Ads’e uygulandı ve işlem geçmişine kaydedildi.' : 'The change was applied to Google Ads and recorded in the activity log.')
      setEnableBudgetAcknowledged(false)
      setEnableBillingAcknowledged(false)
    } catch (error) {
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
      await mutateManagement()
    } finally {
      setPending(null)
    }
  }

  const formCopy = {
    sector: isTr ? 'Sektör' : 'Sector',
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="google-ads-workspace-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="google-ads-workspace-title" className="text-xl font-semibold tracking-tight">{copy.title}</h2>
            <Badge variant="secondary">Beta</Badge>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void mutatePlans()} disabled={plansLoading}>
            <RefreshCw data-icon="inline-start" aria-hidden="true" />{copy.refresh}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={clearSelection}>{copy.newPlan}</Button>
        </div>
      </div>

      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>{copy.pausedNote}</AlertTitle>
        <AlertDescription className="flex flex-col gap-1">
          <span>{copy.directBilling}</span>
          <span>{copy.credits}</span>
          <span>{copy.summaryGuarantee}</span>
        </AlertDescription>
      </Alert>

      {availableConnections.length === 0 ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{copy.noConnection}</AlertTitle>
          <AlertDescription>{isTr ? 'Hesap bağlama bölümünden yönetici olmayan bir müşteri hesabı seçin.' : 'Choose a non-manager customer account in the account connection section.'}</AlertDescription>
        </Alert>
      ) : null}

      {plansError ? (
        <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{errorText(plansError instanceof WorkspaceApiError ? plansError.code : undefined, isTr)}</AlertTitle></Alert>
      ) : null}
      {errorCode ? (
        <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{errorText(errorCode, isTr)}</AlertTitle></Alert>
      ) : null}
      {message ? (
        <Alert><Check aria-hidden="true" /><AlertDescription>{message}</AlertDescription></Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{copy.builder}</CardTitle>
            <CardDescription>{copy.createHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="google-ads-workspace-account">{copy.selectAccount}</FieldLabel>
                <select
                  id="google-ads-workspace-account"
                  value={connectionId}
                  onChange={(event) => setConnectionId(event.target.value)}
                  disabled={!isEditable || pending !== null}
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{copy.selectAccount}</option>
                  {availableConnections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name ?? connection.externalAccountId} · {connection.currency ?? '—'}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField id="google-ads-brand" label={copy.brand} value={form.brand} onChange={(value) => updateForm('brand', value)} disabled={!isEditable || pending !== null} />
                <Field>
                  <FieldLabel htmlFor="google-ads-sector">{formCopy.sector}</FieldLabel>
                  <select id="google-ads-sector" value={form.sector} onChange={(event) => updateForm('sector', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {PLAN_SECTORS.map((sector) => <option key={sector} value={sector}>{sector.replaceAll('_', ' ')}</option>)}
                  </select>
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField id="google-ads-sector-label" label={copy.sectorLabel} value={form.sectorLabel} onChange={(value) => updateForm('sectorLabel', value)} disabled={!isEditable || pending !== null} />
                <Field>
                  <FieldLabel htmlFor="google-ads-language">{copy.language}</FieldLabel>
                  <select id="google-ads-language" value={form.language} onChange={(event) => updateForm('language', event.target.value as 'tr' | 'en')} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="tr">Türkçe</option><option value="en">English</option>
                  </select>
                </Field>
              </div>
              <TextAreaField id="google-ads-services" label={copy.services} value={form.services} onChange={(value) => updateForm('services', value)} disabled={!isEditable || pending !== null} rows={2} />
              <TextField id="google-ads-url" label={copy.url} value={form.finalUrl} onChange={(value) => { updateForm('finalUrl', value); if (!form.displayUrl) updateForm('displayUrl', value) }} placeholder="https://example.com" disabled={!isEditable || pending !== null} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="google-ads-country">{copy.country}</FieldLabel>
                  <select id="google-ads-country" value={form.country} onChange={(event) => updateForm('country', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {PLAN_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                  </select>
                </Field>
                <TextAreaField id="google-ads-cities" label={copy.cities} value={form.cities} onChange={(value) => updateForm('cities', value)} disabled={!isEditable || pending !== null} rows={2} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextField id="google-ads-budget" label={`${copy.daily} (${selectedConnection?.currency ?? selectedCurrency})`} type="number" value={dailyBudget} onChange={setDailyBudget} disabled={!isEditable || pending !== null} />
                <TextField id="google-ads-budget-cap" label={`${copy.cap} (${selectedConnection?.currency ?? selectedCurrency})`} type="number" value={budgetCap} onChange={setBudgetCap} disabled={!isEditable || pending !== null} />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <TextAreaField id="google-ads-keywords" label={copy.keywords} value={form.keywords} onChange={(value) => updateForm('keywords', value)} disabled={!isEditable || pending !== null} />
                <TextAreaField id="google-ads-negative-keywords" label={copy.negatives} value={form.negativeKeywords} onChange={(value) => updateForm('negativeKeywords', value)} disabled={!isEditable || pending !== null} />
              </div>
              <TextAreaField id="google-ads-headlines" label={copy.headlines} value={form.headlines} onChange={(value) => updateForm('headlines', value)} disabled={!isEditable || pending !== null} />
              <TextAreaField id="google-ads-descriptions" label={copy.descriptions} value={form.descriptions} onChange={(value) => updateForm('descriptions', value)} disabled={!isEditable || pending !== null} />
              <TextField id="google-ads-display-url" label={copy.displayUrl} value={form.displayUrl} onChange={(value) => updateForm('displayUrl', value)} disabled={!isEditable || pending !== null} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="google-ads-policy-category">{copy.policyCategory}</FieldLabel>
                  <select id="google-ads-policy-category" value={form.modelPolicyCategory} onChange={(event) => updateForm('modelPolicyCategory', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {['none', 'health', 'financial', 'gambling', 'adult', 'drugs', 'alcohol', 'tobacco', 'other'].map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="google-ads-policy-evidence">{copy.policyEvidence}</FieldLabel>
                  <select id="google-ads-policy-evidence" value={form.modelPolicyEvidence} onChange={(event) => updateForm('modelPolicyEvidence', event.target.value as 'none' | 'ambiguous')} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="none">{isTr ? 'Belirgin değil' : 'No indication'}</option>
                    <option value="ambiguous">{isTr ? 'Belirsiz' : 'Ambiguous'}</option>
                  </select>
                </Field>
              </div>
              <Button type="button" onClick={() => void saveDraft()} disabled={!selectedConnection || !isEditable || pending !== null}>
                <Save data-icon="inline-start" aria-hidden="true" />{pending === 'save' ? copy.saving : copy.saveDraft}
              </Button>
            </FieldGroup>
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{copy.restricted}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>{copy.plans}</CardTitle>
              <CardDescription>{plans.length ? `${plans.length} ${isTr ? 'plan' : 'plans'}` : copy.noPlans}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {plansLoading ? <Skeleton className="h-20" aria-label={copy.loading} /> : plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => selectPlan(plan)}
                  aria-pressed={planId === plan.id}
                  className={cn(
                    'flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition-colors',
                    planId === plan.id ? 'border-brand/50 bg-brand/5' : 'border-border bg-card hover:bg-muted/50',
                  )}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{typeof plan.plan.brand === 'string' ? plan.plan.brand : (isTr ? 'Ads planı' : 'Ads plan')}</span>
                    <Badge variant={plan.status === 'published' ? 'secondary' : 'outline'}>{statusText(plan.status, isTr)}</Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {plan.currency} · {minorToMajor(plan.daily_budget_minor, plan.currency)} / {isTr ? 'gün' : 'day'} · v{plan.version}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>

          {!selectedPlan ? (
            <Card>
              <CardHeader><CardTitle>{copy.reviewTitle}</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{copy.noSelection}</p></CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{copy.reviewTitle}</CardTitle>
                <CardDescription>{statusText(selectedPlan.status, isTr)} · v{selectedPlan.version}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <h3 className="mb-3 text-sm font-semibold">{copy.summary}</h3>
                  <dl className="grid gap-2 text-sm">
                    <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{copy.dailyLabel}</dt><dd className="text-right font-medium">{selectedPlan.currency} {minorToMajor(selectedPlan.daily_budget_minor, selectedPlan.currency)}</dd></div>
                    <div className="flex items-start justify-between gap-3"><dt className="text-muted-foreground">{copy.cpc}</dt><dd className="text-right font-medium">{summary ? `${selectedPlan.currency} ${minorToMajor(summary.cpcBidCeilingMinor, selectedPlan.currency)}` : '—'}</dd></div>
                    <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{copy.target}</dt><dd>{String(selectedPlan.plan.country ?? '—')} · {String(selectedPlan.plan.language ?? '—')} · {splitLines(form.cities).join(', ') || copy.noTerms}</dd></div>
                    <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{copy.terms}</dt><dd>{Array.isArray(selectedPlan.plan.keywords) ? selectedPlan.plan.keywords.join(', ') : copy.noTerms}</dd></div>
                    <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{copy.headlines}</dt><dd>{Array.isArray((selectedPlan.plan.adCopy as Record<string, unknown> | undefined)?.headlines) ? ((selectedPlan.plan.adCopy as Record<string, unknown>).headlines as string[]).join(' · ') : copy.noTerms}</dd></div>
                    <div className="flex flex-col gap-1"><dt className="text-muted-foreground">{copy.descriptions}</dt><dd>{Array.isArray((selectedPlan.plan.adCopy as Record<string, unknown> | undefined)?.descriptions) ? ((selectedPlan.plan.adCopy as Record<string, unknown>).descriptions as string[]).join(' · ') : copy.noTerms}</dd></div>
                  </dl>
                </div>

                {selectedPlan.status !== 'published' && selectedPlan.status !== 'publishing' && selectedPlan.status !== 'reconciling' ? (
                  <FieldSet className="rounded-xl border border-border p-4">
                    <FieldLegend>{copy.declaration}</FieldLegend>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="google-ads-eu-declaration">{copy.declaration}</FieldLabel>
                        <select id="google-ads-eu-declaration" value={euPoliticalAdvertising} onChange={(event) => setEuPoliticalAdvertising(event.target.value as 'yes' | 'no')} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                          <option value="no">{copy.euNo}</option><option value="yes">{copy.euYes}</option>
                        </select>
                      </Field>
                      <Field orientation="horizontal">
                        <input id="google-ads-eu-confirm" type="checkbox" checked={confirmedEu} onChange={(event) => setConfirmedEu(event.target.checked)} className="size-4 rounded border-input accent-primary" />
                        <FieldLabel htmlFor="google-ads-eu-confirm">{copy.confirmEu}</FieldLabel>
                      </Field>
                      <Field orientation="horizontal">
                        <input id="google-ads-terms-confirm" type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="size-4 rounded border-input accent-primary" />
                        <FieldLabel htmlFor="google-ads-terms-confirm">{copy.acceptTerms}</FieldLabel>
                      </Field>
                      <Button type="button" variant="outline" onClick={() => void approvePlan()} disabled={!confirmedEu || !acceptedTerms || pending !== null || selectedPlan.status === 'published'}>
                        {pending === 'approve' ? copy.saving : copy.approve}
                      </Button>
                    </FieldGroup>
                  </FieldSet>
                ) : null}

                {selectedPlan.status === 'approved' ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">{copy.approved}</p>
                    <Button type="button" variant="outline" onClick={() => void runPublish('validate')} disabled={!selectedPlan.approval_hash || pending !== null || selectedPlan.validation_hash === selectedPlan.approval_hash}>
                      {pending === 'validate' ? copy.validating : copy.validate}
                    </Button>
                    <Button type="button" onClick={() => void runPublish('publish')} disabled={!selectedPlan.approval_hash || selectedPlan.validation_hash !== selectedPlan.approval_hash || pending !== null}>
                      {pending === 'publish' ? copy.publishing : copy.publish}
                    </Button>
                  </div>
                ) : null}

                {selectedPlan.status === 'published' ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
                    <h3 className="font-semibold">{copy.result}</h3>
                    <p className="text-sm text-muted-foreground">{copy.campaignId}: <span className="font-mono text-foreground">{selectedPlan.external_campaign_id}</span></p>
                    <p className="text-sm text-muted-foreground">{copy.status}: {selectedPlan.google_campaign_status === 'ENABLED' ? (isTr ? 'Etkin' : 'Enabled') : (isTr ? 'Duraklatıldı' : 'Paused')}</p>
                    {selectedPlan.publish_credit_charged ? <p className="text-sm text-muted-foreground">{isTr ? '15 kredi tahsil edildi.' : '15 credits charged.'}</p> : null}
                  </div>
                ) : null}

                {selectedPlan.status === 'reconciling' ? (
                  <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertTitle>{isTr ? 'Yayın sonucu belirsiz' : 'Publish result is uncertain'}</AlertTitle><AlertDescription>{isTr ? 'Kampanyayı tekrar yayınlamayın. Google Ads hesabını kontrol edin; durum yönetici incelemesinde.' : 'Do not publish again. Check Google Ads; the result is being reconciled.'}</AlertDescription></Alert>
                ) : null}
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={clearSelection}>{copy.close}</Button>
              </CardFooter>
            </Card>
          )}

          {activeCampaignPlan ? (
            <Card>
              <CardHeader>
                <CardTitle>{copy.management}</CardTitle>
                <CardDescription>{copy.directBilling}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {managementLoading ? <Skeleton className="h-24" aria-label={copy.loading} /> : null}
                {managementError ? <Alert variant="destructive"><AlertCircle aria-hidden="true" /><AlertDescription>{errorText(managementError instanceof WorkspaceApiError ? managementError.code : undefined, isTr)}</AlertDescription></Alert> : null}
                {management ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div>
                        <p className="text-sm font-medium">{copy.status}: {management.campaignStatus}</p>
                        <p className="text-sm text-muted-foreground">{copy.review}: {management.reviewStatus}</p>
                        <p className="text-sm text-muted-foreground">{copy.billing}: {management.billingVerified ? (isTr ? 'Doğrulandı' : 'Verified') : (isTr ? 'Uyarı' : 'Warning')}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {management.campaignStatus === 'ENABLED' ? (
                          <Button type="button" variant="outline" onClick={() => void applyAction('pause')} disabled={pending !== null}>{copy.pause}</Button>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => void applyAction('enable')}
                            disabled={pending !== null || management.reviewStatus !== 'approved' || !enableBudgetAcknowledged || (management.paymentMethodWarning && !enableBillingAcknowledged)}
                          >
                            {copy.enable}
                          </Button>
                        )}
                      </div>
                    </div>
                    {management.campaignStatus !== 'ENABLED' ? (
                      <FieldSet className="rounded-xl border border-border p-3">
                        <FieldLegend>{copy.enable}</FieldLegend>
                        <FieldGroup>
                          <Field orientation="horizontal">
                            <input id="google-ads-enable-budget-ack" type="checkbox" checked={enableBudgetAcknowledged} onChange={(event) => setEnableBudgetAcknowledged(event.target.checked)} className="size-4 rounded border-input accent-primary" />
                            <FieldLabel htmlFor="google-ads-enable-budget-ack">{copy.reviewAcknowledged}</FieldLabel>
                          </Field>
                          {management.paymentMethodWarning ? (
                            <>
                              <Alert><AlertCircle aria-hidden="true" /><AlertDescription>{copy.billingWarning}</AlertDescription></Alert>
                              <Field orientation="horizontal">
                                <input id="google-ads-enable-billing-ack" type="checkbox" checked={enableBillingAcknowledged} onChange={(event) => setEnableBillingAcknowledged(event.target.checked)} className="size-4 rounded border-input accent-primary" />
                                <FieldLabel htmlFor="google-ads-enable-billing-ack">{isTr ? 'Faturalama uyarısını anlıyorum.' : 'I acknowledge the billing warning.'}</FieldLabel>
                              </Field>
                            </>
                          ) : null}
                          {management.reviewStatus !== 'approved' ? <p className="text-sm text-muted-foreground">{copy.reviewRequired}</p> : null}
                        </FieldGroup>
                      </FieldSet>
                    ) : null}
                    <div className="grid gap-4 md:grid-cols-2">
                      <FieldGroup>
                        <TextField id="google-ads-management-budget" label={`${copy.daily} (${selectedCurrency})`} value={managementBudget || microsToMajor(management.dailyBudgetMicros, selectedCurrency)} onChange={setManagementBudget} type="number" />
                        <p className="text-xs text-muted-foreground">{copy.before}: {selectedCurrency} {microsToMajor(management.dailyBudgetMicros, selectedCurrency)} · {copy.after}: {selectedCurrency} {managementBudget || microsToMajor(management.dailyBudgetMicros, selectedCurrency)}</p>
                        <Button type="button" variant="outline" onClick={() => void applyAction('budget')} disabled={pending !== null}>{pending === 'budget' ? copy.saving : copy.apply}</Button>
                      </FieldGroup>
                      <FieldGroup>
                        <TextAreaField id="google-ads-management-headlines" label={copy.headlines} value={managementHeadlines || management.headlines.join('\n')} onChange={setManagementHeadlines} rows={3} />
                        <TextAreaField id="google-ads-management-descriptions" label={copy.descriptions} value={managementDescriptions || management.descriptions.join('\n')} onChange={setManagementDescriptions} rows={3} />
                        <Button type="button" variant="outline" onClick={() => void applyAction('ad_copy')} disabled={pending !== null}>{pending === 'ad_copy' ? copy.saving : copy.apply}</Button>
                      </FieldGroup>
                    </div>
                  </>
                ) : !managementLoading && !managementError ? <p className="text-sm text-muted-foreground">{copy.noActive}</p> : null}
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">{copy.summaryGuarantee}</CardFooter>
            </Card>
          ) : null}
        </div>
      </div>

      <div className="sr-only" aria-live="polite">{message}</div>
    </section>
  )
}
