'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, CreditCard, Landmark, ShieldCheck, Lock, ArrowLeft, UserCheck, UserPlus } from 'lucide-react'
import { pickLang, type Lang } from '@/lib/i18n'
import { useCart, formatPrice } from '@/components/store/cart-provider'
import {
  getPaymentMethod,
  CREDIT_CARD_BUYER_LABEL,
  CREDIT_CARD_BUYER_BLURB,
} from '@/lib/payments/methods'
import { useDemoAccount, recordDemoOrder } from '@/components/demo-site/use-demo-account'
import {
  InvoiceFields,
  LegalConsent,
  type InvoiceInput,
  type LegalConsentState,
} from '@/components/store/checkout-extras'

const t = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

/**
 * Demo checkout is a static preview unconnected to any store's real payment
 * settings, so it only ever offers two BUYER-FACING options: a generic
 * "Kredi Kartı" (never naming the underlying PSP, exactly like the real
 * store checkout) and bank transfer. The production checkout reuses the same
 * provider-agnostic labeling via `PaymentMethodSelect`.
 */
type DemoPaymentMethodId = 'card' | 'bank_transfer'

const bankMeta = getPaymentMethod('bank_transfer')

const DEMO_PAYMENT_OPTIONS: { id: DemoPaymentMethodId; name: { tr: string; en: string }; blurb: { tr: string; en: string } }[] = [
  { id: 'card', name: CREDIT_CARD_BUYER_LABEL, blurb: CREDIT_CARD_BUYER_BLURB },
  {
    id: 'bank_transfer',
    name: bankMeta?.name ?? { tr: 'Havale / EFT', en: 'Bank transfer' },
    blurb: bankMeta?.blurb ?? { tr: '', en: '' },
  },
]

type CheckoutForm = {
  name: string
  email: string
  phone: string
  city: string
  address: string
}

const EMPTY: CheckoutForm = { name: '', email: '', phone: '', city: '', address: '' }

/**
 * DemoCheckout
 * ------------
 * A fully interactive but SIMULATED checkout for the commerce demo. It reads the
 * real (localStorage) cart, prefills from the simulated membership when signed
 * in, requires the buyer to fill in their details before completing, lets them
 * choose a payment method, then simulates payment and shows a confirmation. A
 * guest is offered a one-tap account after the order. No money moves and no
 * order is persisted — the production store reuses the same method set and flow
 * through the shared checkout.
 */
