'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CreditCard, Loader2, Check, ShieldCheck, Landmark, Sparkles, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { PAYMENT_METHODS, type PaymentMethodId } from '@/lib/payments/methods'
import {
  savePaymentSettings,
  type PaymentSettingsView,
} from '@/lib/payment-settings'
import { setTryOnEnabled } from '@/lib/try-on-settings'

const copy = {
  tr: {
    back: 'Ürünlere dön',
    eyebrow: 'Ödeme Ayarları',
    title: 'Ödeme Yöntemleri',
    subtitle:
      'Müşterilerinize sunmak istediğiniz ödeme yöntemlerini seçin ve kendi hesap bilgilerinizi girin. Bilgiler güvenle şifrelenir.',
    enable: 'Bu yöntemi etkinleştir',
    saved: 'Kaydedildi',
    save: 'Kaydet',
    saving: 'Kaydediliyor...',
    stored: '•••••••• (kayıtlı)',
    missing: 'Lütfen şu zorunlu alanları doldurun:',
    saveError: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
    none: 'Henüz bir ödeme yöntemi etkin değil. Bir yöntem etkinleştirene kadar mağazanız sipariş alamaz ve müşterileriniz ödeme adımında uyarı görür.',
    note: 'Not: Canlı ödeme alma, geçerli mağaza hesabı bilgileriyle etkinleşir. Girdiğiniz gizli anahtarlar sunucuda şifrelenir ve panelde bir daha gösterilmez.',
    tryOnTitle: 'AI ile Üzerinde Dene',
    tryOnBlurb:
      'Müşterileriniz fotoğraflarını yükleyip ürünü üzerlerinde görebilir. Her deneme sizin AI kredinizden düşer.',
    tryOnSaved: 'Güncellendi',
    tryOnError: 'Değişiklik kaydedilemedi. Lütfen tekrar deneyin.',
  },
  en: {
    back: 'Back to products',
    eyebrow: 'Payment Settings',
    title: 'Payment Methods',
    subtitle:
      'Choose the payment methods you want to offer and enter your own account details. Credentials are stored encrypted.',
    enable: 'Enable this method',
    saved: 'Saved',
    save: 'Save',
    saving: 'Saving...',
    stored: '•••••••• (stored)',
    missing: 'Please fill in these required fields:',
    saveError: 'Could not save settings. Please try again.',
    none: 'No payment method is enabled yet. Without one, your customers only see a test payment.',
    note: 'Note: Live payments activate with valid merchant credentials. Secret keys are encrypted on the server and never shown again.',
    tryOnTitle: 'AI Try It On',
    tryOnBlurb:
      'Customers can upload a photo and see themselves wearing the product. Each attempt uses your AI credit balance.',
    tryOnSaved: 'Updated',
    tryOnError: 'Could not save the change. Please try again.',
  },
}

const ICONS: Record<PaymentMethodId, typeof CreditCard> = {
  paytr: CreditCard,
  iyzico: CreditCard,
  bank_transfer: Landmark,
  cash_on_delivery: Truck,
}

