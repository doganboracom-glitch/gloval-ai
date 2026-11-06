'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
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
import { GoogleAdsPublishReview } from '@/components/ads/google-ads-publish-review'
import { GoogleAdsAiPlanner } from '@/components/ads/google-ads-ai-planner'
import { GoogleAdsCampaignManager } from '@/components/ads/google-ads-campaign-manager'
import { AiSuggestionBadge, GoogleAdsSearchPreview } from '@/components/ads/google-ads-search-preview'
import { currencyDigits, type PlanSuggestion } from '@/lib/ads/plan-suggestion'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'
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
  google_daily_budget_minor: number | null
  external_campaign_id: string | null
  publish_billing_verified: boolean | null
  google_campaign_status: 'PAUSED' | 'ENABLED'
  publish_credit_charged: boolean
  approval_summary: GoogleAdsApprovalSummary | null
}

type PlansPayload = { plans: PlanRow[] }
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
  suggestion?: PlanSuggestion
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

type AiFieldKey = keyof PlanForm | 'dailyBudget'

const ALL_PLAN_FIELDS: AiFieldKey[] = [
  'brand', 'sector', 'sectorLabel', 'services', 'language', 'keywords', 'negativeKeywords', 'country', 'cities',
  'finalUrl', 'modelPolicyCategory', 'modelPolicyEvidence', 'headlines', 'descriptions', 'displayUrl',
]
const HEADLINE_LIMIT = 30
const DESCRIPTION_LIMIT = 90

