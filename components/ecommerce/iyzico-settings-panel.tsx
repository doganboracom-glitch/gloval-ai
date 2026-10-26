'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { IyzicoInstantCard } from '@/components/ecommerce/iyzico-instant-card'
import {
  saveIyzicoSettings,
  testIyzicoConnectionAction,
  type IyzicoSettingsView,
} from '@/lib/store-payments/iyzico-settings'
import {
  IYZICO_ENVIRONMENTS,
  IYZICO_ENVIRONMENT_LABELS,
  type IyzicoEnvironment,
} from '@/lib/store-payments/iyzico-constants'

const copy = {
  tr: {
    intro:
      'Kendi iyzico hesabınızın anahtarlarını girin. Müşterilerin kart ödemeleri doğrudan iyzico hesabınıza gider.',
    apiKey: 'API Key',
    secretKey: 'Secret Key',
    stored: 'Kayıtlı (gizli)',
    keepHint: 'Boş bırakırsanız kayıtlı değer korunur.',
    environment: 'Ortam',
    returnUrl: "Dönüş URL'si",
    returnHint: "Bu adres her ödemede otomatik kullanılır. iyzico panelinde ayrıca tanımlamanız gerekmez, gerekirse buradan kopyalayın.",
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    save: 'Kaydet',
    saving: 'Kaydediliyor...',
    saved: 'Kaydedildi',
    test: 'Bağlantıyı test et',
    testing: 'Test ediliyor...',
    tested: 'Bağlantı test edildi',
    notTested: 'Bağlantı henüz test edilmedi. Test edilmeden kart ödemesi açılamaz.',
    unreadable: 'Kayıtlı anahtarlar okunamadı. Lütfen anahtarları yeniden girin.',
    testOk: 'Bağlantı başarılı',
    errors: {
      invalid_environment: 'Geçersiz ortam.',
      missing_keys: 'API Key ve Secret Key gerekli.',
      invalid_keys: 'Anahtar biçimi geçersiz.',
      secrets_unreadable: 'Kayıtlı anahtarlar okunamadığı için kaydedilemedi.',
      save_failed: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
      not_configured: 'Önce API Key ve Secret Key kaydedin.',
      unreadable: 'Kayıtlı anahtarlar okunamadı. Anahtarları yeniden girin.',
      auth: 'API Key veya Secret Key hatalı. Sandbox anahtarı canlı ortamda (ya da tersi) çalışmaz; ortam seçimini de kontrol edin.',
      rejected: 'iyzico isteği reddetti. Hesabınızın bu ortam için etkin olduğunu kontrol edin.',
      unavailable: 'iyzico şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.',
      rate_limited: 'Çok fazla deneme yaptınız. Lütfen bir dakika sonra tekrar deneyin.',
    } as Record<string, string>,
  },
  en: {
    intro:
      'Enter the keys of your own iyzico account. Card payments from your customers go straight to your iyzico account.',
    apiKey: 'API Key',
    secretKey: 'Secret Key',
    stored: 'Saved (hidden)',
    keepHint: 'Leave blank to keep the saved value.',
    environment: 'Environment',
    returnUrl: 'Return URL',
    returnHint: 'This address is used automatically on every payment. You do not need to register it in iyzico; copy it here if you need it.',
    copy: 'Copy',
    copied: 'Copied',
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved',
    test: 'Test connection',
    testing: 'Testing...',
    tested: 'Connection tested',
    notTested: 'The connection has not been tested yet. Card payments cannot be enabled until it passes.',
    unreadable: 'Saved keys could not be read. Please enter the keys again.',
    testOk: 'Connection successful',
    errors: {
      invalid_environment: 'Invalid environment.',
      missing_keys: 'API Key and Secret Key are required.',
      invalid_keys: 'The key format is invalid.',
      secrets_unreadable: 'Saved keys could not be read, so nothing was saved.',
      save_failed: 'Settings could not be saved. Please try again.',
      not_configured: 'Save the API Key and Secret Key first.',
      unreadable: 'Saved keys could not be read. Enter the keys again.',
      auth: 'API Key or Secret Key is wrong. A sandbox key does not work in live (or the reverse); check the environment too.',
      rejected: 'iyzico rejected the request. Check that your account is active for this environment.',
      unavailable: 'iyzico is not reachable right now. Please try again shortly.',
      rate_limited: 'Too many attempts. Please try again in a minute.',
    } as Record<string, string>,
  },
}

