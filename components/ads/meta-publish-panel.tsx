'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, CheckCircle2, CircleDashed, ImagePlus, LoaderCircle, Sparkles, Trash2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanguage } from '@/components/language-provider'
import { MetaManageCard } from '@/components/ads/meta-manage-card'
import { MetaPlanPickerButton } from '@/components/ads/meta-plan-status'
import type { MetaLiveState } from '@/lib/ads/meta-manage'
import type { MetaConnectionView } from '@/lib/ads/meta-ads-shared'
import { draftMetaCopyFromScan } from '@/lib/ads/meta-ai-draft'
import { requestScan } from '@/lib/ads/scan-client'
import { MetaCountryPicker } from '@/components/ads/meta-country-picker'
import {
  META_OPTIMIZATION_GOALS,
  metaCurrencyOffset,
  metaApprovalText,
  META_CTA_LABELS,
  META_CTA_OPTIONS,
  META_PLAN_LIMITS,
  META_IMAGE_MAX_BYTES,
  adsManagerUrl,
  validateLandingUrl,
  validateMetaPlanContent,
  type MetaPlanContent,
} from '@/lib/ads/meta-publish-plan'
import {
  META_FIELD_LABELS,
  META_FLOW_STEPS,
  confirmAndCreate,
  describeMetaApiError,
  describePlanObjects,
  describeStoredFailure,
  metaFlowStepIndex,
  orderFieldErrors,
  toFieldErrors,
  type MetaApiError,
  type MetaFieldErrors,
  type MetaFieldName,
  type MetaPlanObjects,
} from '@/lib/ads/meta-publish-ux'

type PlanContent = MetaPlanContent

type PlanView = {
  id: string
  connectionId: string
  status: string
  version: number
  content: PlanContent
  hasStoredImage: boolean
  currency: string
  approvedVersion: number | null
  validatedVersion: number | null
  objects: MetaPlanObjects
  failureStep: string | null
  failureCode: string | null
  failureReason: string | null
  dailyBudgetMinor: number | null
  effectiveStatus: string | null
  lastSyncedAt: string | null
  live: MetaLiveState | null
}

type ApiResult<T> = { ok: true } & T

type Notice = { tone: 'ok' | 'error'; text: string; detail?: string | null }

const EMPTY: PlanContent = {
  name: '',
  landingUrl: '',
  primaryText: '',
  headline: '',
  description: '',
  cta: 'LEARN_MORE',
  countries: ['TR'],
  ageMin: 18,
  ageMax: 65,
  advantageAudience: true,
  gender: 'all',
  optimizationGoal: 'LANDING_PAGE_VIEWS',
  utmTracking: true,
  dailyBudget: '',
  endDate: null,
  imagePath: null,
  imageFilename: null,
  specialTopic: 'none',
}

const listFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((response) => response.json())

function editablePlanContent(content: PlanContent): PlanContent {
  return {
    ...EMPTY,
    ...content,
    advantageAudience: content.advantageAudience !== false,
    imageFilename: content.imageFilename ?? null,
    optimizationGoal: content.optimizationGoal ?? 'LANDING_PAGE_VIEWS',
    utmTracking: content.utmTracking ?? true,
  }
}