function countOver(value: string, limit: number): number {
  return splitLines(value).filter((line) => line.length > limit).length
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
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

function formatCurrencyAmount(value: number | null | undefined, currency: string, isTr: boolean): string {
  const amount = minorToMajor(value, currency)
  if (!amount) return '—'
  try {
    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(Number(amount))
  } catch {
    return `${currency} ${amount}`
  }
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

    insufficient_credits: 'Yayınlama için yeterli kredi yok.',
    plan_changed: 'Plan veya kampanya durumu değişmiş. Yenileyip tekrar kontrol edin.',
    confirmation_required: 'Devam etmek için özeti gözden geçirip gereken ikinci onayı verin.',
    eu_political_declaration_required: 'AB siyasi reklam beyanı onayı gerekiyor.',
    ad_disapproved: 'Reklam Google tarafından reddedildi; etkinleştirilemez.',
    ad_review_in_progress: 'Reklam incelemesi tamamlanmadan etkinleştirilemez.',
    ad_review_status_unavailable: 'Reklam inceleme durumu doğrulanamadı.',
    reauth_required: 'Google Ads bağlantısı yeniden yetkilendirilmeli.',
    not_authorized: 'Google Ads hesabı bu isteğe izin vermedi. Bağlantı ve hesap yetkilerini kontrol edin.',
    connection_not_found: 'Seçili Google Ads hesabı bulunamadı. Hesabı yeniden bağlayıp seçin.',
    manager_account: 'Yayınlama için yönetici hesabı değil, müşteri hesabı seçilmelidir.',
    connection_busy: 'Google Ads hesabında başka bir API işlemi sürüyor. Biraz sonra tekrar deneyin.',
    publish_in_progress: 'Bu kampanya için başka bir işlem devam ediyor.',
    provider_error: 'Google Ads isteği tamamlanamadı. Kampanya bilgilerini ve hesabı kontrol edin.',
    provider_unavailable: 'Google Ads yanıtı doğrulanamadı. Kampanya oluşmuş olabilir; tekrar yayınlamayın, yönetici incelemesini bekleyin.',
    api_quota_exceeded: 'Google Ads API kotasına ulaşıldı. Bir süre bekleyip tekrar deneyin.',
    quota_check_failed: 'API kotası doğrulanamadı; güvenlik için Google Ads isteği gönderilmedi.',
    configuration_missing: 'Google Ads yayınlama yapılandırması eksik. Yöneticiye bildirim gönderildi.',
    reservation_failed: 'Yayın rezervasyonunun sonucu belirsiz. Yeniden yayınlamayın; yönetici kontrolünü bekleyin.',
    status_update_failed: 'Yayın durumu kaydedilemedi. Kampanya durumunu Google Ads hesabında kontrol edin; yönetici bilgilendirildi.',
    destination_unreachable: 'Açılış sayfasına güvenli şekilde ulaşılamadı. URL’yi kontrol edip tekrar deneyin.',
    site_policy_blocked: 'Açılış sayfası yayınlama güvenlik denetiminden geçemedi. İçeriği veya URL’yi kontrol edin.',
  }
  const en: Record<string, string> = {
    invalid_request: 'Check the details and try again.',
    invalid_publish_plan: 'The plan, headlines, or descriptions do not meet Google Ads requirements.',
    invalid_budget: 'The budget or CPC ceiling is invalid.',

    insufficient_credits: 'There are not enough credits to publish.',
    plan_changed: 'The plan or campaign state changed. Refresh and review again.',
    confirmation_required: 'Review the summary and provide the required second confirmation before continuing.',
    eu_political_declaration_required: 'The EU political advertising declaration must be confirmed.',
    ad_disapproved: 'Google disapproved the ad; it cannot be enabled.',
    ad_review_in_progress: 'The ad cannot be enabled until review is complete.',
    ad_review_status_unavailable: 'The ad review status could not be verified.',
    reauth_required: 'Reconnect Google Ads to continue.',
    not_authorized: 'Google Ads did not authorize this request. Check the connection and account permissions.',
    connection_not_found: 'The selected Google Ads account was not found. Reconnect and select it again.',
    manager_account: 'Select a customer account, not a manager account, to publish.',
    connection_busy: 'Another Google Ads API operation is in progress. Try again shortly.',
    publish_in_progress: 'Another action is already in progress for this campaign.',
    provider_error: 'The Google Ads request could not be completed. Check the campaign details and account.',
    provider_unavailable: 'The Google Ads response could not be verified. A campaign may exist; do not retry publishing and wait for admin review.',
    api_quota_exceeded: 'The Google Ads API quota was reached. Wait before trying again.',
    quota_check_failed: 'The API quota could not be verified, so no Google Ads request was sent.',
    configuration_missing: 'Google Ads publishing configuration is incomplete. The administrator was notified.',
    reservation_failed: 'The publish reservation result is uncertain. Do not retry; wait for administrator review.',
    status_update_failed: 'The publish status could not be saved. Check Google Ads directly; the administrator was notified.',
    destination_unreachable: 'The landing page could not be reached safely. Check the URL and try again.',
    site_policy_blocked: 'The landing page did not pass the publishing security check. Review its content or URL.',
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
  aiSuggested = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  description?: string
  disabled?: boolean
  aiSuggested?: boolean
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}{aiSuggested ? <AiSuggestionBadge /> : null}</FieldLabel>
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
  aiSuggested = false,
  warning,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  description?: string
  disabled?: boolean
  rows?: number
  aiSuggested?: boolean
  warning?: string | null
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}{aiSuggested ? <AiSuggestionBadge /> : null}</FieldLabel>
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
      {warning ? <p role="status" className="text-sm text-destructive">{warning}</p> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}

