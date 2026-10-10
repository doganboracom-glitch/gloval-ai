'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  LogOut,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  User as UserIcon,
  ShoppingBag,
  FileText,
  KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  registerStoreCustomer,
  loginStoreCustomer,
  logoutStoreCustomer,
  updateStoreCustomerProfile,
  changeStoreCustomerPassword,
  sendStoreCustomerPasswordReset,
  type StoreCustomer,
  type CustomerOrder,
  type ShippingStatus,
  type InvoiceInfo,
} from '@/lib/store-customer'
import { InvoiceFields, LabeledInput } from '@/components/store/checkout-extras'

const inputClass =
  'h-11 w-full rounded-lg border border-input bg-background/60 px-3 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30'

const orderStatusLabels: Record<string, string> = {
  pending: 'Beklemede',
  paid: 'Ödendi',
  processing: 'Hazırlanıyor',
  shipped: 'Kargoda',
  delivered: 'Teslim edildi',
  cancelled: 'İptal edildi',
}

const shipping: Record<
  ShippingStatus,
  { label: string; icon: typeof Truck; tone: string }
> = {
  preparing: { label: 'Hazırlanıyor', icon: Clock, tone: 'text-amber-500 bg-amber-500/10' },
  shipped: { label: 'Kargoya verildi', icon: Package, tone: 'text-blue-500 bg-blue-500/10' },
  in_transit: { label: 'Kargoda', icon: Truck, tone: 'text-blue-500 bg-blue-500/10' },
  delivered: { label: 'Teslim edildi', icon: CheckCircle2, tone: 'text-green-500 bg-green-500/10' },
  cancelled: { label: 'İptal edildi', icon: Clock, tone: 'text-muted-foreground bg-muted' },
}

