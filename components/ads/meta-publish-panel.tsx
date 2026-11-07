'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { useLanguage } from '@/components/language-provider'
import type { MetaConnectionView } from '@/lib/ads/meta-ads-shared'
import {
  META_APPROVAL_TEXT,
  META_COUNTRIES,
  META_CTA_LABELS,
  META_CTA_OPTIONS,
  META_PLAN_LIMITS,
  adsManagerUrl,
  type MetaCta,
  type MetaGender,
} from '@/lib/ads/meta-publish-plan'

type PlanContent = {
  name: string
  landingUrl: string
  primaryText: string
  headline: string
  description: string
  cta: MetaCta
  countries: string[]
  ageMin: number
  ageMax: number
  gender: MetaGender
  dailyBudget: number | string
  endDate: string | null
  imagePath: string | null
  specialTopic: 'none'
}

type PlanView = {
  id: string
  connectionId: string
  status: string
  version: number
  content: PlanContent
  currency: string
  approvedVersion: number | null
  validatedVersion: number | null
  objects: { campaignId: string | null; adId: string | null }
  failureReason: string | null
}

type ApiResult<T> = { ok: true } & T
type ApiError = { ok: false; error: string; message?: string; metaReason?: string | null; fieldErrors?: Record<string, string>; blocked?: string[]; stepLabel?: string }

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
  gender: 'all',
  dailyBudget: '',
  endDate: null,
  imagePath: null,
  specialTopic: 'none',
}

const listFetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((response) => response.json())

async function post<T>(url: string, body: unknown): Promise<ApiResult<T> | ApiError> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return (await response.json()) as ApiResult<T> | ApiError
  } catch {
    return { ok: false, error: 'network_error' }
  }
}

function describeError(error: ApiError): string {
  const parts = [error.stepLabel ? `${error.stepLabel}: ` : '', error.message ?? '']
  if (!error.message) {
    if (error.fieldErrors) return Object.values(error.fieldErrors).join(' · ')
    if (error.blocked?.length) return `Reklam metni izin verilmeyen ifade içeriyor: ${error.blocked.join(', ')}`
    parts.push(error.error)
  }
  return parts.join('') + (error.metaReason ? ` (Meta: ${error.metaReason})` : '')
}

