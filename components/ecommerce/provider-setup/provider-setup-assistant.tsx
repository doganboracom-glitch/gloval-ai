'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'
import {
  isReadinessGreen,
  shouldShowInstantForm,
  type Lang,
  type ProviderMarker,
  type ProviderReadinessItem,
  type ProviderSettingsView,
  type ProviderSetupConfig,
} from '@/lib/payment-providers/types'
import { useProviderSetup } from '@/components/ecommerce/provider-setup/use-provider-setup'
import { ProviderKeysForm } from '@/components/ecommerce/provider-setup/provider-keys-form'
import { ProviderHelpForm } from '@/components/ecommerce/provider-setup/provider-help-form'

const copy = {
  tr: {
    title: (name: string) => `${name} başvuru asistanı`,
    step1: 'Siteni hazırla',
    step2: (name: string) => `${name}\u2019a başvur`,
    step3: 'API anahtarlarını gir',
    recheck: 'Yeniden kontrol et',
    checking: 'Kontrol ediliyor…',
    allGood: 'Site başvuruya hazır görünüyor.',
    someMissing: 'Eksikleri tamamlayıp yeniden kontrol et.',
    notReadyWarning: 'Hazırlık kontrolünde eksikler var. Başvurabilirsin, ancak eksikler incelemede sorun çıkarabilir.',
    applied: 'Başvurumu yaptım',
    appliedDone: 'Başvuru yapıldı olarak işaretlendi',
    undo: 'Geri al',
    opened: (name: string) => `${name} hesabım açıldı`,
    openedDone: 'Hesap açıldı olarak işaretlendi',
    openDesign: 'Tasarım sekmesini aç',
    ok: ' tamam',
    missing: ' eksik',
    loadFail: 'Başvuru asistanı yüklenemedi.',
    retry: 'Tekrar dene',
    saveFail: 'Kaydedilemedi, tekrar dene.',
  },
  en: {
    title: (name: string) => `${name} application assistant`,
    step1: 'Get your site ready',
    step2: (name: string) => `Apply at ${name}`,
    step3: 'Enter your API keys',
    recheck: 'Check again',
    checking: 'Checking…',
    allGood: 'Your site looks ready for the application.',
    someMissing: 'Complete what is missing, then check again.',
    notReadyWarning: 'The readiness check has gaps. You can still apply, but gaps may cause trouble in the review.',
    applied: 'I have applied',
    appliedDone: 'Marked as applied',
    undo: 'Undo',
    opened: (name: string) => `My ${name} account is open`,
    openedDone: 'Marked as account open',
    openDesign: 'Open the Design tab',
    ok: ' ok',
    missing: ' missing',
    loadFail: 'The application assistant could not be loaded.',
    retry: 'Retry',
    saveFail: 'Could not save, try again.',
  },
}

function StepHeading({ index, title, done }: { index: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <CheckCircle2 className="size-4" /> : index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
    </div>
  )
}

