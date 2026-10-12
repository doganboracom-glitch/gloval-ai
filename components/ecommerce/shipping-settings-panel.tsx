'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import {
  saveShippingSettings,
  type ShippingSettingsView,
} from '@/lib/store-payments/shipping-settings'
import { CARRIERS } from '@/lib/shipping-carriers'
import { DELIVERY_NOTE_MAX_LENGTH, parseShippingSettingsInput } from '@/lib/store-shipping-rules'

const copy = {
  tr: {
    fee: 'Kargo ücreti (TL)',
    feeHint: '0 ile 1.000 TL arası, en fazla iki ondalık. Boş veya 0 ise kargo ücretsizdir.',
    threshold: 'Ücretsiz kargo eşiği (TL, isteğe bağlı)',
    thresholdHint: 'Sepet ara toplamı bu tutara ulaşınca kargo ücreti 0 olur. Boşsa eşik yoktur.',
    carrier: 'Varsayılan kargo firması',
    carrierNone: 'Seçilmedi',
    note: 'Teslim süresi notu',
    noteHint: 'Kısa bir genel not, örnek: 1-3 iş günü.',
    preview: 'Önizleme',
    previewFree: 'Müşteriler kargo ücreti ödemez.',
    previewFee: (fee: string) => `Müşteriler ${fee} kargo öder.`,
    previewThreshold: (t: string) => ` ${t} ve üzeri siparişlerde kargo ücretsiz.`,
    save: 'Kaydet',
    saving: 'Kaydediliyor...',
    saved: 'Kaydedildi',
    migration:
      'Veritabanı güncellemesi (scripts/040) henüz uygulanmadığı için kargo ayarları kaydedilemiyor. Kargo ücreti 0 olarak uygulanır.',
    errors: {
      invalid_fee: 'Kargo ücreti 0 ile 1.000 TL arasında, en fazla iki ondalıklı olmalı.',
      invalid_threshold: 'Ücretsiz kargo eşiği 0\u2019dan büyük geçerli bir tutar olmalı veya boş bırakılmalı.',
      invalid_note: `Teslim süresi notu en fazla ${DELIVERY_NOTE_MAX_LENGTH} karakter olabilir.`,
      invalid_carrier: 'Geçersiz kargo firması.',
      migration_pending: 'Bu ayar için veritabanı güncellemesi gerekli (scripts/040).',
      save_failed: 'Kargo ayarları kaydedilemedi. Lütfen tekrar deneyin.',
    } as Record<string, string>,
  },
  en: {
    fee: 'Shipping fee (TRY)',
    feeHint: 'Between 0 and 1,000 TRY, up to two decimals. Blank or 0 means free shipping.',
    threshold: 'Free shipping threshold (TRY, optional)',
    thresholdHint: 'Shipping becomes 0 once the cart subtotal reaches this amount. Blank means no threshold.',
    carrier: 'Default carrier',
    carrierNone: 'Not set',
    note: 'Delivery time note',
    noteHint: 'A short general note, for example: 1-3 business days.',
    preview: 'Preview',
    previewFree: 'Customers pay no shipping fee.',
    previewFee: (fee: string) => `Customers pay ${fee} shipping.`,
    previewThreshold: (t: string) => ` Shipping is free for orders of ${t} and above.`,
    save: 'Save',
    saving: 'Saving...',
    saved: 'Saved',
    migration:
      'The database update (scripts/040) has not been applied, so shipping settings cannot be saved. Shipping is charged as 0.',
    errors: {
      invalid_fee: 'The shipping fee must be between 0 and 1,000 TRY with at most two decimals.',
      invalid_threshold: 'The threshold must be a valid amount above 0, or left blank.',
      invalid_note: `The delivery note can be at most ${DELIVERY_NOTE_MAX_LENGTH} characters.`,
      invalid_carrier: 'Invalid carrier.',
      migration_pending: 'This setting needs the database update (scripts/040).',
      save_failed: 'Shipping settings could not be saved. Please try again.',
    } as Record<string, string>,
  },
}

function toInput(cents: number | null): string {
  if (cents === null || cents === 0) return ''
  const whole = cents % 100 === 0
  return (cents / 100).toFixed(whole ? 0 : 2).replace('.', ',')
}

const inputCls =
  'h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30'

export function ShippingSettingsPanel({
  projectId,
  initial,
  onSaved,
}: {
  projectId: string
  initial: ShippingSettingsView
  onSaved?: (view: ShippingSettingsView) => void
}) {
  const { lang } = useLanguage()
  const l = lang === 'en' ? 'en' : 'tr'
  const c = copy[l]

  const [fee, setFee] = useState(toInput(initial.settings.feeCents))
  const [threshold, setThreshold] = useState(toInput(initial.settings.freeThresholdCents))
  const [carrier, setCarrier] = useState<string>(initial.settings.defaultCarrier ?? '')
  const [note, setNote] = useState(initial.settings.deliveryNote ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  const draft = { fee, freeThreshold: threshold, defaultCarrier: carrier, deliveryNote: note }
  const parsed = parseShippingSettingsInput(draft)

  function previewText() {
    if (!parsed.ok) return null
    const { feeCents, freeThresholdCents } = parsed.settings
    if (feeCents <= 0) return c.previewFree
    const money = (v: number) =>
      `₺${(v / 100).toLocaleString('tr-TR', {
        minimumFractionDigits: v % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })}`
    return (
      c.previewFee(money(feeCents)) +
      (freeThresholdCents !== null ? c.previewThreshold(money(freeThresholdCents)) : '')
    )
  }

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const res = await saveShippingSettings(projectId, draft)
        if (res.ok) {
          setSaved(true)
          onSaved?.(res.view)
          window.setTimeout(() => setSaved(false), 2500)
        } else {
          setError(c.errors[res.error] ?? c.errors.save_failed)
        }
      } catch {
        setError(c.errors.save_failed)
      }
    })
  }

  const preview = previewText()

  return (
    <div className="flex flex-col gap-5">
      {!initial.migrationApplied && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {c.migration}
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.fee}</span>
          <input
            inputMode="decimal"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            placeholder="0"
            aria-describedby="ship-fee-hint"
            className={inputCls}
          />
          <span id="ship-fee-hint" className="text-xs text-muted-foreground">
            {c.feeHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.threshold}</span>
          <input
            inputMode="decimal"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="750"
            aria-describedby="ship-threshold-hint"
            className={inputCls}
          />
          <span id="ship-threshold-hint" className="text-xs text-muted-foreground">
            {c.thresholdHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.carrier}</span>
          <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className={inputCls}>
            <option value="">{c.carrierNone}</option>
            {CARRIERS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{c.note}</span>
          <input
            value={note}
            maxLength={DELIVERY_NOTE_MAX_LENGTH}
            onChange={(e) => setNote(e.target.value)}
            placeholder="1-3 iş günü"
            aria-describedby="ship-note-hint"
            className={inputCls}
          />
          <span id="ship-note-hint" className="text-xs text-muted-foreground">
            {c.noteHint}
          </span>
        </label>
      </div>

      <section className="rounded-xl border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-medium">{c.preview}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview ?? c.errors[parsed.ok ? 'save_failed' : parsed.error]}
        </p>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={handleSave}
          disabled={pending || !parsed.ok}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
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
        </button>
      </div>
    </div>
  )
}