function formatPrice(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function CustomerAccount({
  slug,
  storeName,
  customer,
  orders,
  redirect,
}: {
  slug: string
  storeName: string
  customer: StoreCustomer | null
  orders: CustomerOrder[]
  redirect?: string
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <Link
            href={`/site/${slug}/store`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {storeName}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {customer ? (
          <AccountView slug={slug} customer={customer} orders={orders} />
        ) : (
          <AuthView slug={slug} redirect={redirect} />
        )}
      </main>
    </div>
  )
}

/* ------------------------------- logged-in view ----------------------------- */

type Tab = 'orders' | 'profile' | 'invoice' | 'password'

function AccountView({
  slug,
  customer,
  orders,
}: {
  slug: string
  customer: StoreCustomer
  orders: CustomerOrder[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('orders')

  function handleLogout() {
    startTransition(async () => {
      await logoutStoreCustomer(slug)
      router.refresh()
    })
  }

  const tabs: { id: Tab; label: string; icon: typeof ShoppingBag }[] = [
    { id: 'orders', label: 'Siparişlerim', icon: ShoppingBag },
    { id: 'profile', label: 'Profil bilgileri', icon: UserIcon },
    { id: 'invoice', label: 'Fatura bilgileri', icon: FileText },
    { id: 'password', label: 'Şifre', icon: KeyRound },
  ]

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <UserIcon className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold">{customer.name || 'Hesabım'}</h1>
            <p className="text-sm text-muted-foreground">{customer.email}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={pending}
          className="gap-1.5"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
          Çıkış
        </Button>
      </div>

      <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </nav>

      {tab === 'orders' && <OrdersTab slug={slug} orders={orders} />}
      {tab === 'profile' && <ProfileTab slug={slug} customer={customer} />}
      {tab === 'invoice' && <InvoiceTab slug={slug} customer={customer} />}
      {tab === 'password' && <PasswordTab slug={slug} />}
    </div>
  )
}

/* --------------------------------- orders tab -------------------------------- */

function OrdersTab({ slug, orders }: { slug: string; orders: CustomerOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-12 text-center">
        <Package className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Henüz siparişiniz yok.</p>
        <Link href={`/site/${slug}/store`}>
          <Button size="sm">Alışverişe başla</Button>
        </Link>
      </div>
    )
  }

  const active = orders.filter(
    (o) => o.shipping_status === 'shipped' || o.shipping_status === 'in_transit',
  )

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Truck className="size-5 text-primary" />
            Kargodaki siparişler
          </h2>
          <ul className="flex flex-col gap-3">
            {active.map((o) => (
              <OrderCard key={o.id} order={o} highlight />
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Tüm siparişler</h2>
        <ul className="flex flex-col gap-3">
          {orders.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function OrderCard({ order, highlight }: { order: CustomerOrder; highlight?: boolean }) {
  const s = shipping[order.shipping_status]
  const Icon = s.icon
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 ${
        highlight ? 'border-primary/40' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{formatDate(order.created_at)}</p>
          <p className="text-sm text-muted-foreground">
            {order.item_count} ürün · {orderStatusLabels[order.status] ?? order.status}
          </p>
        </div>
        <span className="shrink-0 font-display font-bold">
          {formatPrice(order.total_cents, order.currency)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.tone}`}
        >
          <Icon className="size-3.5" />
          {s.label}
        </span>
        {order.tracking_number && (
          <span className="text-xs text-muted-foreground">
            {order.tracking_carrier ? `${order.tracking_carrier} · ` : ''}
            Takip: <span className="font-mono text-foreground">{order.tracking_number}</span>
          </span>
        )}
        {order.shipping_status === 'delivered' && order.delivered_at && (
          <span className="text-xs text-muted-foreground">
            {formatDate(order.delivered_at)} tarihinde teslim edildi
          </span>
        )}
      </div>
    </li>
  )
}

/* -------------------------------- profile tab -------------------------------- */

function ProfileTab({ slug, customer }: { slug: string; customer: StoreCustomer }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    city: customer.city,
    address: customer.address,
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await updateStoreCustomerProfile({ storeSlug: slug, ...form })
      if (res.ok) {
        setMsg({ tone: 'ok', text: 'Bilgileriniz güncellendi.' })
        router.refresh()
      } else setMsg({ tone: 'err', text: res.error })
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <LabeledInput label="Ad Soyad" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <LabeledInput label="Telefon" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput label="Şehir" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <LabeledInput label="Adres" value={form.address} onChange={(v) => setForm({ ...form, address: v })} />
      </div>
      <FormMessage msg={msg} />
      <Button type="submit" disabled={pending} className="gap-2 self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Kaydet
      </Button>
    </form>
  )
}

/* -------------------------------- invoice tab -------------------------------- */

function InvoiceTab({ slug, customer }: { slug: string; customer: StoreCustomer }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [inv, setInv] = useState<InvoiceInfo>(
    customer.invoice ?? { type: 'individual' },
  )

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      const res = await updateStoreCustomerProfile({ storeSlug: slug, invoice: inv })
      if (res.ok) {
        setMsg({ tone: 'ok', text: 'Fatura bilgileriniz kaydedildi.' })
        router.refresh()
      } else setMsg({ tone: 'err', text: res.error })
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <InvoiceFields value={inv} onChange={setInv} />
      <FormMessage msg={msg} />
      <Button type="submit" disabled={pending} className="gap-2 self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Kaydet
      </Button>
    </form>
  )
}

/* -------------------------------- password tab ------------------------------- */

function PasswordTab({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    if (form.next !== form.confirm) {
      setMsg({ tone: 'err', text: 'Yeni şifreler eşleşmiyor.' })
      return
    }
    startTransition(async () => {
      const res = await changeStoreCustomerPassword({
        storeSlug: slug,
        currentPassword: form.current,
        newPassword: form.next,
      })
      if (res.ok) {
        setMsg({ tone: 'ok', text: 'Şifreniz güncellendi.' })
        setForm({ current: '', next: '', confirm: '' })
      } else setMsg({ tone: 'err', text: res.error ?? 'Şifre değiştirilemedi.' })
    })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <LabeledInput
        label="Mevcut şifre"
        type="password"
        value={form.current}
        onChange={(v) => setForm({ ...form, current: v })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledInput
          label="Yeni şifre"
          type="password"
          value={form.next}
          onChange={(v) => setForm({ ...form, next: v })}
        />
        <LabeledInput
          label="Yeni şifre (tekrar)"
          type="password"
          value={form.confirm}
          onChange={(v) => setForm({ ...form, confirm: v })}
        />
      </div>
      <FormMessage msg={msg} />
      <Button type="submit" disabled={pending} className="gap-2 self-start">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Şifreyi değiştir
      </Button>
    </form>
  )
}

/* --------------------------------- helpers ---------------------------------- */

function FormMessage({ msg }: { msg: { tone: 'ok' | 'err'; text: string } | null }) {
  if (!msg) return null
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-sm ${
        msg.tone === 'ok'
          ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      }`}
    >
      {msg.text}
    </p>
  )
}

/* ------------------------------- auth view ---------------------------------- */

function AuthView({ slug, redirect }: { slug: string; redirect?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [form, setForm] = useState({
    email: '',
    password: '',
    name: '',
    phone: '',
    city: '',
    address: '',
  })

  function onSuccess() {
    if (redirect === 'checkout') router.push(`/site/${slug}/checkout`)
    else router.refresh()
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    startTransition(async () => {
      if (mode === 'forgot') {
        const reset = await sendStoreCustomerPasswordReset({ storeSlug: slug, email: form.email })
        if (!reset.ok) {
          setError(reset.error)
          return
        }
        setNotice(
          'Eğer bu e-posta ile kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.',
        )
        return
      }
      const result =
        mode === 'login'
          ? await loginStoreCustomer({ storeSlug: slug, email: form.email, password: form.password })
          : await registerStoreCustomer({
              storeSlug: slug,
              email: form.email,
              password: form.password,
              name: form.name,
              phone: form.phone,
              city: form.city,
              address: form.address,
            })
      if (result.ok) onSuccess()
      else setError(result.error)
    })
  }

  const title = mode === 'login' ? 'Giriş yap' : mode === 'register' ? 'Üye ol' : 'Şifremi unuttum'

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-1 font-display text-2xl font-bold">{title}</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {mode === 'login'
          ? 'Hesabınıza giriş yaparak siparişlerinizi takip edin.'
          : mode === 'register'
            ? 'Üye olun, bilgileriniz sonraki alışverişlerde hazır gelsin.'
            : 'E-posta adresinizi girin, size bir sıfırlama bağlantısı gönderelim.'}
      </p>

      {mode !== 'forgot' && (
        <div className="mb-6 flex rounded-lg border border-border p-1">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Giriş yap
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            Üye ol
          </button>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === 'register' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Ad Soyad</span>
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">E-posta</span>
          <input
            type="email"
            className={inputClass}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </label>
        {mode !== 'forgot' && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Şifre</span>
            <input
              type="password"
              className={inputClass}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
            />
          </label>
        )}

        {mode === 'login' && (
          <button
            type="button"
            onClick={() => {
              setMode('forgot')
              setError(null)
              setNotice(null)
            }}
            className="-mt-2 self-end text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Şifremi unuttum
          </button>
        )}

        {mode === 'register' && (
          <>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Telefon</span>
              <input
                className={inputClass}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Şehir</span>
                <input
                  className={inputClass}
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Adres</span>
                <input
                  className={inputClass}
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
            </div>
          </>
        )}

        {error && (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
            {notice}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending} className="gap-2">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode === 'login' ? 'Giriş yap' : mode === 'register' ? 'Üyeliği tamamla' : 'Sıfırlama bağlantısı gönder'}
        </Button>
      </form>

      {mode === 'forgot' ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setError(null)
              setNotice(null)
            }}
            className="hover:text-foreground hover:underline"
          >
            Girişe dön
          </button>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href={`/site/${slug}/checkout`} className="hover:text-foreground hover:underline">
            Üye olmadan alışverişe devam et
          </Link>
        </p>
      )}
    </div>
  )
}