function ReadinessRow({
  config,
  item,
  lang,
  onOpenDesign,
}: {
  config: ProviderSetupConfig
  item: ProviderReadinessItem
  lang: Lang
  onOpenDesign?: () => void
}) {
  const c = copy[lang]
  const label = config.readiness.labels[item.id]?.[lang] ?? item.id
  const problem = item.problem ? config.readiness.problems[item.problem]?.[lang] : undefined
  const fix = config.readiness.fixes[item.fix]
  return (
    <li className="flex items-start gap-2 text-sm">
      {item.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <div className="min-w-0">
        <p className={item.ok ? '' : 'font-medium'}>
          {label}
          <span className="sr-only">{item.ok ? c.ok : c.missing}</span>
        </p>
        {!item.ok && problem && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {problem} {fix?.hint[lang]}
            {fix?.opensDesign && onOpenDesign && (
              <>
                {' '}
                <button type="button" onClick={onOpenDesign} className="text-brand underline underline-offset-2">
                  {c.openDesign}
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  )
}

/**
 * Provider-independent setup flow: 1. prepare the site, 2. apply, 3. enter and
 * test the keys, as one continuous sequence. Everything provider-specific
 * comes from `config`; the key fields in step 3 are the same
 * `ProviderKeysForm` the payment settings use (there is no second copy).
 */
export function ProviderSetupAssistant({
  config,
  projectId,
  lang,
  onOpenDesign,
  recheckKey = 0,
  onSettingsChanged,
}: {
  config: ProviderSetupConfig
  projectId: string
  lang: Lang
  onOpenDesign?: () => void
  /** Bumped after saved site content changes; a new key re-runs the check automatically. */
  recheckKey?: number
  onSettingsChanged?: (settings: ProviderSettingsView) => void
}) {
  const c = copy[lang]
  const { data, error, isValidating, mutate } = useProviderSetup(config, projectId, recheckKey)
  const useInstantEnabled = config.apply.instant?.useEnabled ?? useNoInstant
  const instantEnabled = useInstantEnabled(projectId) === true
  const [markerBusy, setMarkerBusy] = useState<ProviderMarker | null>(null)
  const [markerError, setMarkerError] = useState(false)

  async function toggle(marker: ProviderMarker, value: boolean) {
    setMarkerBusy(marker)
    setMarkerError(false)
    try {
      const result = await config.setMarker(projectId, marker, value)
      if (result.ok) {
        await mutate((prev) => (prev ? { ...prev, state: result.state } : prev), { revalidate: false })
      } else setMarkerError(true)
    } catch {
      setMarkerError(true)
    } finally {
      setMarkerBusy(null)
    }
  }

  if (error && !data) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
        <p className="text-destructive">{c.loadFail}</p>
        <button type="button" onClick={() => void mutate()} className="self-start text-brand underline underline-offset-2">
          {c.retry}
        </button>
      </section>
    )
  }
  if (!data) {
    return (
      <section className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" /> {c.checking}
      </section>
    )
  }

  const ready = isReadinessGreen(data.readiness)
  const fieldKeys = config.keys.fields.map((f) => f.key)
  const showInstant =
    instantEnabled && shouldShowInstantForm(data.settings, config.keys.liveEnvironment, fieldKeys)
  const InstantForm = config.apply.instant?.Form

  return (
    <section aria-labelledby={`${config.id}-setup-title`} className="flex flex-col gap-4">
      <div>
        <h2 id={`${config.id}-setup-title`} className="text-sm font-semibold">{c.title(config.name)}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{config.copy.intro[lang]}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <StepHeading index={1} title={c.step1} done={ready} />
        <p className="text-xs leading-relaxed text-muted-foreground">{config.copy.prepareDescription[lang]}</p>
        <ul className="flex flex-col gap-2">
          {data.readiness.map((item) => (
            <ReadinessRow key={item.id} config={config} item={item} lang={lang} onOpenDesign={onOpenDesign} />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? c.checking : c.recheck}
          </button>
          <p role="status" className="text-xs text-muted-foreground">{ready ? c.allGood : c.someMissing}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <StepHeading index={2} title={c.step2(config.name)} done={Boolean(data.state.appliedAt)} />
        {!ready && (
          <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {c.notReadyWarning}
          </p>
        )}
        <div className={`flex flex-col gap-2 transition-opacity ${ready ? '' : 'opacity-70 focus-within:opacity-100 hover:opacity-100'}`}>
          <p className="text-xs text-muted-foreground">{config.copy.applyDescription[lang]}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {config.documents.map((doc) => (
              <li key={doc.key} className="flex items-start gap-2">
                <Circle className="mt-1.5 size-2 shrink-0 fill-current text-muted-foreground" aria-hidden />
                {doc.label[lang]}
              </li>
            ))}
          </ul>
          {showInstant && InstantForm && (
            <InstantForm projectId={projectId} onSubmitted={() => void toggle('applied', true)} />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={config.apply.manualUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={
                showInstant
                  ? 'inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground'
                  : 'inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'
              }
            >
              {showInstant ? config.copy.applyManualLabel[lang] : config.copy.applyLabel[lang]}
              <ExternalLink className="size-4" aria-hidden />
            </a>
            {data.state.appliedAt ? (
              <>
                <span className="text-xs text-emerald-600 dark:text-emerald-400">{c.appliedDone}</span>
                <button type="button" disabled={markerBusy !== null} onClick={() => void toggle('applied', false)} className="text-xs text-muted-foreground underline underline-offset-2">
                  {c.undo}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={markerBusy !== null}
                onClick={() => void toggle('applied', true)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
              >
                {c.applied}
              </button>
            )}
          </div>
          <ProviderHelpForm
            config={config}
            projectId={projectId}
            overview={data}
            lang={lang}
            collapsedByDefault={showInstant && Boolean(InstantForm)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
        <StepHeading index={3} title={c.step3} done={data.settings.tested} />
        <p className="text-xs leading-relaxed text-muted-foreground">{config.copy.keysDescription[lang]}</p>
        <div className="flex flex-wrap items-center gap-2">
          {data.state.accountOpenedAt ? (
            <>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{c.openedDone}</span>
              <button type="button" disabled={markerBusy !== null} onClick={() => void toggle('account_opened', false)} className="text-xs text-muted-foreground underline underline-offset-2">
                {c.undo}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={markerBusy !== null}
              onClick={() => void toggle('account_opened', true)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {c.opened(config.name)}
            </button>
          )}
        </div>
        {markerError && <p role="alert" className="text-xs text-destructive">{c.saveFail}</p>}
        <ProviderKeysForm
          config={config}
          projectId={projectId}
          lang={lang}
          settings={data.settings}
          onChanged={(settings) => {
            void mutate((prev) => (prev ? { ...prev, settings } : prev), { revalidate: false })
            onSettingsChanged?.(settings)
          }}
        />
      </div>
    </section>
  )
}

function useNoInstant(): boolean {
  return false
}
