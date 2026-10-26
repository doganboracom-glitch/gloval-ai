'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import type { Lang, ProviderSettingsView, ProviderSetupConfig } from '@/lib/payment-providers/types'

const copy = {
  tr: {
    stored: 'Kayıtlı (gizli)',
    keepHint: 'Boş bırakırsanız kayıtlı değer korunur.',
    environment: 'Ortam',
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
    fallbackError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
  },
  en: {
    stored: 'Saved (hidden)',
    keepHint: 'Leave blank to keep the saved value.',
    environment: 'Environment',
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
    fallbackError: 'The action could not be completed. Please try again.',
  },
}

const inputClass =
  'h-10 rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'

/**
 * The single source of truth for entering keys, picking the environment, saving
 * and testing the connection. Driven entirely by `config.keys`.
 */
export function ProviderKeysForm({
  config,
  projectId,
  lang,
  settings,
  onChanged,
}: {
  config: ProviderSetupConfig
  projectId: string
  lang: Lang
  settings: ProviderSettingsView
  onChanged: (settings: ProviderSettingsView) => void
}) {
  const c = copy[lang]
  const { fields, environments, errors } = config.keys

  const [values, setValues] = useState<Record<string, string>>({})
  const [environment, setEnvironment] = useState(settings.environment)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  const errorText = (code: string) => errors[code]?.[lang] ?? c.fallbackError

  const dirty = fields.some((f) => (values[f.key] ?? '').trim()) || environment !== settings.environment
  const allPresent = fields.every((f) => settings.keysPresent[f.key])
  const canTest = allPresent && !settings.unreadable && !dirty
  const busy = saving || testing

  function handleSave() {
    setMessage(null)
    startSave(async () => {
      try {
        const res = await config.keys.save(projectId, { keys: values, environment })
        if (res.ok) {
          setValues({})
          onChanged(res.settings)
          setMessage({ kind: 'ok', text: c.saved })
        } else {
          setMessage({ kind: 'error', text: errorText(res.error) })
        }
      } catch {
        setMessage({ kind: 'error', text: errorText('save_failed') })
      }
    })
  }

  function handleTest() {
    setMessage(null)
    startTest(async () => {
      try {
        const res = await config.keys.test(projectId)
        if (res.ok) {
          onChanged(res.settings)
          setMessage({ kind: 'ok', text: c.testOk })
        } else {
          if (res.settings) onChanged(res.settings)
          setMessage({ kind: 'error', text: errorText(res.error) })
        }
      } catch {
        setMessage({ kind: 'error', text: errorText('unavailable') })
      }
    })
  }

  async function copyCallback() {
    try {
      await navigator.clipboard.writeText(settings.callbackUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <span
        className={`self-start rounded-full px-2.5 py-0.5 text-xs font-medium ${
          settings.tested
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {settings.tested ? c.tested : c.notTested}
      </span>

      {settings.unreadable && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {c.unreadable}
        </p>
      )}

      {fields.map((field) => {
        const present = settings.keysPresent[field.key]
        return (
          <label key={field.key} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{field.label[lang]}</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={values[field.key] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={present ? c.stored : ''}
              className={inputClass}
            />
            {present && <span className="text-xs text-muted-foreground">{c.keepHint}</span>}
          </label>
        )
      })}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{c.environment}</legend>
        <div className="flex flex-wrap gap-4">
          {environments.map((env) => (
            <label key={env.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${config.id}-environment`}
                checked={environment === env.id}
                onChange={() => setEnvironment(env.id)}
              />
              {env.label[lang]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{config.copy.callbackLabel[lang]}</span>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={settings.callbackUrl}
            aria-label={config.copy.callbackLabel[lang]}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} min-w-0 flex-1 text-muted-foreground`}
          />
          <button
            type="button"
            onClick={() => void copyCallback()}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 text-sm hover:bg-secondary"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? c.copied : c.copy}
          </button>
        </div>
        <span className="text-xs text-muted-foreground">{config.copy.callbackHint[lang]}</span>
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
