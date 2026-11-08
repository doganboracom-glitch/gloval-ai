'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { AlertCircle, CheckCircle2, ExternalLink, Pause, Play, RefreshCw } from 'lucide-react'
import { MetaPlanStatusChip } from '@/components/ads/meta-plan-status'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { MetaLiveState } from '@/lib/ads/meta-manage'
import { requestMetaPlanSync } from '@/lib/ads/meta-overview-refresh'
import {
  classifyBudgetChange,
  describeMetaManageError,
  formatMetaMoney,
  manageNeedsConsent,
  metaEffectiveStatusNote,
  metaManageVisibility,
  metaSpendConsentText,
  parseBudgetInput,
  type MetaManageAction,
} from '@/lib/ads/meta-manage-ux'

export type MetaManagedPlan = {
  id: string
  status: string
  currency: string
  dailyBudgetMinor: number | null
  effectiveStatus: string | null
  lastSyncedAt: string | null
  live: MetaLiveState | null
  content: { name: string }
}

type ManageResponse =
  | { ok: true; plan: MetaManagedPlan | null; live?: MetaLiveState | null; verified?: boolean; alreadyApplied?: boolean }
  | { ok: false; error?: string; message?: string | null; plan?: MetaManagedPlan | null; live?: MetaLiveState | null; unknown?: boolean }

type SyncResponse = { ok: boolean; plan?: MetaManagedPlan | null; live?: MetaLiveState | null; drift?: boolean }

type Notice = { tone: 'ok' | 'error'; text: string }

async function postJson<T extends { ok: boolean }>(url: string, body: unknown): Promise<T> {
  try {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return (await response.json()) as T
  } catch {
    return { ok: false, error: 'network_error' } as unknown as T
  }
}