function formatPlanBudget(value: string | number, currency: string, isTr: boolean): string {
  const text = String(value)
  const amount = Number(text)
  if (!Number.isFinite(amount)) return `${text} ${currency}`
  try {
    return new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${value} ${currency}`
  }
}

async function post<T>(url: string, body: unknown): Promise<ApiResult<T> | MetaApiError> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await response.json()) as ApiResult<T> | MetaApiError
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

const fieldId = (name: MetaFieldName) => `meta-field-${name}`

function focusField(name: MetaFieldName) {
  const element = document.getElementById(fieldId(name))
  if (!element) return
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  element.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
  element.focus({ preventScroll: true })
}

export function MetaPublishPanel({
  connections,
  publishEnabled,
  manage = { canManage: false, canManageProtective: false },
  onGoToSettings,
}: {
  connections: MetaConnectionView[]
  publishEnabled: boolean
  manage?: { canManage: boolean; canManageProtective: boolean }
  onGoToSettings?: () => void
}) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const t = (tr: string, en: string) => (isTr ? tr : en)

  const publishable = useMemo(
    () => connections.filter((c) => c.status === 'active' && c.hasPage && c.missingPublishScopes.length === 0),
    [connections],
  )
  const pageless = useMemo(() => connections.filter((c) => c.status === 'active' && !c.hasPage), [connections])
  const [connectionId, setConnectionId] = useState<string | null>(publishable[0]?.id ?? null)
  const connection = connections.find((c) => c.id === connectionId) ?? null

  const [form, setForm] = useState<PlanContent>(EMPTY)
  const { data, mutate } = useSWR<{ ok: boolean; plans?: PlanView[] }>(
    connectionId && publishEnabled ? `/api/ads/meta/plans?connectionId=${connectionId}` : null,
    listFetcher,
  )
  const { data: minimumBudgetResponse } = useSWR<{ ok: boolean; minimumDailyBudgetMinor?: number | null }>(
    connectionId && publishEnabled ? `/api/ads/meta/plans/minimum-budget?connectionId=${connectionId}&optimizationGoal=${form.optimizationGoal}` : null,
    listFetcher,
    { dedupingInterval: 10 * 60 * 1000, revalidateOnFocus: false, revalidateOnReconnect: false },
  )
  const plans = data?.plans ?? []
  const minimumBudgetMinor = minimumBudgetResponse?.ok ? minimumBudgetResponse.minimumDailyBudgetMinor ?? null : null

  const [showArchived, setShowArchived] = useState(false)
  const visiblePlans = showArchived ? plans : plans.filter((item) => item.status !== 'archived')
  const archivedCount = plans.filter((item) => item.status === 'archived').length
  const [planId, setPlanId] = useState<string | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? null
  const [file, setFile] = useState<File | null>(null)
  const planContentChanged = plan !== null && (file !== null || JSON.stringify(form) !== JSON.stringify(editablePlanContent(plan.content)))
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [failedSavedPreviewKey, setFailedSavedPreviewKey] = useState<string | null>(null)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const savedImagePreviewKey = plan?.hasStoredImage ? `${plan.id}:${plan.version}` : null
  const savedImagePreviewUrl = plan?.hasStoredImage
    ? `/api/ads/meta/plans/image?planId=${encodeURIComponent(plan.id)}&v=${plan.version}`
    : null
  const savedImageFilename = plan?.content.imageFilename || (
    plan?.content.imagePath?.toLowerCase().endsWith('.png')
      ? t('Kayıtlı görsel.png', 'Saved image.png')
      : t('Kayıtlı görsel.jpg', 'Saved image.jpg')
  )
  const [aiHighlights, setAiHighlights] = useState<MetaFieldName[]>([])
  const [terms, setTerms] = useState(false)
  const [aiDrafted, setAiDrafted] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [errors, setErrors] = useState<MetaFieldErrors>({})
  const [focusRequest, setFocusRequest] = useState<{ field: MetaFieldName; n: number } | null>(null)

  useEffect(() => {
    if (publishable.some((item) => item.id === connectionId)) return
    const nextId = publishable[0]?.id ?? null
    if (nextId !== connectionId) {
      setConnectionId(nextId)
      setPlanId(null)
      setForm(EMPTY)
      setFile(null)
      setIsDraggingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ''
      setTerms(false)
      setErrors({})
    }
  }, [connectionId, publishable])

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setImagePreviewUrl(null)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setImagePreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [file])

  useEffect(() => {
    if (aiHighlights.length === 0) return
    const timeoutId = window.setTimeout(() => setAiHighlights([]), 1800)
    return () => window.clearTimeout(timeoutId)
  }, [aiHighlights])

  // Controls inside a disabled fieldset cannot take focus, so wait until the busy state is cleared.
  useEffect(() => {
    if (!focusRequest || busy !== null) return
    focusField(focusRequest.field)
    setFocusRequest(null)
  }, [focusRequest, busy])

  if (!publishEnabled) {
    return (
      <section className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {t('Meta reklam yayınlama bu hesap için henüz açık değil.', 'Meta ad publishing is not enabled for this account yet.')}
      </section>
    )
  }

  const pageNeeded = pageless.length > 0 ? <PageNeededCard names={pageless.map((c) => c.name ?? c.externalAccountId)} onGoToSettings={onGoToSettings} isTr={isTr} /> : null

  if (!connection) {
    const needsPermission = connections.some((c) => c.status === 'active' && c.hasPage && c.missingPublishScopes.length > 0)
    return (
      <section className="flex flex-col gap-3">
        {pageNeeded}
        {needsPermission || pageless.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-6">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {needsPermission
                ? t('Duraklatılmış kampanya oluşturmak için Ayarlar sekmesinden yönetim iznini verin.', 'Grant the management permission from Settings to create paused campaigns.')
                : t('Önce Ayarlar sekmesinden bir Meta reklam hesabı bağlayın.', 'Connect a Meta ad account from Settings first.')}
            </p>
            {onGoToSettings ? (
              <Button type="button" variant="outline" className="self-start" onClick={onGoToSettings}>{t('Ayarlar\'a git', 'Go to Settings')}</Button>
            ) : null}
          </div>
        ) : null}
      </section>
    )
  }

  const set = <K extends keyof PlanContent>(key: K, value: PlanContent[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key as MetaFieldName]: undefined }))
    if (key === 'landingUrl') setAiError(null)
  }

  const selectImageFile = (selectedFile: File | undefined) => {
    if (!selectedFile) return
    if (selectedFile.size === 0) {
      setFile(null)
      setErrors((current) => ({ ...current, imagePath: t('Dosya boş. Başka bir JPG veya PNG seçin.', 'This file is empty. Choose another JPG or PNG.') }))
      return
    }
    if (selectedFile.size > META_IMAGE_MAX_BYTES) {
      setFile(null)
      setErrors((current) => ({ ...current, imagePath: t('Görsel 5 MB sınırını aşıyor. Daha küçük bir dosya seçin.', 'The image exceeds 5 MB. Choose a smaller file.') }))
      return
    }
    if (selectedFile.type && !['image/jpeg', 'image/jpg', 'image/png'].includes(selectedFile.type)) {
      setFile(null)
      setErrors((current) => ({ ...current, imagePath: t('Bu dosya türü desteklenmiyor. JPG veya PNG seçin.', 'This file type is not supported. Choose JPG or PNG.') }))
      return
    }
    setFile(selectedFile)
    setErrors((current) => ({ ...current, imagePath: undefined }))
  }

  const showFieldErrors = (next: MetaFieldErrors) => {
    setErrors(next)
    const first = orderFieldErrors(next)[0]
    if (first) setFocusRequest((current) => ({ field: first[0], n: (current?.n ?? 0) + 1 }))
  }

  const showError = (error: MetaApiError) => {
    if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) showFieldErrors(toFieldErrors(error.fieldErrors))
    const info = describeMetaApiError(error)
    setNotice({ tone: 'error', text: info.message, detail: info.detail })
  }

  function validateForm(options: { requireImage: boolean }): MetaFieldErrors {
    const checked = validateMetaPlanContent(form, {
      currency: connection?.currency ?? null,
      minimumBudgetMinor,
      blockDsaCountries: options.requireImage,
    })
    const next: MetaFieldErrors = checked.ok ? {} : toFieldErrors(checked.errors)
  if (errors.imagePath && !(plan?.hasStoredImage && !file)) next.imagePath = errors.imagePath
  if (options.requireImage && !file && !plan?.hasStoredImage) next.imagePath = t('Reklam için bir görsel yükleyin (JPG veya PNG, en çok 5 MB).', 'Add a JPG or PNG image for the ad (up to 5 MB).')
    return next
  }

  function openPlan(next: PlanView | null) {
    setPlanId(next?.id ?? null)
    setForm(next ? editablePlanContent(next.content) : EMPTY)
    setFile(null)
    setIsDraggingImage(false)
    if (imageInputRef.current) imageInputRef.current.value = ''
    setTerms(false)
    setAiDrafted(false)
    setAiError(null)
    setNotice(null)
    setErrors({})
  }

  async function save(): Promise<PlanView | null> {
    const result = await post<{ plan: PlanView }>('/api/ads/meta/plans', { connectionId, planId: planId ?? undefined, content: form })
    if (!result.ok) { showError(result); return null }
    setPlanId(result.plan.id)
    setForm(editablePlanContent(result.plan.content))
    await mutate()
    return result.plan
  }

  async function run(label: string, task: () => Promise<string | null>) {
    setBusy(label)
    setNotice(null)
    try {
      const text = await task()
      if (text) setNotice({ tone: 'ok', text })
    } finally {
      setBusy(null)
    }
  }

  const uploadImage = async (id: string): Promise<boolean> => {
    if (!file) return true
    const body = new FormData()
    body.set('planId', id)
    body.set('file', file)
    const response = await fetch('/api/ads/meta/plans/image', { method: 'POST', body }).then((r) => r.json()).catch(() => null)
    if (!response?.ok) {
      if (response?.error === 'image_invalid' && typeof response.message === 'string') {
        setErrors((current) => ({ ...current, imagePath: isTr ? response.message : t('Seçilen görsel koşulları karşılamıyor. JPG/PNG kullanın; görselin boyut ve oranını kontrol edin.', 'The selected image does not meet the requirements. Use JPG/PNG and check its size and dimensions.') }))
        setNotice({ tone: 'error', text: t('Görsel yüklenemedi. Görsel alanındaki açıklamayı kontrol edin.', 'The image could not be uploaded. Check the requirements in the image field.') })
      } else {
        showError(response ?? { ok: false, error: 'network_error' })
      }
      return false
    }
    if (response.plan?.content) {
      setForm((current) => ({
        ...current,
        imagePath: response.plan.content.imagePath ?? null,
        imageFilename: response.plan.content.imageFilename ?? null,
      }))
    }
    setFile(null)
    return true
  }

  const onSaveDraft = () => {
    const found = validateForm({ requireImage: false })
    if (Object.keys(found).length > 0) {
      showFieldErrors(found)
      setNotice(null)
      return
    }
    setErrors({})
    void run('save', async () => ((await save()) ? t('Taslak kaydedildi.', 'Draft saved.') : null))
  }

  const onSaveAndValidate = () => {
    const found = validateForm({ requireImage: true })
    if (Object.keys(found).length > 0) {
      showFieldErrors(found)
      setNotice(null)
      return
    }
    setErrors({})
    void run('validate', async () => {
      const saved = await save()
      if (!saved || !(await uploadImage(saved.id))) return null
      const result = await post<{ checked: string[] }>('/api/ads/meta/plans/validate', { planId: saved.id })
      await mutate()
      if (!result.ok) { showError(result); return null }
      return t('Meta doğrulaması geçti. Onaylayıp oluşturabilirsiniz; henüz hiçbir şey oluşturulmadı.', 'Meta validation passed. You can approve and create now; nothing was created yet.')
    })
  }

  const approved = plan !== null && plan.approvedVersion === plan.version

  const onConfirmCreate = () => {
    if (plan?.status === 'partial' && planContentChanged) return
    void run('publish', async () => {
      if (!plan) return null
      const result = await confirmAndCreate({
        post,
        planId: plan.id,
        version: plan.version,
        alreadyApproved: approved,
        termsAccepted: terms,
        requestId: crypto.randomUUID(),
      })
      await mutate()
      if (!result.ok) { showError(result.error); return null }
      return t('Kampanya Meta hesabınızda DURAKLATILMIŞ olarak oluşturuldu. Başlatmak için Meta Reklam Yöneticisi\'ni kullanın.', 'Campaign created PAUSED in your Meta account. Start it from Meta Ads Manager.')
    })
  }

  async function deletePlan(planToDelete: PlanView) {
    const confirmed = window.confirm(t(
      "Bu plan GLOVAL panelinden kalıcı olarak kaldırılacak; Meta Reklam Yöneticisi'ndeki kampanyayı SİLMEZ. Etkin kampanyalar önce duraklatılmalı. Devam edilsin mi?",
      "This plan will be permanently removed from the GLOVAL panel; it will NOT delete the campaign in Meta Ads Manager. Active campaigns must be paused first. Continue?",
    ))
    if (!confirmed) return

    setBusy(`delete:${planToDelete.id}`)
    setNotice(null)
    try {
      const result = await post<{ planId: string }>('/api/ads/meta/plans/delete', { planId: planToDelete.id })
      if (!result.ok) {
        showError(result)
        return
      }
      if (planId === planToDelete.id) openPlan(null)
      await mutate()
      setNotice({
        tone: 'ok',
        text: t('Plan GLOVAL panelinden kaldırıldı. Meta kampanyası silinmedi.', 'Plan removed from the GLOVAL panel. The Meta campaign was not deleted.'),
      })
    } finally {
      setBusy(null)
    }
  }

  // Same site-scan draft the Google plan wizard uses. The result only fills editable fields; nothing is
  // sent to Meta until the user saves, validates and approves the exact plan version.
  const onAiDraft = () => {
    const url = validateLandingUrl(form.landingUrl)
    if (!url.ok) {
      setAiDrafted(false)
      setAiError(t(`AI taslağı için geçerli bir https adresi girin. ${url.error}`, `Enter a valid https address for the AI draft. ${url.error}`))
      setErrors((current) => ({ ...current, landingUrl: url.error }))
      setFocusRequest((current) => ({ field: 'landingUrl', n: (current?.n ?? 0) + 1 }))
      return
    }
    setAiError(null)
    setAiDrafted(false)
    setErrors((current) => ({ ...current, landingUrl: undefined }))
    void run('ai', async () => {
      try {
        const outcome = await requestScan({ address: form.landingUrl.trim(), requestId: crypto.randomUUID() })
        if (!outcome.ok) {
          setAiError(t('AI taslağı hazırlanamadı. Adresi kontrol edip tekrar deneyin.', 'The AI draft could not be prepared. Check the address and try again.'))
          return null
        }
        const draft = draftMetaCopyFromScan(outcome.result)
        if (!draft) {
          setAiError(t('Siteden yeterli metin çıkarılamadı. Alanları elle doldurun.', 'Not enough text could be extracted from the site. Fill in the fields manually.'))
          return null
        }
        setForm((current) => ({ ...current, ...draft }))
        setErrors((current) => ({ ...current, primaryText: undefined, headline: undefined, description: undefined, cta: undefined }))
        setAiDrafted(true)
        setAiHighlights(['primaryText', 'headline', 'description', 'cta'])
        setFocusRequest((current) => ({ field: 'primaryText', n: (current?.n ?? 0) + 1 }))
        return null
      } catch {
        setAiError(t('AI taslağı hazırlanamadı. Adresi kontrol edip tekrar deneyin.', 'The AI draft could not be prepared. Check the address and try again.'))
        return null
      }
    })
  }

  const stage = plan?.status ?? 'new'
  const locked = ['publishing', 'published', 'active', 'user_paused', 'archived'].includes(stage)
  const validated = plan !== null && plan.validatedVersion === plan.version
  const isPartial = plan?.status === 'partial'
  const showApproval = validated && !locked && !(isPartial && approved)
  const stepIndex = metaFlowStepIndex(plan)
  const errorEntries = orderFieldErrors(errors)
  const storedFailure = plan && !notice ? describeStoredFailure(plan) : null

  const control = (name: MetaFieldName) => ({
    id: fieldId(name),
    'aria-invalid': errors[name] ? (true as const) : undefined,
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
  })
  const selectClass = (name: MetaFieldName) =>
    `h-9 w-full rounded-md border bg-background px-2 text-sm ${errors[name] ? 'border-destructive ring-3 ring-destructive/20' : 'border-border'}`
  const highlightClass = (name: MetaFieldName) =>
    aiHighlights.includes(name) ? 'ring-2 ring-brand/50 motion-safe:animate-pulse motion-reduce:animate-none' : undefined
  const currencyOffset = metaCurrencyOffset(connection.currency)
  const minimumBudgetText = minimumBudgetMinor !== null && currencyOffset && connection.currency
    ? new Intl.NumberFormat(isTr ? 'tr-TR' : 'en-US', { style: 'currency', currency: connection.currency }).format(minimumBudgetMinor / currencyOffset)
    : null

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meta-publish-title">
      <div className="flex flex-col gap-1">
        <h2 id="meta-publish-title" className="text-xl font-semibold tracking-tight">{t('Duraklatılmış Meta kampanyası', 'Paused Meta campaign')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('Kampanya her zaman DURAKLATILMIŞ oluşturulur ve siz Meta Reklam Yöneticisi\'nden başlatana kadar harcama yapmaz.', 'Campaigns are always created PAUSED and never spend until you start them in Meta Ads Manager.')}
        </p>
      </div>

      {pageNeeded}

      <ol className="flex flex-wrap gap-2" aria-label={t('Yayın adımları', 'Publishing steps')}>
        {META_FLOW_STEPS.map((label, index) => {
          const done = index < stepIndex
          const current = index === stepIndex
          return (
            <li
              key={label}
              aria-current={current ? 'step' : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${current ? 'border-brand text-foreground' : 'border-border text-muted-foreground'}`}
            >
              {done ? <CheckCircle2 className="size-3.5" aria-hidden="true" /> : <span aria-hidden="true">{index + 1}</span>}
              {label}
              {done ? <span className="sr-only">{t('(tamamlandı)', '(done)')}</span> : null}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {publishable.length > 1 ? (
          <select
            aria-label={t('Reklam hesabı', 'Ad account')}
            className="h-9 rounded-md border border-border bg-background px-2 text-sm"
            value={connectionId ?? ''}
            onChange={(event) => { setConnectionId(event.target.value); openPlan(null) }}
          >
            {publishable.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.externalAccountId}</option>)}
          </select>
        ) : (
          <Badge variant="secondary">{connection.name ?? connection.externalAccountId}</Badge>
        )}
        <Badge variant="outline">{[connection.pageName, connection.currency].filter(Boolean).join(' · ')}</Badge>
        <Button type="button" size="sm" variant="outline" onClick={() => openPlan(null)}>{t('Yeni plan', 'New plan')}</Button>
      </div>

      {plans.length > 0 ? (
        <div className="flex flex-col gap-2">
          {archivedCount > 0 ? (
            <label className="flex items-center gap-2 self-start text-xs text-muted-foreground">
              <Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(checked === true)} />
              {t(`Arşivi göster (${archivedCount})`, `Show archive (${archivedCount})`)}
            </label>
          ) : null}
          {visiblePlans.length > 0 ? (
            <ul className="flex flex-wrap gap-3 p-1" aria-label={t('Planlar', 'Plans')}>
              {visiblePlans.map((p) => (
                <li key={p.id} className="group flex min-w-0 max-w-full items-center gap-1">
                  <MetaPlanPickerButton
                    name={p.content.name || t('Adsız', 'Untitled')}
                    plan={{ status: p.status, effectiveStatus: p.effectiveStatus }}
                    selected={p.id === planId}
                    lang={isTr ? 'tr' : 'en'}
                    onClick={() => openPlan(p)}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={t(`“${p.content.name || 'Adsız'}” planını sil`, `Delete “${p.content.name || 'Untitled'}” plan`)}
                    title={t('Planı GLOVAL panelinden kaldır', 'Remove plan from GLOVAL panel')}
                    disabled={busy !== null}
                    className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                    onClick={() => void deletePlan(p)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('Görüntülenecek etkin plan yok; arşivi görmek için üstteki seçeneği işaretleyin.', 'No visible plans; select the archive option above to view archived plans.')}</p>
          )}
        </div>
      ) : null}

      {notice ? (
        <div role={notice.tone === 'error' ? 'alert' : 'status'} aria-live={notice.tone === 'error' ? 'assertive' : 'polite'} className={notice.tone === 'error' ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive' : 'rounded-lg border border-border bg-card p-3 text-sm'}>
          <p>{notice.text}</p>
          {notice.detail ? <details className="mt-2 text-xs"><summary className="cursor-pointer">{t('Teknik ayrıntı', 'Technical details')}</summary><p className="mt-1 break-words">{notice.detail}</p></details> : null}
        </div>
      ) : null}

      {errorEntries.length > 0 ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p className="font-medium">{t(`${errorEntries.length} alanı düzeltin:`, `Fix ${errorEntries.length} field(s):`)}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {errorEntries.map(([name, message]) => (
              <li key={name}>
                <button type="button" className="text-left underline underline-offset-2" onClick={() => focusField(name)}>
                  {META_FIELD_LABELS[name]}: {message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset disabled={locked || busy !== null} className="grid gap-4 md:grid-cols-2">
        <Field name="name" label={t('Kampanya adı', 'Campaign name')} error={errors.name} className="md:col-span-2">
          <Input {...control('name')} value={form.name} maxLength={META_PLAN_LIMITS.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field name="landingUrl" label={t('Hedef sayfa (https)', 'Landing page (https)')} error={errors.landingUrl} className="md:col-span-2">
          <Input {...control('landingUrl')} type="url" inputMode="url" value={form.landingUrl} maxLength={META_PLAN_LIMITS.landingUrl} onChange={(e) => set('landingUrl', e.target.value)} />
        </Field>
        <div className="flex flex-col gap-2 md:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={onAiDraft} aria-describedby={aiError ? 'meta-ai-error' : undefined}>
              <Sparkles data-icon="inline-start" aria-hidden="true" />
              {t('Siteden AI taslağı öner', 'Suggest copy from site with AI')}
            </Button>
            {busy === 'ai' ? (
              <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 motion-safe:animate-spin motion-reduce:animate-none" aria-hidden="true" />
                {t('Taslak hazırlanıyor…', 'Preparing draft…')}
              </span>
            ) : null}
            {aiDrafted ? (
              <span role="status" aria-live="polite" aria-atomic="true" className="text-sm text-brand">
                {t('AI önerisi alanlara yazıldı — gözden geçirin.', 'AI suggestions filled the fields — review them.')}
              </span>
            ) : null}
            {aiError ? (
              <span id="meta-ai-error" role="alert" className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {aiError}
              </span>
            ) : null}
            <span className="text-xs text-muted-foreground">{t('Hedef sayfadaki bilgilerden öneri üretir; AI kredisi kullanabilir.', 'Drafts from your landing page; may use AI credits.')}</span>
          </div>
        </div>
        <Field name="primaryText" label={t('Ana metin', 'Primary text')} error={errors.primaryText} className="md:col-span-2">
          <Textarea {...control('primaryText')} rows={3} value={form.primaryText} maxLength={META_PLAN_LIMITS.primaryText} className={highlightClass('primaryText')} onChange={(e) => set('primaryText', e.target.value)} />
        </Field>
        <Field name="headline" label={t('Başlık', 'Headline')} error={errors.headline}>
          <Input {...control('headline')} value={form.headline} maxLength={META_PLAN_LIMITS.headline} className={highlightClass('headline')} onChange={(e) => set('headline', e.target.value)} />
        </Field>
        <Field name="description" label={t('Açıklama (isteğe bağlı)', 'Description (optional)')} error={errors.description}>
          <Input {...control('description')} value={form.description} maxLength={META_PLAN_LIMITS.description} className={highlightClass('description')} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field name="cta" label={t('Harekete geçirici mesaj', 'Call to action')} error={errors.cta}>
          <select {...control('cta')} className={`${selectClass('cta')} ${highlightClass('cta') ?? ''}`} value={form.cta} onChange={(e) => set('cta', e.target.value as PlanContent['cta'])}>
            {META_CTA_OPTIONS.map((option) => <option key={option} value={option}>{META_CTA_LABELS[option]}</option>)}
          </select>
        </Field>
        <fieldset className="flex flex-col gap-2 md:col-span-2" aria-describedby={errors.optimizationGoal ? `${fieldId('optimizationGoal')}-error` : undefined}>
          <legend className="text-sm font-medium">{t('Optimizasyon', 'Optimization')}</legend>
          <div role="radiogroup" aria-label={t('Optimizasyon hedefi', 'Optimization goal')} aria-invalid={errors.optimizationGoal ? true : undefined} aria-describedby={errors.optimizationGoal ? `${fieldId('optimizationGoal')}-error` : undefined} className="flex flex-col gap-2">
            {META_OPTIMIZATION_GOALS.map((goal) => (
              <label key={goal} className="flex items-start gap-2 rounded-md border border-border p-3 text-sm">
                <input
                  id={goal === 'LANDING_PAGE_VIEWS' ? fieldId('optimizationGoal') : 'meta-field-optimizationGoal-link-clicks'}
                  type="radio"
                  name="meta-optimization-goal"
                  value={goal}
                  checked={form.optimizationGoal === goal}
                  aria-invalid={errors.optimizationGoal ? true : undefined}
                  aria-describedby={errors.optimizationGoal ? `${fieldId('optimizationGoal')}-error` : undefined}
                  className="mt-1 accent-primary"
                  onChange={() => set('optimizationGoal', goal)}
                />
                <span className="flex flex-col gap-1">
                  <span className="font-medium">
                    {goal === 'LANDING_PAGE_VIEWS'
                      ? t('Yönlendirme sayfası görüntülemeleri (önerilen)', 'Landing page views (recommended)')
                      : t('Bağlantı tıklamaları', 'Link clicks')}
                  </span>
                  {goal === 'LANDING_PAGE_VIEWS' ? (
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {t('Bu hedef için sitede Meta Pixel kurulu olmalı.', 'A Meta Pixel must be installed on the website for this goal.')}
                    </span>
                  ) : null}
                </span>
              </label>
            ))}
          </div>
          {errors.optimizationGoal ? <p id={`${fieldId('optimizationGoal')}-error`} className="text-sm text-destructive">{errors.optimizationGoal}</p> : null}
        </fieldset>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={form.utmTracking} onCheckedChange={(checked) => set('utmTracking', checked === true)} />
            {t('UTM etiketlerini ekle (önerilen)', 'Add UTM tags (recommended)')}
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('Meta, utm_source=facebook, utm_medium=paid_social ve kampanya/reklam adlarını hedef bağlantının mevcut parametrelerine dokunmadan ekler.', 'Meta appends utm_source=facebook, utm_medium=paid_social, and campaign/ad name tags without changing existing destination URL parameters.')}
          </p>
        </div>
        <Field name="dailyBudget" label={t(`Günlük bütçe (${connection.currency ?? ''})`, `Daily budget (${connection.currency ?? ''})`)} error={errors.dailyBudget}>
          <Input
            {...control('dailyBudget')}
            type="number"
            inputMode="decimal"
            min={minimumBudgetMinor !== null && currencyOffset ? minimumBudgetMinor / currencyOffset : 0}
            step={currencyOffset === 1 ? 1 : 0.01}
            value={form.dailyBudget}
            className={errors.dailyBudget ? 'border-destructive ring-2 ring-destructive/20' : undefined}
            aria-describedby={errors.dailyBudget ? `${fieldId('dailyBudget')}-error` : 'meta-minimum-budget-note'}
            onChange={(e) => set('dailyBudget', e.target.value)}
          />
          <span id="meta-minimum-budget-note" className="text-xs leading-relaxed text-muted-foreground">
            {minimumBudgetText
              ? t(`Meta’nın bu hesapta bağlantı tıklamaları için önerdiği günlük minimum: ${minimumBudgetText}. Ülke/hedefleme sınırını Meta doğrulaması uygular.`, `Meta’s account minimum for link clicks: ${minimumBudgetText} per day. Meta validation enforces country and targeting limits.`)
              : form.optimizationGoal === 'LANDING_PAGE_VIEWS'
                ? t('Meta bu hedef için doğrudan bir minimum alanı yayımlamıyor; kesin alt sınır plan doğrulamasında kontrol edilir.', 'Meta does not publish a directly mapped minimum for this goal; the plan check confirms the exact floor.')
                : t('Meta’nın hesap minimumu alınamadı; ülke ve hedefleme kuralları dahil kesin tutar plan doğrulamasında kontrol edilir.', 'The Meta account minimum is unavailable; the plan check confirms the exact amount, including country and targeting rules.')}
          </span>
        </Field>
        <Field name="countries" label={t('Ülkeler', 'Countries')} error={errors.countries} className="md:col-span-2" group>
          <MetaCountryPicker
            id={fieldId('countries')}
            value={form.countries}
            max={META_PLAN_LIMITS.maxCountries}
            isTr={isTr}
            invalid={Boolean(errors.countries)}
            labelledBy="meta-label-countries"
            describedBy={errors.countries ? `${fieldId('countries')}-error` : undefined}
            onChange={(next) => set('countries', next)}
          />
        </Field>
        <Field name="ageMin" label={t('Yaş (en az)', 'Min age')} error={errors.ageMin}>
          <Input {...control('ageMin')} type="number" min={META_PLAN_LIMITS.ageMin} max={META_PLAN_LIMITS.ageMax} value={form.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))} />
        </Field>
        <Field name="ageMax" label={t('Yaş (en çok)', 'Max age')} error={errors.ageMax}>
          <Input {...control('ageMax')} type="number" min={META_PLAN_LIMITS.ageMin} max={META_PLAN_LIMITS.ageMax} value={form.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))} />
        </Field>
        <Field name="advantageAudience" label={t('Yaş hedeflemesi', 'Age targeting')} error={errors.advantageAudience} className="md:col-span-2" group>
          <div id={fieldId('advantageAudience')} tabIndex={-1} role="group" aria-labelledby="meta-label-advantageAudience" aria-describedby={errors.advantageAudience ? `${fieldId('advantageAudience')}-error` : undefined} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={!form.advantageAudience}
                aria-invalid={errors.advantageAudience ? true : undefined}
                aria-describedby={errors.advantageAudience ? `${fieldId('advantageAudience')}-error` : undefined}
                onCheckedChange={(checked) => set('advantageAudience', checked !== true)}
              />
              <span>{t('Yaş aralığını kesin uygula (Advantage+ kitleyi kapat)', 'Apply the age range strictly (turn off Advantage+ audience)')}</span>
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {form.advantageAudience
                ? t('Advantage+ açıkken daha dar yaş aralığı öneri olarak iletilir; kesin sınırları uygulamak için kutuyu işaretleyin.', 'With Advantage+ on, a narrower age range is sent as a suggestion. Check the box to apply it as a strict limit.')
                : t('Advantage+ kapalı; seçtiğiniz en az ve en çok yaş kesin hedefleme sınırlarıdır.', 'Advantage+ is off; the selected minimum and maximum ages are strict targeting limits.')}
            </p>
          </div>
        </Field>
        <Field name="gender" label={t('Cinsiyet', 'Gender')} error={errors.gender}>
          <select {...control('gender')} className={selectClass('gender')} value={form.gender} onChange={(e) => set('gender', e.target.value as PlanContent['gender'])}>
            <option value="all">{t('Hepsi', 'All')}</option>
            <option value="male">{t('Erkek', 'Men')}</option>
            <option value="female">{t('Kadın', 'Women')}</option>
          </select>
        </Field>
        <Field name="endDate" label={t('Bitiş günü (isteğe bağlı)', 'End date (optional)')} error={errors.endDate}>
          <Input {...control('endDate')} type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
        </Field>
        <Field name="imagePath" label={t('Reklam görseli', 'Ad image')} error={errors.imagePath} className="md:col-span-2">
          <input
            {...control('imagePath')}
            ref={imageInputRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              selectImageFile(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          {!file && !plan?.hasStoredImage ? (
            <div
              role="group"
              aria-label={t('Reklam görseli yükleme alanı', 'Ad image upload area')}
              onDragOver={(event) => {
                event.preventDefault()
                if (!locked && busy === null) setIsDraggingImage(true)
              }}
              onDragLeave={(event) => {
                const nextTarget = event.relatedTarget
                if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) setIsDraggingImage(false)
              }}
              onDrop={(event) => {
                event.preventDefault()
                setIsDraggingImage(false)
                if (!locked && busy === null) selectImageFile(event.dataTransfer.files[0])
              }}
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-5 text-center transition-colors motion-reduce:transition-none ${errors.imagePath ? 'border-destructive bg-destructive/5' : isDraggingImage ? 'border-brand bg-muted/50' : 'border-border bg-muted/20'}`}
            >
              <button
                type="button"
                aria-label={t('Görsel seç veya buraya sürükle', 'Choose an image or drag it here')}
                aria-invalid={errors.imagePath ? true : undefined}
                aria-describedby={errors.imagePath ? `meta-image-help ${fieldId('imagePath')}-error` : 'meta-image-help'}
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ImagePlus className="size-7 text-muted-foreground" aria-hidden="true" />
                <span>{isDraggingImage ? t('Görseli buraya bırakın', 'Drop the image here') : t('Görsel seç veya buraya sürükle', 'Choose an image or drag it here')}</span>
              </button>
              <p id="meta-image-help" className="text-xs leading-relaxed text-muted-foreground">
                {t('JPG/PNG, 1:1 oran önerilir (1080×1080), en fazla 5 MB.', 'JPG/PNG, 1:1 ratio recommended (1080×1080), up to 5 MB.')}
              </p>
            </div>
          ) : null}
          {file ? (
            <div className={`flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 ${errors.imagePath ? 'border-destructive ring-2 ring-destructive/20' : 'border-border'}`}>
              {imagePreviewUrl ? <img src={imagePreviewUrl} alt={t('Seçilen reklam görselinin önizlemesi', 'Preview of the selected ad image')} className="size-16 rounded-md border border-border object-cover" /> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="break-all text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => imageInputRef.current?.click()}>
                  <ImagePlus data-icon="inline-start" aria-hidden="true" />
                  {t('Görseli değiştir', 'Change image')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t('Seçilen görseli kaldır', 'Remove selected image')}
                  onClick={() => {
                    setFile(null)
                    if (imageInputRef.current) imageInputRef.current.value = ''
                    setErrors((current) => ({ ...current, imagePath: undefined }))
                  }}
                >
                  <Trash2 data-icon="inline-start" aria-hidden="true" />
                  {plan?.hasStoredImage ? t('Kayıtlı görsele dön', 'Use saved image') : t('Kaldır', 'Remove')}
                </Button>
              </div>
            </div>
          ) : plan?.hasStoredImage ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
              {savedImagePreviewUrl && savedImagePreviewKey !== failedSavedPreviewKey ? (
                <img
                  key={savedImagePreviewKey}
                  src={savedImagePreviewUrl}
                  alt={t('Kayıtlı reklam görselinin önizlemesi', 'Preview of the saved ad image')}
                  onError={() => setFailedSavedPreviewKey(savedImagePreviewKey)}
                  className="size-16 rounded-md border border-border object-cover"
                />
              ) : (
                <div role="img" aria-label={t('Görsel önizlemesi yüklenemedi', 'Image preview could not be loaded')} className="flex size-16 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
                  {t('Önizleme yok', 'No preview')}
                </div>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Badge variant="secondary" className="w-fit">{t('Kayıtlı görsel', 'Saved image')}</Badge>
                <p className="break-all text-sm font-medium">{savedImageFilename}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => imageInputRef.current?.click()}>
                <ImagePlus data-icon="inline-start" aria-hidden="true" />
                {t('Görseli değiştir', 'Change image')}
              </Button>
            </div>
          ) : null}
        </Field>
      </fieldset>

      {isPartial && plan ? (
        <PartialCard
          plan={plan}
          failure={storedFailure}
          approved={approved}
          validated={validated}
          contentChanged={planContentChanged}
          busy={busy !== null}
          running={busy === 'publish'}
          onResume={onConfirmCreate}
          isTr={isTr}
        />
      ) : storedFailure ? (
        <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <p>{storedFailure.message}</p>
          {storedFailure.detail ? (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">{t('Teknik ayrıntı', 'Technical details')}</summary>
              <p className="mt-1 break-words">{storedFailure.detail}</p>
            </details>
          ) : null}
        </div>
      ) : null}

      {showApproval ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm leading-relaxed">{metaApprovalText(form, isTr ? 'tr' : 'en')}</p>
          {!approved ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} aria-describedby="meta-approval-hint" />
              {t('Okudum, onaylıyorum', 'I have read and approve')}
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">{t('Onayınız kaydedildi; tekrar onay gerekmez.', 'Your approval is saved; no need to approve again.')}</p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy !== null || (!approved && !terms)} onClick={onConfirmCreate}>
              {busy === 'publish'
                ? t('Oluşturuluyor…', 'Creating…')
                : approved
                  ? (plan?.status === 'failed' ? t('Tekrar dene', 'Try again') : t('Duraklatılmış olarak oluştur', 'Create paused'))
                  : t('Onayla ve duraklatılmış olarak oluştur', 'Approve and create paused')}
            </Button>
            {!approved && !terms ? (
              <span id="meta-approval-hint" className="text-xs text-muted-foreground">{t('Devam etmek için onay kutusunu işaretleyin.', 'Tick the box to continue.')}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      {plan?.status === 'archived' ? (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          {t('Meta’da silindi veya arşivlendi; plan arşivlendi.', 'Deleted or archived in Meta; the plan is archived.')}
        </p>
      ) : null}

      {plan?.objects.campaignId && ['published', 'user_paused', 'active'].includes(plan.status) ? (
        <MetaManageCard
          key={plan.id}
          plan={plan}
          campaignUrl={adsManagerUrl(connection.externalAccountId, plan.objects.campaignId)}
          canManage={manage.canManage}
          canManageProtective={manage.canManageProtective}
          hasManagementScope={connection.missingPublishScopes.length === 0}
          onChanged={() => mutate()}
          onGoToSettings={onGoToSettings}
        />
      ) : plan?.objects.campaignId ? (
        <a className="text-sm underline" target="_blank" rel="noopener noreferrer" href={adsManagerUrl(connection.externalAccountId, plan.objects.campaignId)}>
          {t('Meta Reklam Yöneticisi\'nde aç', 'Open in Meta Ads Manager')}
        </a>
      ) : null}

      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={onSaveDraft}>
            {t('Taslağı kaydet', 'Save draft')}
          </Button>
          <Button type="button" variant={showApproval ? 'outline' : 'default'} disabled={busy !== null} onClick={onSaveAndValidate}>
            {busy === 'validate' ? t('Doğrulanıyor…', 'Validating…') : t('Kaydet ve Meta ile doğrula', 'Save and validate with Meta')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function PageNeededCard({ names, onGoToSettings, isTr }: { names: string[]; onGoToSettings?: () => void; isTr: boolean }) {
  return (
    <div role="status" className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{isTr ? 'Önce sayfa seçin' : 'Choose a page first'}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isTr
            ? `Reklamlar bir Facebook Sayfası adına yayınlanır. ${names.join(', ')} bağlantısında sayfa seçili değil; Ayarlar sekmesinden hesabı yeniden bağlayıp bir sayfa seçin.`
            : `Ads run on behalf of a Facebook Page. No page is selected for ${names.join(', ')}; reconnect it from Settings and pick a page.`}
        </p>
      </div>
      {onGoToSettings ? (
        <Button type="button" variant="outline" size="sm" onClick={onGoToSettings}>{isTr ? 'Ayarlar\'a git' : 'Go to Settings'}</Button>
      ) : null}
    </div>
  )
}

function PartialCard({
  plan,
  failure,
  approved,
  validated,
  contentChanged,
  busy,
  running,
  onResume,
  isTr,
}: {
  plan: PlanView
  failure: { message: string; detail: string | null } | null
  approved: boolean
  validated: boolean
  contentChanged: boolean
  busy: boolean
  running: boolean
  onResume: () => void
  isTr: boolean
}) {
  const rows = describePlanObjects(plan.objects, plan.failureStep)
  const canResume = Boolean(plan.objects.campaignId) && validated && approved && !contentChanged
  const stateText = { ok: isTr ? 'Tamam' : 'Done', failed: isTr ? 'Başarısız' : 'Failed', missing: isTr ? 'Henüz oluşmadı' : 'Not created yet' }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{isTr ? 'Kampanya kısmen oluşturuldu' : 'Campaign partially created'}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isTr
            ? 'Oluşan parçalar Meta hesabınızda duraklatılmış durumda; harcama yapmaz.'
            : 'Created parts are paused in your Meta account and do not spend.'}
        </p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {isTr ? 'Devam, mevcut Meta kampanya kimliğiyle sürer; yeni kampanya oluşturmaz: ' : 'Continue resumes the existing Meta campaign; it will not create a new one: '}
          {plan.objects.campaignId ? <code className="break-all font-mono text-foreground">{plan.objects.campaignId}</code> : <span>{isTr ? 'kampanya kimliği henüz yok' : 'campaign ID not available'}</span>}
        </p>
      </div>
      <dl aria-label={isTr ? 'Devam edilecek kayıtlı plan özeti' : 'Saved plan summary for continuation'} className="grid gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{isTr ? 'Kayıtlı sürüm' : 'Saved version'}</dt>
          <dd className="font-medium">v{plan.version}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{isTr ? 'Yaş aralığı' : 'Age range'}</dt>
          <dd className="font-medium">{plan.content.ageMin}–{plan.content.ageMax}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{isTr ? 'Günlük bütçe' : 'Daily budget'}</dt>
          <dd className="font-medium">{formatPlanBudget(plan.content.dailyBudget, plan.currency, isTr)}</dd>
        </div>
      </dl>
      {!validated || !approved || contentChanged ? (
        <p role="note" className="rounded-md border border-brand/30 bg-muted/40 p-3 text-sm leading-relaxed">
          {contentChanged
            ? isTr
              ? 'Formdaki değişiklikler kaydedilmedi. Önce \'Kaydet ve Meta ile doğrula\'ya basın, sonra onaylayıp devam edin.'
              : 'Changes in the form are not saved. First select “Save and validate with Meta”, then approve and continue.'
            : isTr
              ? 'Kayıtlı plan sürümünün Meta doğrulaması veya onayı güncel değil. Devam etmeden önce planı yeniden doğrulayıp onaylayın.'
              : 'The saved plan version is no longer validated or approved. Validate it with Meta and approve it again before continuing.'}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5" aria-label={isTr ? 'Oluşturulan nesneler' : 'Created objects'}>
        {rows.map((row) => (
          <li key={row.step} className="flex items-center gap-2 text-sm">
            {row.state === 'ok' ? <CheckCircle2 className="size-4 text-brand" aria-hidden="true" /> : row.state === 'failed' ? <XCircle className="size-4 text-destructive" aria-hidden="true" /> : <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />}
            <span>{row.label}</span>
            <span className={row.state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>{stateText[row.state]}</span>
          </li>
        ))}
      </ul>
      {failure ? (
        <div className="text-sm text-destructive">
          <p>{failure.message}</p>
          {failure.detail ? (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer">{isTr ? 'Teknik ayrıntı' : 'Technical details'}</summary>
              <p className="mt-1 break-words">{failure.detail}</p>
            </details>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || !canResume} onClick={onResume}>
          {running ? (isTr ? 'Devam ediyor…' : 'Continuing…') : (isTr ? 'Devam et' : 'Continue')}
        </Button>
      </div>
    </div>
  )
}

function Field({
  name,
  label,
  error,
  className,
  group,
  children,
}: {
  name: MetaFieldName
  label: string
  error?: string
  className?: string
  group?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      {group ? (
        <span id={`meta-label-${name}`} className="text-sm font-medium">{label}</span>
      ) : (
        <Label htmlFor={fieldId(name)}>{label}</Label>
      )}
      {children}
      {error ? (
        <p id={`${fieldId(name)}-error`} className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
