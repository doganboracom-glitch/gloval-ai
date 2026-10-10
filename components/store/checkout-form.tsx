'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Lock, PackageOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CartProvider, useCart, formatPrice } from './cart-provider'
import { createOrder } from '@/lib/store'
import type { PaymentProviderId } from '@/lib/payments/types'
import { PaymentMethodSelect, normalizeMethods } from './payment-method-select'
import { UserCheck, LogIn } from 'lucide-react'
import {
  InvoiceFields,
  InvoiceHeading,
  LegalConsent,
  type InvoiceInput,
  type LegalConsentState,
} from './checkout-extras'

export type CheckoutCustomer = {
  name: string
  email: string
  phone: string
  city: string
  address: string
  invoice?: InvoiceInput | null
} | null

export function CheckoutForm({
  slug,
  storeName,
  methods = ['mock'],
  publicConfig = {},
  customer = null,
}: {
  slug: string
  storeName: string
  methods?: PaymentProviderId[]
  publicConfig?: Record<string, unknown>
  customer?: CheckoutCustomer
}) {
  return (
    <CartProvider slug={slug}>
      <CheckoutInner
        slug={slug}
        storeName={storeName}
        methods={normalizeMethods(methods)}
        publicConfig={publicConfig}
        customer={customer}
      />
    </CartProvider>
  )
}

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