export function IyzicoSettingsPanel({
  projectId,
  initial,
  onChanged,
  showInstant = true,
}: {
  projectId: string
  initial: IyzicoSettingsView
  onChanged: (view: IyzicoSettingsView) => void
  /** The application assistant shows the Instant form in its own step 2, so it turns this off. */
  showInstant?: boolean
}) {
  const { lang } = useLanguage()
  const c = copy[lang === 'en' ? 'en' : 'tr']

  const [view, setView] = useState(initial)
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [environment, setEnvironment] = useState<IyzicoEnvironment>(initial.environment)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  function apply(next: IyzicoSettingsView) {
    setView(next)
    onChanged(next)
  }

  function handleSave() {
    setMessage(null)
    startSave(async () => {
      try {
        const res = await saveIyzicoSettings(projectId, { apiKey, secretKey, environment })
        if (res.ok) {
          setApiKey('')
          setSecretKey('')
          apply(res.view)
          setMessage({ kind: 'ok', text: c.saved })
        } else {
          setMessage({ kind: 'error', text: c.errors[res.error] ?? c.errors.save_failed })
        }
      } catch {
        setMessage({ kind: 'error', text: c.errors.save_failed })
      }
    })
  }

  function handleTest() {
    setMessage(null)
    startTest(async () => {
      try {
        const res = await testIyzicoConnectionAction(projectId)
        if (res.ok) {
          apply(res.view)
          setMessage({ kind: 'ok', text: c.testOk })
        } else {
          if (res.view) apply(res.view)
          setMessage({ kind: 'error', text: c.errors[res.error] ?? c.errors.unavailable })
        }
      } catch {
        setMessage({ kind: 'error', text: c.errors.unavailable })
      }
    })
  }

  async function copyReturnUrl() {
    try {
      await navigator.clipboard.writeText(view.returnUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const dirty = Boolean(apiKey.trim() || secretKey.trim() || environment !== view.environment)
  const canTest = view.apiKeyPresent && view.secretKeyPresent && !view.unreadable && !dirty
  const busy = saving || testing
  const inputClass =
    'h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{c.intro}</p>

      {showInstant && !view.apiKeyPresent && !view.secretKeyPresent && <IyzicoInstantCard projectId={projectId} />}

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            view.tested
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {view.tested ? c.tested : c.notTested}
        </span>
      </div>

      {view.unreadable && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {c.unreadable}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{c.apiKey}</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={view.apiKeyPresent ? c.stored : ''}
          className={inputClass}
        />
        {view.apiKeyPresent && <span className="text-xs text-muted-foreground">{c.keepHint}</span>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{c.secretKey}</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder={view.secretKeyPresent ? c.stored : ''}
          className={inputClass}
        />
        {view.secretKeyPresent && <span className="text-xs text-muted-foreground">{c.keepHint}</span>}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{c.environment}</legend>
        <div className="flex flex-wrap gap-4">
          {IYZICO_ENVIRONMENTS.map((env) => (
            <label key={env} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="iyzico-environment"
                checked={environment === env}
                onChange={() => setEnvironment(env)}
              />
              {IYZICO_ENVIRONMENT_LABELS[env][lang === 'en' ? 'en' : 'tr']}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{c.returnUrl}</span>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={view.returnUrl}
            aria-label={c.returnUrl}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} min-w-0 flex-1 text-muted-foreground`}
          />
          <button
            type="button"
            onClick={() => void copyReturnUrl()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-secondary"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? c.copied : c.copy}
          </button>
        </div>
        <span className="text-xs text-muted-foreground">{c.returnHint}</span>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-3 py-2 text-sm ${
            message.kind === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={busy || !dirty}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {c.saving}
            </>
          ) : (
            c.save
          )}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={busy || !canTest}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
        >
          {testing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {c.testing}
            </>
          ) : (
            c.test
          )}
        </button>
      </div>
    </div>
  )
}