export function MetaManageCard({
  plan,
  campaignUrl,
  canManage,
  canManageProtective,
  hasManagementScope,
  onChanged,
  onGoToSettings,
}: {
  plan: MetaManagedPlan
  campaignUrl: string | null
  canManage: boolean
  canManageProtective: boolean
  hasManagementScope: boolean
  onChanged: () => void | Promise<unknown>
  onGoToSettings?: () => void
}) {
  const [busy, setBusy] = useState<MetaManageAction | 'sync' | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [confirming, setConfirming] = useState<'activate' | null>(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [consent, setConsent] = useState(false)

  const { data: synced, mutate: mutateSync, isValidating } = useSWR<SyncResponse>(
    ['meta-sync', plan.id],
    () => requestMetaPlanSync(plan.id) as Promise<SyncResponse>,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  )

  const current: MetaManagedPlan = synced?.ok && synced.plan ? { ...synced.plan, live: synced.live ?? synced.plan.live } : plan
  const live = current.live
  const visibility = metaManageVisibility({ status: current.status, canManage, canManageProtective, hasManagementScope })
  const note = current.status === 'active' ? metaEffectiveStatusNote(current.effectiveStatus, live?.ad.reviewFeedback) : null

  const budgetParsed = budgetInput.trim() ? parseBudgetInput(budgetInput, current.currency) : null
  const budgetChange = budgetParsed?.ok ? classifyBudgetChange(current.dailyBudgetMinor, budgetParsed.minor) : null
  const budgetNeedsConsent = budgetChange ? manageNeedsConsent('budget', budgetChange) : false
  const budgetBlocked = budgetChange === 'increase' && visibility.budgetDecreaseOnly

  if (!visibility.managed) return null

  async function refresh() {
    setBusy('sync')
    setNotice(null)
    await mutateSync()
    setBusy(null)
  }

  async function runAction(action: MetaManageAction, extra: { dailyBudget?: string; termsAccepted?: boolean }) {
    setBusy(action)
    setNotice(null)
    const result = await postJson<ManageResponse>('/api/ads/meta/plans/manage', {
      planId: plan.id,
      requestId: crypto.randomUUID(),
      action,
      ...extra,
    })
    setBusy(null)
    if (result.ok) {
      await mutateSync({ ok: true, plan: result.plan, live: result.live ?? result.plan?.live ?? null }, { revalidate: false })
      await onChanged()
      setConfirming(null)
      setConsent(false)
      setBudgetInput('')
      const text = action === 'activate'
        ? 'Kampanya etkinleştirildi. Reklam Meta incelemesinden geçtikten sonra gösterilmeye başlar.'
        : action === 'pause'
          ? 'Kampanya duraklatıldı. Yeni harcama yapılmaz.'
          : 'Günlük bütçe güncellendi.'
      setNotice({ tone: 'ok', text: result.verified === false ? `${text} Meta tarafındaki durum henüz doğrulanamadı.` : text })
      return
    }
    if (result.plan) await mutateSync({ ok: true, plan: result.plan, live: result.live ?? result.plan.live }, { revalidate: false })
    await onChanged()
    setNotice({ tone: 'error', text: describeMetaManageError(result) })
  }

  const budgetText = formatMetaMoney(current.dailyBudgetMinor, current.currency)
  const spend = live?.spend ?? null

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4" aria-labelledby="meta-manage-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 id="meta-manage-title" className="text-sm font-semibold">Kampanya yönetimi</h3>
          <MetaPlanStatusChip plan={{ status: current.status, effectiveStatus: current.effectiveStatus }} />
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy !== null || isValidating}>
          <RefreshCw className="size-4" aria-hidden="true" />
          {busy === 'sync' || isValidating ? 'Güncelleniyor…' : 'Durumu yenile'}
        </Button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Günlük bütçe</dt>
          <dd className="font-medium">{budgetText}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Bugünkü harcama</dt>
          <dd className="font-medium">{spend?.todayMajor != null ? formatMetaMoney(Math.round(spend.todayMajor * 100), current.currency) : '-'}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Son 7 gün</dt>
          <dd className="font-medium">
            {spend?.last7DaysMajor != null ? formatMetaMoney(Math.round(spend.last7DaysMajor * 100), current.currency) : '-'}
            {spend?.impressions7Days != null ? <span className="ml-1 text-xs font-normal text-muted-foreground">· {spend.impressions7Days.toLocaleString('tr-TR')} gösterim</span> : null}
          </dd>
        </div>
      </dl>

      {note ? (
        <p role="status" className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {note}
        </p>
      ) : null}

      {synced && synced.ok === false ? (
        <p role="status" className="text-xs text-muted-foreground">Meta durumu şu an okunamadı; son kayıtlı bilgi gösteriliyor.</p>
      ) : null}

      {visibility.needsPermission ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="leading-relaxed text-muted-foreground">Kampanyayı buradan yönetmek için Meta yönetim izni gerekli.</p>
          {onGoToSettings ? <Button type="button" size="sm" variant="outline" onClick={onGoToSettings}>Ayarlar&apos;a git</Button> : null}
        </div>
      ) : null}

      {visibility.activate || visibility.pause ? (
        <div className="flex flex-wrap gap-2">
          {visibility.activate ? (
            <Button type="button" disabled={busy !== null} onClick={() => { setConfirming(confirming ? null : 'activate'); setConsent(false); setNotice(null) }}>
              <Play className="size-4" aria-hidden="true" />
              Kampanyayı etkinleştir
            </Button>
          ) : null}
          {visibility.pause && current.status === 'active' ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => void runAction('pause', {})}>
              <Pause className="size-4" aria-hidden="true" />
              {busy === 'pause' ? 'Duraklatılıyor…' : 'Duraklat'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {confirming === 'activate' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-brand/40 p-3">
          <p className="text-sm leading-relaxed">{metaSpendConsentText(current.dailyBudgetMinor, current.currency, 'activate')}</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            Okudum, harcamayı onaylıyorum
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!consent || busy !== null} onClick={() => void runAction('activate', { termsAccepted: true })}>
              {busy === 'activate' ? 'Etkinleştiriliyor…' : 'Onayla ve etkinleştir'}
            </Button>
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setConfirming(null)}>Vazgeç</Button>
          </div>
        </div>
      ) : null}

      {visibility.budget ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-manage-budget">
            Yeni günlük bütçe ({current.currency}){visibility.budgetDecreaseOnly ? ' · yalnızca düşürülebilir' : ''}
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="meta-manage-budget"
              className="w-40"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={budgetInput}
              onChange={(e) => { setBudgetInput(e.target.value); setConsent(false) }}
              aria-invalid={budgetParsed && !budgetParsed.ok ? true : undefined}
              aria-describedby="meta-manage-budget-hint"
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null || !budgetParsed?.ok || budgetChange === 'same' || budgetBlocked || (budgetNeedsConsent && !consent)}
              onClick={() => void runAction('budget', { dailyBudget: budgetInput.trim(), termsAccepted: budgetNeedsConsent ? true : undefined })}
            >
              {busy === 'budget' ? 'Güncelleniyor…' : 'Bütçeyi güncelle'}
            </Button>
          </div>
          <p id="meta-manage-budget-hint" className="text-xs text-muted-foreground">
            {budgetParsed && !budgetParsed.ok
              ? budgetParsed.error
              : budgetBlocked
                ? 'Bütçeyi artırmak için tam yönetim izni gerekir.'
                : budgetChange === 'same'
                  ? 'Yeni bütçe mevcut bütçeyle aynı.'
                  : 'Bütçeyi düşürmek harcamayı artırmaz; artırmak onay gerektirir.'}
          </p>
          {budgetNeedsConsent && !budgetBlocked && budgetParsed?.ok ? (
            <label className="flex items-start gap-2 text-sm leading-relaxed">
              <Checkbox className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
              {metaSpendConsentText(budgetParsed.minor, current.currency, 'budget')}
            </label>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${notice.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-border'}`}
        >
          {notice.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {notice.text}
        </p>
      ) : null}

      {campaignUrl ? (
        <a className="inline-flex items-center gap-1 text-sm underline" target="_blank" rel="noopener noreferrer" href={campaignUrl}>
          Meta Reklam Yöneticisi&apos;nde aç
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      ) : null}
    </section>
  )
}