function CheckoutInner({
  slug,
  storeName,
  methods,
  publicConfig,
  customer,
}: {
  slug: string
  storeName: string
  methods: PaymentProviderId[]
  publicConfig: Record<string, unknown>
  customer: CheckoutCustomer
}) {
  const cart = useCart()
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentProviderId>(methods[0] ?? 'mock')
  // Prefill from the logged-in customer's saved profile. Name is stored as a
  // single field on the account, so it maps to the first-name box.
  const [form, setForm] = useState({
    name: customer?.name ?? '',
    lastName: '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address: customer?.address ?? '',
    district: '',
    city: customer?.city ?? '',
    postalCode: '',
  })
  // Optional invoice — prefilled from the account's saved invoice profile.
  const [wantsInvoice, setWantsInvoice] = useState<boolean>(Boolean(customer?.invoice))
  const [invoice, setInvoice] = useState<InvoiceInput>(
    customer?.invoice ?? { type: 'individual' },
  )
  // Mandatory distance-selling + KVKK consent.
  const [consent, setConsent] = useState<LegalConsentState>({ sales: false, kvkk: false })

  // Stable idempotency key for this checkout attempt (per mount).
  const idempotencyKey = useMemo(
    () => `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    [slug],
  )

  const errorMessages: Record<string, string> = {
    missing_customer: 'Lütfen ad ve e-posta bilgilerini gir.',
    empty_cart: 'Sepetin boş.',
    insufficient_stock: 'Bazı ürünlerde yeterli stok yok.',
    invalid_items: 'Sepetteki bazı ürünler artık mevcut değil.',
    invalid_quantity: 'Geçersiz adet.',
    quantity_too_high: 'Bir üründen çok fazla adet var.',
    too_many_items: 'Sepette çok fazla ürün var.',
    store_not_found: 'Mağaza bulunamadı.',
    order_failed: 'Sipariş oluşturulamadı. Lütfen tekrar dene.',
    bad_request: 'Bir hata oluştu. Lütfen tekrar dene.',
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || cart.items.length === 0) return

    // Buyer cannot complete the order without the required delivery details.
    const required: [keyof typeof form, string][] = [
      ['name', 'Ad'],
      ['lastName', 'Soyad'],
      ['email', 'E-posta'],
      ['phone', 'Telefon'],
      ['address', 'Adres'],
      ['city', 'Şehir'],
    ]
    const missing = required.find(([k]) => !String(form[k] ?? '').trim())
    if (missing) {
      setError(`Lütfen "${missing[1]}" alanını doldurun.`)
      return
    }

    if (!consent.sales || !consent.kvkk) {
      setError('Devam etmek için sözleşmeleri ve KVKK metnini onaylamalısınız.')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await createOrder({
      storeSlug: slug,
      idempotencyKey,
      customer: form,
      items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      paymentMethod,
      invoice: wantsInvoice ? invoice : null,
    })

    if (result.ok) {
      cart.clear()
      router.push(result.orderPath)
    } else {
      setError(errorMessages[result.error] ?? errorMessages.order_failed)
      setSubmitting(false)
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <PackageOpen className="size-12 text-muted-foreground" />
        <h1 className="font-display text-xl font-bold">Sepetin boş</h1>
        <Link href={`/site/${slug}/store`}>
          <Button>Mağazaya dön</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-4">
          <Link
            href={`/site/${slug}/store`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Mağaza
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <h1 className="font-display text-2xl font-bold">Ödeme</h1>

          {customer ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2.5 text-sm">
              <UserCheck className="size-4 shrink-0 text-primary" />
              <span>
                <span className="font-medium">{customer.name || customer.email}</span> olarak giriş
                yaptınız — bilgileriniz dolduruldu.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Hesabınız mı var? Bilgileriniz hazır gelsin.</span>
              <Link
                href={`/site/${slug}/hesap?redirect=checkout`}
                className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
              >
                <LogIn className="size-4" />
                Giriş yap / Üye ol
              </Link>
            </div>
          )}

          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ad" required>
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </Field>
              <Field label="Soyad" required>
                <input
                  className={inputClass}
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="E-posta" required>
                <input
                  type="email"
                  className={inputClass}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
              </Field>
              <Field label="Telefon" required>
                <input
                  className={inputClass}
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="Adres" required>
              <input
                className={inputClass}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                required
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="İlçe">
                <input
                  className={inputClass}
                  value={form.district}
                  onChange={(e) => setForm({ ...form, district: e.target.value })}
                />
              </Field>
              <Field label="Şehir" required>
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  required
                />
              </Field>
              <Field label="Posta kodu">
                <input
                  className={inputClass}
                  inputMode="numeric"
                  value={form.postalCode}
                  onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <div className="mt-2 border-t border-border pt-5">
            <label className="flex items-center gap-2.5 text-sm font-medium">
              <input
                type="checkbox"
                className="size-4 accent-[var(--site-primary,theme(colors.primary.DEFAULT))]"
                checked={wantsInvoice}
                onChange={(e) => setWantsInvoice(e.target.checked)}
              />
              Fatura bilgisi eklemek istiyorum
            </label>
            {wantsInvoice && (
              <div className="mt-4">
                <InvoiceHeading />
                <InvoiceFields value={invoice} onChange={setInvoice} />
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-border pt-5">
            <PaymentMethodSelect
              methods={methods}
              value={paymentMethod}
              onChange={setPaymentMethod}
              publicConfig={publicConfig}
            />
          </div>

          <div className="border-t border-border pt-5">
            <LegalConsent storeName={storeName} value={consent} onChange={setConsent} />
          </div>

          {error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={submitting} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                İşleniyor...
              </>
            ) : (
              <>
                <Lock className="size-4" />
                Siparişi tamamla · {formatPrice(cart.subtotalCents, cart.currency)}
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Bu bir test ödeme akışıdır. Gerçek kart bilgisi girilmez.
          </p>
        </form>

        <aside className="h-fit rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-lg font-bold">Sipariş özeti</h2>
          <ul className="mt-4 divide-y divide-border">
            {cart.items.map((item) => (
              <li key={item.productId} className="flex items-center justify-between gap-2 py-3 text-sm">
                <span className="line-clamp-1">
                  {item.name} <span className="text-muted-foreground">× {item.quantity}</span>
                </span>
                <span className="shrink-0 font-medium">
                  {formatPrice(item.priceCents * item.quantity, item.currency)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-muted-foreground">Toplam</span>
            <span className="font-display text-xl font-bold">
              {formatPrice(cart.subtotalCents, cart.currency)}
            </span>
          </div>
        </aside>
      </main>
    </div>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  )
}