export function MetaPublishPanel({ connections, publishEnabled }: { connections: MetaConnectionView[]; publishEnabled: boolean }) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const t = (tr: string, en: string) => (isTr ? tr : en)

  const publishable = useMemo(
    () => connections.filter((c) => c.status === 'active' && c.hasPage && c.missingPublishScopes.length === 0),
    [connections],
  )
  const [connectionId, setConnectionId] = useState<string | null>(publishable[0]?.id ?? null)
  const connection = connections.find((c) => c.id === connectionId) ?? null

  const { data, mutate } = useSWR<{ ok: boolean; plans?: PlanView[] }>(
    connectionId && publishEnabled ? `/api/ads/meta/plans?connectionId=${connectionId}` : null,
    listFetcher,
  )
  const plans = data?.plans ?? []

  const [planId, setPlanId] = useState<string | null>(null)
  const plan = plans.find((p) => p.id === planId) ?? null
  const [form, setForm] = useState<PlanContent>(EMPTY)
  const [file, setFile] = useState<File | null>(null)
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!publishEnabled) {
    return (
      <section className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        {t('Meta reklam yayınlama bu hesap için henüz açık değil.', 'Meta ad publishing is not enabled for this account yet.')}
      </section>
    )
  }

  if (!connection) {
    const needsPermission = connections.some((c) => c.status === 'active' && c.missingPublishScopes.length > 0)
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-dashed border-border p-6">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {needsPermission
            ? t('Duraklatılmış kampanya oluşturmak için Ayarlar sekmesinden yönetim iznini verin. Bağladığınız hesapta bir Facebook Sayfası da olmalıdır.', 'Grant the management permission from Settings to create paused campaigns. The account also needs a Facebook Page.')
            : t('Önce Ayarlar sekmesinden bir Meta reklam hesabı bağlayın.', 'Connect a Meta ad account from Settings first.')}
        </p>
      </section>
    )
  }

  const set = <K extends keyof PlanContent>(key: K, value: PlanContent[K]) => setForm((f) => ({ ...f, [key]: value }))
  const fail = (error: ApiError) => setNotice({ tone: 'error', text: describeError(error) })

  function openPlan(next: PlanView | null) {
    setPlanId(next?.id ?? null)
    setForm(next ? next.content : EMPTY)
    setFile(null)
    setTerms(false)
    setNotice(null)
  }

  async function save(): Promise<PlanView | null> {
    const result = await post<{ plan: PlanView }>('/api/ads/meta/plans', { connectionId, planId: planId ?? undefined, content: form })
    if (!result.ok) { fail(result); return null }
    setPlanId(result.plan.id)
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
    if (!response?.ok) { fail(response ?? { ok: false, error: 'network_error' }); return false }
    setFile(null)
    return true
  }

  const onSaveAndValidate = () =>
    run('validate', async () => {
      const saved = await save()
      if (!saved || !(await uploadImage(saved.id))) return null
      const result = await post<{ checked: string[] }>('/api/ads/meta/plans/validate', { planId: saved.id })
      await mutate()
      if (!result.ok) { fail(result); return null }
      return t('Meta doğrulaması geçti. Onay adımına geçebilirsiniz; hiçbir şey oluşturulmadı.', 'Meta validation passed. You can approve now; nothing was created yet.')
    })

  const onApprove = () =>
    run('approve', async () => {
      if (!plan) return null
      const result = await post('/api/ads/meta/plans/approval', { planId: plan.id, expectedVersion: plan.version, termsAccepted: terms })
      await mutate()
      if (!result.ok) { fail(result); return null }
      return t('Onaylandı. Şimdi duraklatılmış olarak oluşturabilirsiniz.', 'Approved. You can now create it paused.')
    })

  const onPublish = () =>
    run('publish', async () => {
      if (!plan) return null
      const result = await post('/api/ads/meta/plans/publish', { planId: plan.id, requestId: crypto.randomUUID() })
      await mutate()
      if (!result.ok) { fail(result); return null }
      return t('Kampanya Meta hesabınızda DURAKLATILMIŞ olarak oluşturuldu. Başlatmak için Meta Reklam Yöneticisi\'ni kullanın.', 'Campaign created PAUSED in your Meta account. Start it from Meta Ads Manager.')
    })

  const stage = plan?.status ?? 'new'
  const locked = ['publishing', 'published', 'active', 'user_paused', 'archived'].includes(stage)
  const validated = plan !== null && plan.validatedVersion === plan.version
  const approved = plan !== null && plan.approvedVersion === plan.version

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meta-publish-title">
      <div className="flex flex-col gap-1">
        <h2 id="meta-publish-title" className="text-xl font-semibold tracking-tight">{t('Duraklatılmış Meta kampanyası', 'Paused Meta campaign')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('Kampanya her zaman DURAKLATILMIŞ oluşturulur ve siz Meta Reklam Yöneticisi\'nden başlatana kadar harcama yapmaz.', 'Campaigns are always created PAUSED and never spend until you start them in Meta Ads Manager.')}
        </p>
      </div>

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
        <ul className="flex flex-wrap gap-2" aria-label={t('Planlar', 'Plans')}>
          {plans.map((p) => (
            <li key={p.id}>
              <Button type="button" size="sm" variant={p.id === planId ? 'default' : 'outline'} onClick={() => openPlan(p)}>
                {p.content.name || t('Adsız', 'Untitled')} · {p.status}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset disabled={locked || busy !== null} className="grid gap-4 md:grid-cols-2">
        <Field label={t('Kampanya adı', 'Campaign name')} className="md:col-span-2">
          <Input value={form.name} maxLength={META_PLAN_LIMITS.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={t('Hedef sayfa (https)', 'Landing page (https)')} className="md:col-span-2">
          <Input type="url" inputMode="url" value={form.landingUrl} maxLength={META_PLAN_LIMITS.landingUrl} onChange={(e) => set('landingUrl', e.target.value)} />
        </Field>
        <Field label={t('Ana metin', 'Primary text')} className="md:col-span-2">
          <Textarea rows={3} value={form.primaryText} maxLength={META_PLAN_LIMITS.primaryText} onChange={(e) => set('primaryText', e.target.value)} />
        </Field>
        <Field label={t('Başlık', 'Headline')}>
          <Input value={form.headline} maxLength={META_PLAN_LIMITS.headline} onChange={(e) => set('headline', e.target.value)} />
        </Field>
        <Field label={t('Açıklama (isteğe bağlı)', 'Description (optional)')}>
          <Input value={form.description} maxLength={META_PLAN_LIMITS.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <Field label={t('Harekete geçirici mesaj', 'Call to action')}>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.cta} onChange={(e) => set('cta', e.target.value as MetaCta)}>
            {META_CTA_OPTIONS.map((option) => <option key={option} value={option}>{META_CTA_LABELS[option]}</option>)}
          </select>
        </Field>
        <Field label={t(`Günlük bütçe (${connection.currency ?? ''})`, `Daily budget (${connection.currency ?? ''})`)}>
          <Input type="number" inputMode="decimal" min="0" step="0.01" value={form.dailyBudget} onChange={(e) => set('dailyBudget', e.target.value)} />
        </Field>
        <Field label={t('Ülkeler', 'Countries')} className="md:col-span-2">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {META_COUNTRIES.map((country) => (
              <label key={country.code} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={form.countries.includes(country.code)}
                  onCheckedChange={(checked) =>
                    set('countries', checked ? [...form.countries, country.code].slice(0, META_PLAN_LIMITS.maxCountries) : form.countries.filter((c) => c !== country.code))
                  }
                />
                {country.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label={t('Yaş (en az)', 'Min age')}>
          <Input type="number" min={META_PLAN_LIMITS.ageMin} max={META_PLAN_LIMITS.ageMax} value={form.ageMin} onChange={(e) => set('ageMin', Number(e.target.value))} />
        </Field>
        <Field label={t('Yaş (en çok)', 'Max age')}>
          <Input type="number" min={META_PLAN_LIMITS.ageMin} max={META_PLAN_LIMITS.ageMax} value={form.ageMax} onChange={(e) => set('ageMax', Number(e.target.value))} />
        </Field>
        <Field label={t('Cinsiyet', 'Gender')}>
          <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.gender} onChange={(e) => set('gender', e.target.value as MetaGender)}>
            <option value="all">{t('Hepsi', 'All')}</option>
            <option value="male">{t('Erkek', 'Men')}</option>
            <option value="female">{t('Kadın', 'Women')}</option>
          </select>
        </Field>
        <Field label={t('Bitiş günü (isteğe bağlı)', 'End date (optional)')}>
          <Input type="date" value={form.endDate ?? ''} onChange={(e) => set('endDate', e.target.value || null)} />
        </Field>
        <Field label={t('Görsel (JPG/PNG, en çok 5 MB)', 'Image (JPG/PNG, max 5 MB)')} className="md:col-span-2">
          <Input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {form.imagePath && !file ? <span className="text-xs text-muted-foreground">{t('Görsel yüklendi.', 'Image uploaded.')}</span> : null}
        </Field>
      </fieldset>

      {notice ? (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive' : 'rounded-lg border border-border bg-card p-3 text-sm'}>
          {notice.text}
        </p>
      ) : null}
      {plan?.failureReason && !notice ? <p className="text-sm text-destructive">{plan.failureReason}</p> : null}

      {validated && !locked ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm leading-relaxed">{META_APPROVAL_TEXT}</p>
          {!approved ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={terms} onCheckedChange={(v) => setTerms(v === true)} />
              {t('Okudum, onaylıyorum', 'I have read and approve')}
            </label>
          ) : null}
        </div>
      ) : null}

      {plan?.objects.campaignId ? (
        <a className="text-sm underline" target="_blank" rel="noopener noreferrer" href={adsManagerUrl(connection.externalAccountId, plan.objects.campaignId)}>
          {t('Meta Reklam Yöneticisi\'nde aç', 'Open in Meta Ads Manager')}
        </a>
      ) : null}

      {!locked ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void run('save', async () => ((await save()) ? t('Taslak kaydedildi.', 'Draft saved.') : null))}>
            {t('Taslağı kaydet', 'Save draft')}
          </Button>
          <Button type="button" disabled={busy !== null} onClick={() => void onSaveAndValidate()}>
            {busy === 'validate' ? t('Doğrulanıyor…', 'Validating…') : t('Kaydet ve Meta ile doğrula', 'Save and validate with Meta')}
          </Button>
          {validated && !approved ? (
            <Button type="button" disabled={!terms || busy !== null} onClick={() => void onApprove()}>{t('Onayla', 'Approve')}</Button>
          ) : null}
          {approved ? (
            <Button type="button" disabled={busy !== null} onClick={() => void onPublish()}>
              {busy === 'publish' ? t('Oluşturuluyor…', 'Creating…') : t('Duraklatılmış olarak oluştur', 'Create paused')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
