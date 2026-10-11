'use client'

import { useState, useTransition } from 'react'
import { Check, CreditCard, Loader2, PlugZap, Unplug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  disconnectPaytr,
  savePaytrSettings,
  testPaytrConnection,
  type PaytrActionResult,
  type PaytrSettingsView,
} from '@/lib/store-payments/paytr-settings'

const ERRORS: Record<string, string> = {
  invalid_fields: 'Lütfen işaretli alanları kontrol edin.',
  test_required: 'Etkinleştirmek için önce bağlantıyı test etmelisiniz.',
  not_saved: 'Önce bilgileri kaydedin.',
  invalid_credentials: 'PayTR bilgileri doğrulanamadı. Mağaza No, Merchant Key ve Salt değerlerini kontrol edin.',
  rejected: 'PayTR isteği reddetti. PayTR panelinde mağazanızın aktif olduğundan emin olun.',
  network: 'PayTR ile bağlantı kurulamadı. Lütfen tekrar deneyin.',
  rate_limited: 'Çok fazla deneme yapıldı. Bir dakika sonra tekrar deneyin.',
  ip_unavailable: 'Bağlantı testi için IP adresiniz belirlenemedi.',
  secrets_unreadable: 'Kayıtlı bilgiler okunamadı. Bilgileri yeniden girip kaydedin.',
  save_failed: 'Ayarlar kaydedilemedi. Lütfen tekrar deneyin.',
}

const FIELD_ERRORS: Record<string, string> = {
  required: 'Zorunlu alan',
  invalid: 'Geçersiz değer',
}

const inputCls =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

export function PaytrPanel({ projectId, initial }: { projectId: string; initial: PaytrSettingsView }) {
  const [view, setView] = useState(initial)
  const [merchantId, setMerchantId] = useState(initial.merchantId)
  const [merchantKey, setMerchantKey] = useState('')
  const [merchantSalt, setMerchantSalt] = useState('')
  const [testMode, setTestMode] = useState(initial.testMode)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  const dirty =
    merchantId.trim() !== view.merchantId ||
    merchantKey.trim() !== '' ||
    merchantSalt.trim() !== '' ||
    testMode !== view.testMode

  function apply(result: PaytrActionResult, okText: string) {
    if (result.ok) {
      setView(result.view)
      setMerchantId(result.view.merchantId)
      setTestMode(result.view.testMode)
      setMerchantKey('')
      setMerchantSalt('')
      setFieldErrors({})
      setMessage({ tone: 'ok', text: okText })
    } else {
      setFieldErrors((result.fieldErrors as Record<string, string> | undefined) ?? {})
      setMessage({ tone: 'error', text: ERRORS[result.error] ?? ERRORS.save_failed })
    }
  }

  const run = (task: () => Promise<PaytrActionResult>, okText: string) => {
    setMessage(null)
    startTransition(async () => {
      try {
        apply(await task(), okText)
      } catch {
        setMessage({ tone: 'error', text: ERRORS.save_failed })
      }
    })
  }

  const save = (enabled: boolean) =>
    run(
      () => savePaytrSettings(projectId, { merchantId, merchantKey, merchantSalt, testMode, enabled }),
      enabled ? 'Kart ödemesi etkinleştirildi.' : 'Kaydedildi.',
    )

  const fields: { key: 'merchantId' | 'merchantKey' | 'merchantSalt'; label: string; secret: boolean }[] = [
    { key: 'merchantId', label: 'Mağaza No (Merchant ID)', secret: false },
    { key: 'merchantKey', label: 'Merchant Key', secret: true },
    { key: 'merchantSalt', label: 'Merchant Salt', secret: true },
  ]
  const values = { merchantId, merchantKey, merchantSalt }
  const setters = { merchantId: setMerchantId, merchantKey: setMerchantKey, merchantSalt: setMerchantSalt }
  const stored = { merchantId: null, merchantKey: view.maskedKey, merchantSalt: view.maskedSalt }

  return (
    <section
      className={`rounded-2xl border p-5 transition-colors ${view.enabled ? 'border-primary/50 bg-card' : 'border-border bg-card/60'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 items-center justify-center rounded-lg bg-muted text-foreground">
            <CreditCard className="size-4.5" />
          </span>
          <div>
            <h2 className="font-medium">PayTR ile Öde</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Kredi/banka kartı ile güvenli 3D ödeme. Para doğrudan kendi PayTR hesabınıza geçer.
            </p>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            view.enabled ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
          }`}
        >
          {view.enabled ? 'Etkin' : view.tested ? 'Test edildi' : 'Pasif'}
        </span>
      </div>

      {view.unreadable && (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERRORS.secrets_unreadable}
        </p>
      )}

      <div className="mt-5 grid gap-4 border-t border-border pt-5 sm:grid-cols-2">
        {fields.map((f) => (
          <label key={f.key} className={`flex flex-col gap-1.5 ${f.key === 'merchantId' ? 'sm:col-span-2' : ''}`}>
            <span className="text-sm font-medium">
              {f.label}
              <span className="ml-0.5 text-destructive">*</span>
            </span>
            <input
              type={f.secret ? 'password' : 'text'}
              autoComplete="off"
              className={inputCls}
              value={values[f.key]}
              onChange={(e) => setters[f.key](e.target.value)}
              placeholder={stored[f.key] ?? (f.secret ? '' : '123456')}
              aria-invalid={Boolean(fieldErrors[f.key])}
            />
            {fieldErrors[f.key] && (
              <span className="text-xs text-destructive">{FIELD_ERRORS[fieldErrors[f.key]] ?? 'Geçersiz değer'}</span>
            )}
          </label>
        ))}

        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={testMode}
            onChange={(e) => setTestMode(e.target.checked)}
            className="size-4 accent-primary"
          />
          Test modu (gerçek kart çekimi yapılmaz)
        </label>

        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm sm:col-span-2">
          <p className="font-medium">Bildirim URL&apos;si</p>
          <p className="mt-0.5 text-muted-foreground">
            PayTR panelinde Ayarlar &rarr; Bildirim URL alanına şu adresi girin:
          </p>
          <code className="mt-1.5 block break-all rounded bg-background/60 px-2 py-1.5 text-xs">{view.callbackUrl}</code>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mt-4 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm ${
            message.tone === 'ok'
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          }`}
        >
          {message.tone === 'ok' && <Check className="size-4" />}
          {message.text}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button onClick={() => save(view.enabled)} disabled={pending || !dirty} variant="outline" className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          Kaydet
        </Button>
        <Button
          onClick={() => run(() => testPaytrConnection(projectId), 'Bağlantı başarılı. Artık etkinleştirebilirsiniz.')}
          disabled={pending || dirty || !view.maskedKey}
          variant="outline"
          className="gap-2"
        >
          <PlugZap className="size-4" />
          Bağlantıyı test et
        </Button>
        {view.enabled ? (
          <Button onClick={() => save(false)} disabled={pending || dirty} variant="outline">
            Devre dışı bırak
          </Button>
        ) : (
          <Button onClick={() => save(true)} disabled={pending || dirty || !view.tested} className="gap-2">
            Etkinleştir
          </Button>
        )}
        {view.maskedKey && (
          <Button
            onClick={() => run(() => disconnectPaytr(projectId), 'PayTR bağlantısı kaldırıldı.')}
            disabled={pending}
            variant="ghost"
            className="ml-auto gap-2 text-destructive hover:text-destructive"
          >
            <Unplug className="size-4" />
            Bağlantıyı kaldır
          </Button>
        )}
      </div>
    </section>
  )
}