export function GoogleAdsWorkspace({
  enabled,
  connections,
  initialAddress,
  initialPlanId = null,
}: {
  enabled: boolean
  connections: GoogleAdsConnectionView[]
  initialAddress: string | null
  initialPlanId?: string | null
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
        descriptions: 'Açıklamalar (satır başına bir tane)', displayUrl: 'Görünen URL', daily: 'Günlük bütçe',
        policyCategory: 'Kısıtlı içerik kategorisi', policyEvidence: 'Politika kanıtı', createHint: 'Planı kaydetmek Google Ads’te kampanya oluşturmaz.',
        reviewTitle: 'Onay ve yayınlama', noSelection: 'Yayınlamadan önce bir taslak plan seçin.',
        declaration: 'AB siyasi reklam beyanı', euNo: 'Hayır', euYes: 'Evet', confirmEu: 'Bu beyanın doğru olduğunu onaylıyorum.',
        acceptTerms: 'Yayın öncesi ikinci onayımı verdikten sonra, bu planın Google Ads hesabımda duraklatılmış kampanya olarak oluşturulmasına GLOVAL AI’a yetki veriyorum; politika uyumu ve Google tahsilatları bana aittir.', approve: 'Planı onayla', approved: 'Onay kaydedildi. Önce validate_only ile doğrulayın.',
        validate: 'Google’da doğrula (validate_only)', publish: 'Kampanyayı duraklatılmış oluştur', reviewBeforePublish: 'Yayın öncesi özeti incele', reviewBack: 'Özete dön', validating: 'Doğrulanıyor…', publishing: 'Oluşturuluyor…',
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
        summaryGuarantee: 'Sonuç garantisi yoktur. Günlük bütçe toplam harcama tavanı değildir; Google’ın uyguladığı bütçe kuralları nedeniyle gerçek harcama değişebilir. Harcamayı Google Ads hesabınızdan takip edin.',
        close: 'Temizle', edit: 'Planı düzenle', noActive: 'Bu hesapta yönetilebilir aktif kampanya yok.',
      }
    : {
        title: 'Google Ads campaign workspace', subtitle: 'Prepare a draft, review every change, and publish paused in your Google Ads account.',
        builder: 'Campaign plan', plans: 'Your plans', noPlans: 'No plans yet. Start by creating your first campaign plan.',
        selectAccount: 'Google Ads account', selectPlan: 'Select a plan', newPlan: 'New plan', saveDraft: 'Save draft', saving: 'Saving…',
        brand: 'Brand name', sector: 'Sector', sectorLabel: 'Sector label', services: 'Products or services (one per line)',
        language: 'Ad language', country: 'Target country', cities: 'Target cities (one per line)', url: 'Landing page URL',
        keywords: 'Keywords (one per line)', negatives: 'Negative keywords', headlines: 'Headlines (one per line)',
        descriptions: 'Descriptions (one per line)', displayUrl: 'Display URL', daily: 'Daily budget',
        policyCategory: 'Restricted content category', policyEvidence: 'Policy evidence', createHint: 'Saving a draft does not create a Google Ads campaign.',
        reviewTitle: 'Approval and publishing', noSelection: 'Select a draft plan before publishing.',
        declaration: 'EU political advertising declaration', euNo: 'No', euYes: 'Yes', confirmEu: 'I confirm this declaration is accurate.',
        acceptTerms: 'After my separate final confirmation, I authorize GLOVAL AI to create this plan as a paused campaign in my Google Ads account; I am responsible for policy compliance and Google charges.', approve: 'Approve plan', approved: 'Approval recorded. Validate with validate_only first.',
        validate: 'Validate with Google (validate_only)', publish: 'Create campaign paused', reviewBeforePublish: 'Review before publishing', reviewBack: 'Back to review', validating: 'Validating…', publishing: 'Creating…',
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
        summaryGuarantee: 'Results are not guaranteed. The daily budget is not a guaranteed total-spend cap; actual spend can vary under Google’s budget rules. Monitor charges in Google Ads.',
        close: 'Clear', edit: 'Edit plan', noActive: 'No manageable active campaign is available for this account.',
      }

  const reviewCopy = isTr ? {
    title: 'Yayın öncesi son kontrol',
    description: 'Aşağıdaki hesap ve kampanya ayrıntılarını dikkatle kontrol edin. Bu ikinci onaydan sonra Google Ads API üzerinden kampanya oluşturma isteği gönderilir.',
    account: 'Google Ads hesabı',
    campaign: 'Kampanya / marka',
    finalUrl: 'Açılış sayfası',
    dailyBudget: 'Google Ads günlük bütçesi',
    cpcCeiling: 'CPC teklif tavanı',
    targeting: 'Hedefleme',
    keywords: 'Anahtar kelimeler',
    negativeKeywords: 'Hariç tutulan anahtar kelimeler',
    headlines: 'Reklam başlıkları',
    descriptions: 'Reklam açıklamaları',
    notSpecified: 'Belirtilmedi',
    budgetDisclosure: copy.summaryGuarantee,
    pausedNote: copy.pausedNote,
    billingNote: copy.directBilling,
    creditsNote: copy.credits,
    consentLegend: 'İkinci yayın onayı',
    consentText: 'Bu Google Ads hesabında yukarıda gösterilen planın, belirtilen günlük bütçeyle duraklatılmış kampanya olarak oluşturulmasını onaylıyorum. Google reklam harcamalarını doğrudan hesabımdan tahsil eder; iptal veya bağlantıyı kesme kampanyayı durdurmaz. Gerekirse kampanyayı Google Ads’te ayrıca duraklatacağımı biliyorum.',
    termsLink: 'Kullanım Koşulları',
    privacyLink: 'Gizlilik Politikası',
  } : {
    title: 'Final pre-publish review',
    description: 'Review the account and campaign details below. After this second confirmation, a campaign creation request will be sent through the Google Ads API.',
    account: 'Google Ads account',
    campaign: 'Campaign / brand',
    finalUrl: 'Landing page',
    dailyBudget: 'Google Ads daily budget',
    cpcCeiling: 'CPC bid ceiling',
    targeting: 'Targeting',
    keywords: 'Keywords',
    negativeKeywords: 'Negative keywords',
    headlines: 'Ad headlines',
    descriptions: 'Ad descriptions',
    notSpecified: 'Not specified',
    budgetDisclosure: copy.summaryGuarantee,
    pausedNote: copy.pausedNote,
    billingNote: copy.directBilling,
    creditsNote: copy.credits,
    consentLegend: 'Second publishing confirmation',
    consentText: 'I confirm that the plan shown above will be created as a paused campaign in this Google Ads account with the stated daily budget. Google bills advertising spend directly to my account; cancellation or disconnecting the connection does not stop a campaign. I understand I must pause it separately in Google Ads when needed.',
    termsLink: 'Terms of Service',
    privacyLink: 'Privacy Policy',
  }

  const availableConnections = connections.filter((connection) => connection.status === 'active' && !connection.isManager)
  const [connectionId, setConnectionId] = useState(() => availableConnections[0]?.id ?? '')
  const [planId, setPlanId] = useState<string | null>(null)
  const [form, setForm] = useState<PlanForm>(() => defaultPlanForm(initialAddress))
  const [dailyBudget, setDailyBudget] = useState('1000')
  const [euPoliticalAdvertising, setEuPoliticalAdvertising] = useState<'yes' | 'no'>('no')
  const [confirmedEu, setConfirmedEu] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [showPublishReview, setShowPublishReview] = useState(false)
  const [finalPublishConfirmed, setFinalPublishConfirmed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [aiFields, setAiFields] = useState<ReadonlySet<AiFieldKey>>(() => new Set())
  const [notices, setNotices] = useState<string[]>([])
  const handoffApplied = useRef(false)
  const isAi = (key: AiFieldKey) => aiFields.has(key)

  const { data: plansData, error: plansError, isLoading: plansLoading, mutate: mutatePlans } = useSWR<PlansPayload>(
    enabled ? '/api/ads/google/plans' : null,
    fetchJson,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )
  const plans = plansData?.plans ?? []
  const selectedPlan = plans.find((plan) => plan.id === planId) ?? null
  const selectedConnection = availableConnections.find((connection) => connection.id === connectionId) ?? null
  const isEditable = !selectedPlan || ['draft', 'failed', 'approved'].includes(selectedPlan.status)
  const selectedCurrency = selectedPlan?.currency ?? selectedConnection?.currency ?? 'TRY'

  const summary = useMemo(() => {
    if (!selectedPlan) return null
    try {
      return buildGoogleAdsApprovalSummary({
        currency: selectedPlan.currency,
        dailyBudgetMinor: selectedPlan.daily_budget_minor as number,
      })
    } catch {
      return null
    }
  }, [selectedPlan])

  const reviewDetails = selectedPlan ? (() => {
    const plan = selectedPlan.plan
    const adCopy = plan.adCopy && typeof plan.adCopy === 'object' ? plan.adCopy as Record<string, unknown> : {}
    const cities = stringArray(plan.cities)
    const targeting = [
      typeof plan.country === 'string' ? plan.country : '',
      typeof plan.language === 'string' ? plan.language.toUpperCase() : '',
      ...cities,
    ].filter(Boolean).join(' · ')
    const currency = selectedPlan.currency
    const dailyBudgetAmount = minorToMajor(selectedPlan.daily_budget_minor, currency)

    return {
      account: selectedConnection?.name ?? selectedConnection?.externalAccountId ?? copy.noTerms,
      campaign: typeof plan.brand === 'string' ? plan.brand : copy.noTerms,
      finalUrl: typeof plan.finalUrl === 'string' ? plan.finalUrl : copy.noTerms,
      dailyBudget: dailyBudgetAmount ? `${currency} ${dailyBudgetAmount} / ${isTr ? 'gün' : 'day'}` : copy.noTerms,
      cpcCeiling: summary ? `${currency} ${minorToMajor(summary.cpcBidCeilingMinor, currency)}` : copy.noTerms,
      targeting: targeting || copy.noTerms,
      keywords: stringArray(plan.keywords),
      negativeKeywords: stringArray(plan.negativeKeywords),
      headlines: stringArray(adCopy.headlines),
      descriptions: stringArray(adCopy.descriptions),
    }
  })() : null

  useEffect(() => {
    if (!initialPlanId || handoffApplied.current) return
    const handoffPlan = plans.find((plan) => plan.id === initialPlanId)
    if (!handoffPlan) return
    handoffApplied.current = true
    selectPlan(handoffPlan, true)
    setMessage(isTr
      ? 'Plan taramadan taslak olarak aktarıldı. Google Ads’te henüz değişiklik yapılmadı.'
      : 'The plan was transferred from the scan as a draft. No Google Ads changes were made.')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectPlan only sets state
  }, [initialPlanId, plans, isTr])

  const applyScanResult = useCallback(async (result: PublicScanResult) => {
    if (!selectedConnection) return
    setPending('suggest')
    setErrorCode(null)
    setMessage(null)
    try {
      const response = await postJson('/api/ads/google/plans/suggest', 'POST', {
        connectionId: selectedConnection.id,
        result,
      })
      const suggestion = response.suggestion
      if (!suggestion) throw new WorkspaceApiError('provider_error')
      const currency = suggestion.budget?.currency ?? selectedConnection.currency ?? 'TRY'
      const nextNotices: string[] = []
      if (suggestion.budget?.approximate) {
        nextNotices.push(isTr
          ? 'Bütçe, hesabınızın para birimine yaklaşık dönüşümle hesaplandı. Kaydetmeden önce kontrol edin.'
          : 'The budget was converted to your account currency approximately. Check it before saving.')
      }
      if (!suggestion.budget) {
        nextNotices.push(errorText('invalid_budget', isTr))
      }
      const dropped = suggestion.adjustments.headlinesDropped + suggestion.adjustments.descriptionsDropped
      if (dropped > 0) {
        nextNotices.push(isTr
          ? `${dropped} reklam satırı Google Ads kurallarına uymadığı için çıkarıldı.`
          : `${dropped} ad lines were removed because they did not meet Google Ads rules.`)
      }
      if (suggestion.adjustments.toppedUp) {
        nextNotices.push(isTr
          ? 'Eksik kalan reklam satırları sitenizin adı ve hizmetlerinden tamamlandı.'
          : 'Missing ad lines were completed from your site name and services.')
      }
      setPlanId(null)
      setForm(formFromPlan(suggestion.plan as Record<string, unknown>))
      setDailyBudget(suggestion.budget ? minorToMajor(suggestion.budget.dailyMinor, currency) : '')
      setEuPoliticalAdvertising('no')
      setConfirmedEu(false)
      setAcceptedTerms(false)
      setShowPublishReview(false)
      setFinalPublishConfirmed(false)
      const aiKeys = new Set<AiFieldKey>(ALL_PLAN_FIELDS)
      if (suggestion.budget) {
        aiKeys.add('dailyBudget')
        }
      setAiFields(aiKeys)
      setNotices(nextNotices)
      setAdvancedOpen(false)
      setEditorOpen(true)
      setMessage(isTr
        ? 'Plan sitenizden hazırlandı. Kontrol edip taslak olarak kaydedin; Google Ads’te henüz değişiklik yapılmadı.'
        : 'The plan was prepared from your site. Review and save it as a draft; nothing has changed in Google Ads yet.')
    } catch (error) {
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
    } finally {
      setPending(null)
    }
  }, [selectedConnection, isTr])

  if (!enabled) return null

  function updateForm<K extends keyof PlanForm>(key: K, value: PlanForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    clearAi(key)
  }

  function clearAi(key: AiFieldKey) {
    setAiFields((current) => {
      if (!current.has(key)) return current
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  function startManual(address: string) {
    clearSelection()
    if (address) {
      const normalized = address.startsWith('http') ? address : `https://${address}`
      setForm((current) => ({ ...current, finalUrl: normalized, displayUrl: normalized }))
    }
    setEditorOpen(true)
    setAdvancedOpen(true)
  }

  function clearSelection() {
    setPlanId(null)
    setEditorOpen(false)
    setAdvancedOpen(false)
    setAiFields(new Set())
    setNotices([])
    setForm(defaultPlanForm(initialAddress))
    setDailyBudget('1000')
    setEuPoliticalAdvertising('no')
    setConfirmedEu(false)
    setAcceptedTerms(false)
    setMessage(null)
    setErrorCode(null)
    setShowPublishReview(false)
    setFinalPublishConfirmed(false)
  }

  function selectPlan(plan: PlanRow, fromAi = false) {
    setEditorOpen(true)
    setAdvancedOpen(false)
    setNotices([])
    setAiFields(fromAi ? new Set<AiFieldKey>([...ALL_PLAN_FIELDS, 'dailyBudget']) : new Set())
    setPlanId(plan.id)
    setConnectionId(plan.connection_id ?? '')
    setForm(formFromPlan(plan.plan))
    setDailyBudget(minorToMajor(plan.daily_budget_minor, plan.currency))

    setEuPoliticalAdvertising(plan.eu_political_advertising ?? 'no')
    setConfirmedEu(false)
    setAcceptedTerms(false)
    setMessage(null)
    setErrorCode(null)
    setShowPublishReview(false)
    setFinalPublishConfirmed(false)
  }

  async function saveDraft() {
    if (!selectedConnection || pending) return
    setPending('save')
    setErrorCode(null)
    setMessage(null)
    try {
      const dailyBudgetMinor = majorToMinor(dailyBudget, selectedConnection.currency ?? selectedCurrency)
      if (!dailyBudgetMinor) throw new WorkspaceApiError('invalid_budget')
      const body = {
        connectionId: selectedConnection.id,
        plan: planFromForm(form),
        dailyBudgetMinor,
        ...(selectedPlan ? { planId: selectedPlan.id, expectedVersion: selectedPlan.version } : {}),
      }
      const response = await postJson('/api/ads/google/plans', selectedPlan ? 'PATCH' : 'POST', body)
      if (response.planId) setPlanId(response.planId)
      await mutatePlans()
      setShowPublishReview(false)
      setFinalPublishConfirmed(false)
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
    if (phase === 'publish' && !finalPublishConfirmed) {
      setErrorCode('confirmation_required')
      return
    }
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
        publishConfirmed: phase === 'publish' && finalPublishConfirmed,
      })
      await mutatePlans()
      if (response.state === 'validated') {
        setMessage(isTr ? 'Google validate_only doğrulaması başarılı. Kampanya henüz oluşturulmadı.' : 'Google validate_only succeeded. The campaign has not been created.')
      } else if (response.state === 'published') {
        setShowPublishReview(false)
        setFinalPublishConfirmed(false)
        setMessage(isTr ? 'Kampanya duraklatılmış olarak oluşturuldu.' : 'The campaign was created in paused state.')
      } else if (response.state === 'reconciling') {
        setShowPublishReview(false)
        setFinalPublishConfirmed(false)
        setMessage(isTr ? 'Google sonucu belirsiz. Tekrar yayınlamayın; durum incelemeye alındı.' : 'Google’s result is uncertain. Do not retry publishing; the result is being reconciled.')
      }
    } catch (error) {
      if (phase === 'publish') setFinalPublishConfirmed(false)
      setErrorCode(error instanceof WorkspaceApiError ? error.code : 'provider_error')
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
        <div className="flex min-w-0 flex-col gap-5">
          <GoogleAdsAiPlanner
            initialAddress={initialAddress}
            applying={pending === 'suggest'}
            disabledReason={!selectedConnection ? copy.noConnection : !isEditable ? (isTr ? 'Bu plan artık düzenlenemez. Yeni bir plan başlatın.' : 'This plan can no longer be edited. Start a new plan.') : null}
            onResult={applyScanResult}
            onManual={startManual}
          />

          {editorOpen ? (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
              <Card>
                <CardHeader>
                  <CardTitle>{copy.builder}</CardTitle>
                  <CardDescription>{copy.createHint}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-5">
                  {notices.length > 0 ? (
                    <Alert>
                      <AlertCircle aria-hidden="true" />
                      <AlertDescription className="flex flex-col gap-1">
                        {notices.map((notice) => <span key={notice}>{notice}</span>)}
                      </AlertDescription>
                    </Alert>
                  ) : null}
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
                      <TextField id="google-ads-brand" label={copy.brand} value={form.brand} onChange={(value) => updateForm('brand', value)} disabled={!isEditable || pending !== null} aiSuggested={isAi('brand')} />
                      <TextField id="google-ads-url" label={copy.url} value={form.finalUrl} onChange={(value) => { updateForm('finalUrl', value); if (!form.displayUrl) updateForm('displayUrl', value) }} placeholder="https://example.com" disabled={!isEditable || pending !== null} aiSuggested={isAi('finalUrl')} />
                    </div>
                    <TextAreaField id="google-ads-services" label={copy.services} value={form.services} onChange={(value) => updateForm('services', value)} disabled={!isEditable || pending !== null} rows={2} aiSuggested={isAi('services')} />
                    <TextField id="google-ads-budget" label={`${copy.daily} (${selectedConnection?.currency ?? selectedCurrency})`} type="number" value={dailyBudget} onChange={(value) => { setDailyBudget(value); clearAi('dailyBudget') }} disabled={!isEditable || pending !== null} aiSuggested={isAi('dailyBudget')} />
                    <TextAreaField
                      id="google-ads-headlines"
                      label={copy.headlines}
                      value={form.headlines}
                      onChange={(value) => updateForm('headlines', value)}
                      disabled={!isEditable || pending !== null}
                      aiSuggested={isAi('headlines')}
                      warning={countOver(form.headlines, HEADLINE_LIMIT) > 0
                        ? (isTr ? `${countOver(form.headlines, HEADLINE_LIMIT)} başlık ${HEADLINE_LIMIT} karakteri aşıyor.` : `${countOver(form.headlines, HEADLINE_LIMIT)} headline(s) exceed ${HEADLINE_LIMIT} characters.`)
                        : null}
                    />
                    <TextAreaField
                      id="google-ads-descriptions"
                      label={copy.descriptions}
                      value={form.descriptions}
                      onChange={(value) => updateForm('descriptions', value)}
                      disabled={!isEditable || pending !== null}
                      aiSuggested={isAi('descriptions')}
                      warning={countOver(form.descriptions, DESCRIPTION_LIMIT) > 0
                        ? (isTr ? `${countOver(form.descriptions, DESCRIPTION_LIMIT)} açıklama ${DESCRIPTION_LIMIT} karakteri aşıyor.` : `${countOver(form.descriptions, DESCRIPTION_LIMIT)} description(s) exceed ${DESCRIPTION_LIMIT} characters.`)
                        : null}
                    />
                    <TextAreaField id="google-ads-keywords" label={copy.keywords} value={form.keywords} onChange={(value) => updateForm('keywords', value)} disabled={!isEditable || pending !== null} aiSuggested={isAi('keywords')} />

                    <div>
                      <Button type="button" variant="ghost" size="sm" aria-expanded={advancedOpen} aria-controls="google-ads-advanced-fields" onClick={() => setAdvancedOpen((open) => !open)}>
                        {advancedOpen ? (isTr ? 'Gelişmiş ayarları gizle' : 'Hide advanced settings') : (isTr ? 'Gelişmiş ayarları göster' : 'Show advanced settings')}
                      </Button>
                    </div>
                    <div id="google-ads-advanced-fields" hidden={!advancedOpen} className="flex flex-col gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="google-ads-sector">{formCopy.sector}{isAi('sector') ? <AiSuggestionBadge /> : null}</FieldLabel>
                          <select id="google-ads-sector" value={form.sector} onChange={(event) => updateForm('sector', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {PLAN_SECTORS.map((sector) => <option key={sector} value={sector}>{sector.replaceAll('_', ' ')}</option>)}
                          </select>
                        </Field>
                        <TextField id="google-ads-sector-label" label={copy.sectorLabel} value={form.sectorLabel} onChange={(value) => updateForm('sectorLabel', value)} disabled={!isEditable || pending !== null} aiSuggested={isAi('sectorLabel')} />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="google-ads-language">{copy.language}{isAi('language') ? <AiSuggestionBadge /> : null}</FieldLabel>
                          <select id="google-ads-language" value={form.language} onChange={(event) => updateForm('language', event.target.value as 'tr' | 'en')} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <option value="tr">Türkçe</option><option value="en">English</option>
                          </select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="google-ads-country">{copy.country}{isAi('country') ? <AiSuggestionBadge /> : null}</FieldLabel>
                          <select id="google-ads-country" value={form.country} onChange={(event) => updateForm('country', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {PLAN_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
                          </select>
                        </Field>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <TextAreaField id="google-ads-cities" label={copy.cities} value={form.cities} onChange={(value) => updateForm('cities', value)} disabled={!isEditable || pending !== null} rows={2} aiSuggested={isAi('cities')} />
                        <TextAreaField id="google-ads-negative-keywords" label={copy.negatives} value={form.negativeKeywords} onChange={(value) => updateForm('negativeKeywords', value)} disabled={!isEditable || pending !== null} rows={2} aiSuggested={isAi('negativeKeywords')} />
                      </div>
                      <TextField id="google-ads-display-url" label={copy.displayUrl} value={form.displayUrl} onChange={(value) => updateForm('displayUrl', value)} disabled={!isEditable || pending !== null} aiSuggested={isAi('displayUrl')} />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="google-ads-policy-category">{copy.policyCategory}{isAi('modelPolicyCategory') ? <AiSuggestionBadge /> : null}</FieldLabel>
                          <select id="google-ads-policy-category" value={form.modelPolicyCategory} onChange={(event) => updateForm('modelPolicyCategory', event.target.value)} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            {['none', 'health', 'financial', 'gambling', 'adult', 'drugs', 'alcohol', 'tobacco', 'other'].map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="google-ads-policy-evidence">{copy.policyEvidence}{isAi('modelPolicyEvidence') ? <AiSuggestionBadge /> : null}</FieldLabel>
                          <select id="google-ads-policy-evidence" value={form.modelPolicyEvidence} onChange={(event) => updateForm('modelPolicyEvidence', event.target.value as 'none' | 'ambiguous')} disabled={!isEditable || pending !== null} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                            <option value="none">{isTr ? 'Belirgin değil' : 'No indication'}</option>
                            <option value="ambiguous">{isTr ? 'Belirsiz' : 'Ambiguous'}</option>
                          </select>
                        </Field>
                      </div>
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
              <GoogleAdsSearchPreview
                headlines={splitLines(form.headlines)}
                descriptions={splitLines(form.descriptions)}
                displayUrl={form.displayUrl}
                finalUrl={form.finalUrl}
                keywords={splitLines(form.keywords)}
              />
            </div>
          ) : null}
        </div>

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
                      <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                        <Link className="text-primary underline underline-offset-4" href="/yasal/kullanim-kosullari">{reviewCopy.termsLink}</Link>
                        <span aria-hidden="true">·</span>
                        <Link className="text-primary underline underline-offset-4" href="/yasal/gizlilik-politikasi">{reviewCopy.privacyLink}</Link>
                      </p>
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
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowPublishReview(true)
                        setFinalPublishConfirmed(false)
                        setErrorCode(null)
                      }}
                      disabled={!selectedPlan.approval_hash || selectedPlan.validation_hash !== selectedPlan.approval_hash || pending !== null}
                    >
                      {copy.reviewBeforePublish}
                    </Button>
                    {showPublishReview && reviewDetails ? (
                      <>
                        <GoogleAdsPublishReview
                          details={reviewDetails}
                          copy={reviewCopy}
                          confirmed={finalPublishConfirmed}
                          onConfirmedChange={setFinalPublishConfirmed}
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" onClick={() => { setShowPublishReview(false); setFinalPublishConfirmed(false) }} disabled={pending !== null}>
                            {copy.reviewBack}
                          </Button>
                          <Button type="button" onClick={() => void runPublish('publish')} disabled={!finalPublishConfirmed || pending !== null}>
                            {pending === 'publish' ? copy.publishing : copy.publish}
                          </Button>
                        </div>
                      </>
                    ) : null}
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

          <GoogleAdsCampaignManager
            plan={selectedPlan ? { id: selectedPlan.id, status: selectedPlan.status, version: selectedPlan.version } : null}
            hasConnection={availableConnections.length > 0}
            currency={selectedCurrency}
            isTr={isTr}
          />
        </div>
      </div>

      <div className="sr-only" aria-live="polite">{message}</div>
    </section>
  )
}