export function DemoCheckout({
  slug,
  lang,
  brand,
}: {
  slug: string
  lang: Lang
  brand: string
}) {
  const cart = useCart()
  const account = useDemoAccount(slug)
  const [method, setMethod] = useState<DemoPaymentMethodId>('card')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)
  const [form, setForm] = useState<CheckoutForm>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>({})
  const [orderedAsGuest, setOrderedAsGuest] = useState(false)
  const [wantsInvoice, setWantsInvoice] = useState(false)
  const [invoice, setInvoice] = useState<InvoiceInput>({ type: 'individual' })
  const [consent, setConsent] = useState<LegalConsentState>({ sales: false, kvkk: false })
  const [consentError, setConsentError] = useState<string | null>(null)

  const shippingHref = `/demo/${slug}/urunler?lang=${lang}`

  // Prefill from the signed-in member's saved profile (only fills empty fields
  // so it never clobbers what the buyer is actively typing).
  useEffect(() => {
    if (!account.profile) return
    setForm((prev) => ({
      name: prev.name || account.profile!.name,
      email: prev.email || account.profile!.email,
      phone: prev.phone || account.profile!.phone,
      city: prev.city || account.profile!.city,
      address: prev.address || account.profile!.address,
    }))
  }, [account.profile])

  function setField(key: keyof CheckoutForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate(): boolean {
    const next: Partial<Record<keyof CheckoutForm, string>> = {}
    const required = t(lang, 'Bu alan zorunlu.', 'This field is required.')
    if (!form.name.trim()) next.name = required
    if (!form.email.trim()) next.email = required
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      next.email = t(lang, 'Geçerli bir e-posta gir.', 'Enter a valid email.')
    if (!form.phone.trim()) next.phone = required
    if (!form.city.trim()) next.city = required
    if (!form.address.trim()) next.address = required
    setErrors(next)
    const consentOk = consent.sales && consent.kvkk
    setConsentError(
      consentOk
        ? null
        : t(
            lang,
            'Devam etmek için sözleşmeleri ve KVKK metnini onaylayın.',
            'Please accept the agreements and the KVKK notice to continue.',
          ),
    )
    return Object.keys(next).length === 0 && consentOk
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (processing) return
    if (!validate()) {
      // Bring the first invalid field into view.
      const firstInvalid = document.querySelector('[data-invalid="true"]')
      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setProcessing(true)
    // Snapshot the cart before it's cleared so we can persist the order.
    const orderItems = cart.items.map((i) => ({ name: i.name, quantity: i.quantity }))
    const orderTotal = cart.subtotalCents
    const orderCurrency = cart.items[0]?.currency ?? 'TRY'
    // Simulate a PSP round-trip; a real store redirects to PayTR/iyzico here.
    window.setTimeout(() => {
      recordDemoOrder(slug, {
        email: form.email,
        method: methodLabel(method, lang),
        totalCents: orderTotal,
        currency: orderCurrency,
        items: orderItems,
      })
      setProcessing(false)
      setOrderedAsGuest(!account.profile)
      setDone(true)
      cart.clear()
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 1400)
  }

  if (done) {
    return (
      <OrderConfirmation
        slug={slug}
        lang={lang}
        brand={brand}
        method={method}
        form={form}
        showAccountOffer={orderedAsGuest && !account.profile}
        onCreateAccount={(password) => account.createFromCheckout({ ...form, password })}
      />
    )
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-lg px-6 py-16 text-center">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}>
          {t(lang, 'Sepetiniz boş', 'Your cart is empty')}
        </h1>
        <p className="mt-3" style={{ color: 'var(--site-muted-fg)' }}>
          {t(lang, 'Ödeme yapmak için önce sepetinize ürün ekleyin.', 'Add products to your cart before checking out.')}
        </p>
        <Link
          href={shippingHref}
          className="mt-8 inline-flex items-center justify-center px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            borderRadius: 'var(--site-radius)',
            backgroundColor: 'var(--site-primary)',
            color: 'var(--site-primary-fg)',
          }}
        >
          {t(lang, 'Ürünlere göz at', 'Browse products')}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 sm:py-14">
      <Link
        href={shippingHref}
        className="mb-6 inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--site-muted-fg)' }}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t(lang, 'Alışverişe dön', 'Back to shopping')}
      </Link>

      <h1
        className="text-3xl font-bold tracking-tight"
        style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
      >
        {t(lang, 'Ödeme', 'Checkout')}
      </h1>

      {/* Membership banner */}
      {account.profile ? (
        <div
          className="mt-6 flex items-center gap-3 p-4"
          style={{
            borderRadius: 'var(--site-radius)',
            border: '1px solid var(--site-border)',
            backgroundColor: 'color-mix(in srgb, var(--site-primary) 8%, transparent)',
          }}
        >
          <UserCheck className="h-5 w-5 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden />
          <p className="text-sm" style={{ color: 'var(--site-fg)' }}>
            {t(
              lang,
              `${account.profile.name} olarak giriş yaptınız — bilgileriniz dolduruldu.`,
              `Signed in as ${account.profile.name} — your details are filled in.`,
            )}
          </p>
        </div>
      ) : (
        <div
          className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{
            borderRadius: 'var(--site-radius)',
            border: '1px solid var(--site-border)',
            backgroundColor: 'var(--site-card)',
          }}
        >
          <p className="text-sm" style={{ color: 'var(--site-fg)' }}>
            {t(lang, 'Hesabınız var mı? Bilgileriniz hazır gelsin.', 'Have an account? Get your details prefilled.')}
          </p>
          <Link
            href={`/demo/${slug}/hesap?lang=${lang}`}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              borderRadius: 'var(--site-radius)',
              border: '1px solid var(--site-primary)',
              color: 'var(--site-primary)',
            }}
          >
            {t(lang, 'Giriş yap / Üye ol', 'Sign in / Register')}
          </Link>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        {/* -------- Form column -------- */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-8">
          {/* Shipping */}
          <fieldset className="flex flex-col gap-4">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Teslimat bilgileri', 'Shipping details')}
            </legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(lang, 'Ad Soyad', 'Full name')} value={form.name} onChange={(v) => setField('name', v)} error={errors.name} required />
              <Field label={t(lang, 'E-posta', 'Email')} type="email" value={form.email} onChange={(v) => setField('email', v)} error={errors.email} required />
              <Field label={t(lang, 'Telefon', 'Phone')} type="tel" value={form.phone} onChange={(v) => setField('phone', v)} error={errors.phone} required />
              <Field label={t(lang, 'Şehir', 'City')} value={form.city} onChange={(v) => setField('city', v)} error={errors.city} required />
            </div>
            <Field label={t(lang, 'Adres', 'Address')} value={form.address} onChange={(v) => setField('address', v)} error={errors.address} required multiline />
          </fieldset>

          {/* Payment method selection */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Ödeme yöntemi', 'Payment method')}
            </legend>
            {DEMO_PAYMENT_OPTIONS.map((m) => {
              const active = method === m.id
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-start gap-3 p-4 transition-colors"
                  style={{
                    borderRadius: 'var(--site-radius)',
                    border: active ? '2px solid var(--site-primary)' : '1px solid var(--site-border)',
                    backgroundColor: active ? 'color-mix(in srgb, var(--site-primary) 8%, transparent)' : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="payment-method"
                    value={m.id}
                    checked={active}
                    onChange={() => setMethod(m.id)}
                    className="sr-only"
                  />
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--site-primary) 14%, transparent)',
                      color: 'var(--site-primary)',
                    }}
                  >
                    {m.id === 'bank_transfer' ? <Landmark className="h-5 w-5" /> : <CreditCard className="h-5 w-5" />}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
                      {pickLang(m.name, lang)}
                    </span>
                    <span className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
                      {pickLang(m.blurb, lang)}
                    </span>
                  </span>
                  <span
                    className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: active ? 'none' : '1px solid var(--site-border)',
                      backgroundColor: active ? 'var(--site-primary)' : 'transparent',
                      color: 'var(--site-primary-fg)',
                    }}
                  >
                    {active ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                </label>
              )
            })}
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
              <Lock className="h-3.5 w-3.5" aria-hidden />
              {t(lang, 'Bu bir demo ödemedir — gerçek ödeme alınmaz.', 'This is a demo checkout — no real payment is taken.')}
            </p>
          </fieldset>

          {/* Invoice (optional) */}
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Fatura bilgileri', 'Invoice details')}
            </legend>
            <label className="flex items-center gap-2.5 text-sm" style={{ color: 'var(--site-fg)' }}>
              <input
                type="checkbox"
                checked={wantsInvoice}
                onChange={(e) => setWantsInvoice(e.target.checked)}
                className="h-4 w-4"
                style={{ accentColor: 'var(--site-primary)' }}
              />
              {t(lang, 'Fatura bilgisi eklemek istiyorum', 'I want to add invoice details')}
            </label>
            {wantsInvoice && <InvoiceFields value={invoice} onChange={setInvoice} />}
          </fieldset>

          {/* Legal consent */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Onaylar', 'Consents')}
            </legend>
            <LegalConsent storeName={brand} value={consent} onChange={setConsent} />
            {consentError && (
              <p className="text-sm" style={{ color: 'var(--site-primary)' }}>
                {consentError}
              </p>
            )}
          </fieldset>
        </form>

        {/* -------- Summary column -------- */}
        <aside
          className="h-fit lg:sticky lg:top-28"
          style={{
            borderRadius: 'var(--site-radius)',
            border: '1px solid var(--site-border)',
            backgroundColor: 'var(--site-card)',
          }}
        >
          <div className="p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Sipariş özeti', 'Order summary')}
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {cart.items.map((item) => (
                <li key={item.productId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex-1" style={{ color: 'var(--site-muted-fg)' }}>
                    {item.name} <span className="opacity-70">× {item.quantity}</span>
                  </span>
                  <span style={{ color: 'var(--site-fg)' }}>
                    {formatPrice(item.priceCents * item.quantity, item.currency)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t pt-4" style={{ borderColor: 'var(--site-border)' }}>
              <span className="font-semibold" style={{ color: 'var(--site-fg)' }}>
                {t(lang, 'Toplam', 'Total')}
              </span>
              <span className="text-lg font-bold" style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}>
                {formatPrice(cart.subtotalCents, cart.currency)}
              </span>
            </div>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={processing}
              className="mt-5 flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{
                borderRadius: 'var(--site-radius)',
                backgroundColor: 'var(--site-primary)',
                color: 'var(--site-primary-fg)',
              }}
            >
              {processing ? (
                t(lang, 'İşleniyor…', 'Processing…')
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" aria-hidden />
                  {t(lang, 'Siparişi tamamla', 'Complete order')}
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Order confirmation (+ optional guest → account offer)                     */
/* -------------------------------------------------------------------------- */

function OrderConfirmation({
  slug,
  lang,
  brand,
  method,
  form,
  showAccountOffer,
  onCreateAccount,
}: {
  slug: string
  lang: Lang
  brand: string
  method: DemoPaymentMethodId
  form: CheckoutForm
  showAccountOffer: boolean
  onCreateAccount: (password: string) => 'email_taken' | null
}) {
  const [password, setPassword] = useState('')
  const [created, setCreated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 4) {
      setError(t(lang, 'Şifre en az 4 karakter olmalı.', 'Password must be at least 4 characters.'))
      return
    }
    const err = onCreateAccount(password)
    if (err === 'email_taken') {
      setError(t(lang, 'Bu e-posta zaten kayıtlı — giriş yapabilirsiniz.', 'This email is already registered — try signing in.'))
      return
    }
    setCreated(true)
  }

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-16 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: 'color-mix(in srgb, var(--site-primary) 18%, transparent)' }}
      >
        <Check className="h-8 w-8" style={{ color: 'var(--site-primary)' }} />
      </div>
      <h1
        className="mt-6 text-2xl font-bold"
        style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
      >
        {t(lang, 'Siparişiniz alındı!', 'Order received!')}
      </h1>
      <p className="mt-3 text-pretty leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
        {t(
          lang,
          `Teşekkürler! Bu bir demo siparişidir — gerçek bir ödeme alınmadı. ${brand} yayına alındığında ${methodLabel(method, lang)} ile gerçek ödemeler burada işlenir.`,
          `Thank you! This is a demo order — no real payment was taken. Once ${brand} goes live, real payments via ${methodLabel(method, lang)} are processed here.`,
        )}
      </p>

      {showAccountOffer && !created ? (
        <form
          onSubmit={handleCreate}
          className="mt-8 flex flex-col gap-3 p-5 text-left"
          style={{
            borderRadius: 'var(--site-radius)',
            border: '1px solid var(--site-border)',
            backgroundColor: 'var(--site-card)',
          }}
        >
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" style={{ color: 'var(--site-primary)' }} aria-hidden />
            <span className="text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
              {t(lang, 'Bu bilgilerle hesap oluştur', 'Create an account with these details')}
            </span>
          </div>
          <p className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
            {t(
              lang,
              `${form.email} için bir şifre belirle, bir sonraki siparişin daha hızlı olsun.`,
              `Set a password for ${form.email} so your next order is faster.`,
            )}
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t(lang, 'Şifre', 'Password')}
            className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
            style={{ border: '1px solid var(--site-border)', backgroundColor: 'var(--site-bg)', color: 'var(--site-fg)' }}
          />
          {error ? (
            <p className="text-xs" style={{ color: '#ef4444' }}>
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            className="mt-1 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ borderRadius: 'var(--site-radius)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
          >
            {t(lang, 'Hesap oluştur', 'Create account')}
          </button>
        </form>
      ) : null}

      {created ? (
        <p
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--site-primary) 12%, transparent)',
            color: 'var(--site-primary)',
          }}
        >
          <UserCheck className="h-4 w-4" aria-hidden />
          {t(lang, 'Hesabınız oluşturuldu ve giriş yapıldı.', 'Account created and signed in.')}
        </p>
      ) : null}

      <div className="mt-8">
        <Link
          href={`/demo/${slug}?lang=${lang}`}
          className="inline-flex items-center justify-center px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            borderRadius: 'var(--site-radius)',
            backgroundColor: 'var(--site-primary)',
            color: 'var(--site-primary-fg)',
          }}
        >
          {t(lang, 'Alışverişe devam et', 'Continue shopping')}
        </Link>
      </div>
    </div>
  )
}

function methodLabel(id: DemoPaymentMethodId, lang: Lang): string {
  const method = DEMO_PAYMENT_OPTIONS.find((m) => m.id === id)
  return method ? pickLang(method.name, lang) : id
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  error,
  required,
  multiline,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  error?: string
  required?: boolean
  multiline?: boolean
}) {
  const invalid = Boolean(error)
  const shared = {
    value,
    required,
    'aria-invalid': invalid,
    'data-invalid': invalid ? 'true' : undefined,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(e.target.value),
    className: 'w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2',
    style: {
      border: invalid ? '1px solid #ef4444' : '1px solid var(--site-border)',
      backgroundColor: 'var(--site-bg)',
      color: 'var(--site-fg)',
    } as React.CSSProperties,
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--site-muted-fg)' }}>
        {label}
        {required ? <span style={{ color: 'var(--site-primary)' }}> *</span> : null}
      </span>
      {multiline ? <textarea rows={3} {...shared} /> : <input type={type} {...shared} />}
      {invalid ? (
        <span className="text-xs" style={{ color: '#ef4444' }}>
          {error}
        </span>
      ) : null}
    </label>
  )
}