export function PaymentSettingsClient({
  projectId,
  projectName,
  initial,
  initialTryOnEnabled = false,
}: {
  projectId: string
  projectName: string
  initial: PaymentSettingsView
  initialTryOnEnabled?: boolean
}) {
  const { lang } = useLanguage()
  const c = copy[lang === 'en' ? 'en' : 'tr']
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [missing, setMissing] = useState<string[]>([])

  const [tryOnEnabled, setTryOnEnabledState] = useState(initialTryOnEnabled)
  const [tryOnPending, startTryOnTransition] = useTransition()
  const [tryOnSaved, setTryOnSaved] = useState(false)
  const [tryOnError, setTryOnError] = useState(false)

  function handleTryOnToggle() {
    const next = !tryOnEnabled
    setTryOnEnabledState(next)
    setTryOnError(false)
    startTryOnTransition(async () => {
      const result = await setTryOnEnabled(projectId, next)
      if (result.ok) {
        setTryOnSaved(true)
        window.setTimeout(() => setTryOnSaved(false), 2000)
      } else {
        setTryOnEnabledState(!next)
        setTryOnError(true)
      }
    })
  }

  const [enabled, setEnabled] = useState<Set<PaymentMethodId>>(
    new Set(initial.enabled),
  )
  // Editable copies of the public + secret field values.
  const [publicVals, setPublicVals] = useState<Record<string, Record<string, string>>>(
    () => structuredClone(initial.publicConfig ?? {}),
  )
  const [secretVals, setSecretVals] = useState<Record<string, Record<string, string>>>({})

  const secretsPresent = initial.secretsPresent ?? {}

  function toggle(id: PaymentMethodId) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setPublic(method: string, key: string, value: string) {
    setPublicVals((prev) => ({ ...prev, [method]: { ...prev[method], [key]: value } }))
  }
  function setSecret(method: string, key: string, value: string) {
    setSecretVals((prev) => ({ ...prev, [method]: { ...prev[method], [key]: value } }))
  }

  function handleSave() {
    setError(null)
    setMissing([])
    setSaved(false)
    startTransition(async () => {
      const result = await savePaymentSettings(projectId, {
        enabled: Array.from(enabled),
        publicConfig: publicVals,
        secrets: secretVals,
      })
      if (result.ok) {
        setSaved(true)
        setSecretVals({})
        router.refresh()
        window.setTimeout(() => setSaved(false), 2500)
      } else if (result.error === 'missing_fields' || result.error === 'invalid_fields') {
        setMissing(result.missing ?? [])
      } else {
        setError(c.saveError)
      }
    })
  }

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      <div className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href={`/ecommerce/${projectId}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {c.back}
        </Link>

        <div className="mt-6">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="size-5" />
            <span className="text-sm font-medium uppercase tracking-wide">{projectName}</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-balance">
            {c.title}
          </h1>
          <p className="mt-1 max-w-prose text-muted-foreground">{c.subtitle}</p>
        </div>

        <section className="mt-8 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                <Sparkles className="size-4.5" />
              </span>
              <div>
                <h2 className="font-medium">{c.tryOnTitle}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{c.tryOnBlurb}</p>
                {tryOnSaved && (
                  <p className="mt-1.5 flex items-center gap-1 text-sm text-primary">
                    <Check className="size-3.5" />
                    {c.tryOnSaved}
                  </p>
                )}
                {tryOnError && (
                  <p className="mt-1.5 text-sm text-destructive">{c.tryOnError}</p>
                )}
              </div>
            </div>

            <label className="inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={tryOnEnabled}
                disabled={tryOnPending}
                onChange={handleTryOnToggle}
              />
              <span className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-background after:shadow after:transition-transform peer-checked:after:translate-x-5" />
              <span className="sr-only">{c.tryOnTitle}</span>
            </label>
          </div>
        </section>

        {enabled.size === 0 && (
          <p className="mt-6 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            {c.none}
          </p>
        )}

        <div className="mt-8 flex flex-col gap-4">
          {PAYMENT_METHODS.map((method) => {
            const Icon = ICONS[method.id]
            const on = enabled.has(method.id)
            return (
              <section
                key={method.id}
                className={`rounded-2xl border p-5 transition-colors ${
                  on ? 'border-primary/50 bg-card' : 'border-border bg-card/60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
                      <Icon className="size-4.5" />
                    </span>
                    <div>
                      <h2 className="font-medium">{method.name[lang === 'en' ? 'en' : 'tr']}</h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {method.blurb[lang === 'en' ? 'en' : 'tr']}
                      </p>
                    </div>
                  </div>

                  <label className="inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={on}
                      onChange={() => toggle(method.id)}
                    />
                    <span className="relative h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-background after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                    <span className="sr-only">{c.enable}</span>
                  </label>
                </div>

                {on && method.fields.length > 0 && (
                  <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
                    {method.fields.map((field) => {
                      const label = field.label[lang === 'en' ? 'en' : 'tr']
                      const stored = secretsPresent[method.id]?.[field.key]
                      const full = field.multiline || field.kind === 'text' && field.key === 'iban'
                      return (
                        <label
                          key={field.key}
                          className={`flex flex-col gap-1.5 ${full ? 'sm:col-span-2' : ''}`}
                        >
                          <span className="text-sm font-medium text-foreground">
                            {label}
                            {field.required && <span className="ml-0.5 text-destructive">*</span>}
                          </span>
                          {field.multiline ? (
                            <textarea
                              rows={2}
                              className={`${inputCls} h-auto resize-y py-2`}
                              value={publicVals[method.id]?.[field.key] ?? ''}
                              onChange={(e) => setPublic(method.id, field.key, e.target.value)}
                              placeholder={field.placeholder}
                            />
                          ) : field.kind === 'secret' ? (
                            <input
                              type="password"
                              autoComplete="off"
                              className={inputCls}
                              value={secretVals[method.id]?.[field.key] ?? ''}
                              onChange={(e) => setSecret(method.id, field.key, e.target.value)}
                              placeholder={stored ? c.stored : field.placeholder}
                            />
                          ) : (
                            <input
                              className={inputCls}
                              value={publicVals[method.id]?.[field.key] ?? ''}
                              onChange={(e) => setPublic(method.id, field.key, e.target.value)}
                              placeholder={field.placeholder}
                            />
                          )}
                        </label>
                      )
                    })}
                  </div>
                )}
              </section>
            )
          })}
        </div>

        {missing.length > 0 && (
          <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">{c.missing}</p>
            <ul className="mt-1 list-inside list-disc">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
        {error && (
          <p className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <p className="mt-6 text-xs text-muted-foreground">{c.note}</p>

        <div className="mt-6 flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending} size="lg" className="gap-2">
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {c.saving}
              </>
            ) : saved ? (
              <>
                <Check className="size-4" />
                {c.saved}
              </>
            ) : (
              c.save
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'
