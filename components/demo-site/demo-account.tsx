'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  LogIn,
  UserPlus,
  LogOut,
  ShoppingBag,
  ShieldCheck,
  Mail,
  User as UserIcon,
  Pencil,
  KeyRound,
  Package,
  Truck,
  CheckCircle2,
  Clock,
} from 'lucide-react'
import type { Lang } from '@/lib/i18n'
import {
  useDemoAccount,
  demoShipment,
  type DemoProfile,
  type DemoOrder,
  type DemoShipmentStatus,
  type DemoAccountApi,
} from '@/components/demo-site/use-demo-account'
import { formatPrice } from '@/components/store/cart-provider'

const t = (lang: Lang, tr: string, en: string) => (lang === 'tr' ? tr : en)

/**
 * DemoAccount
 * -----------
 * The simulated membership screen for a commerce demo. When signed out it
 * offers register / login / continue-as-guest; when signed in it shows the
 * saved profile (which prefills checkout) and a sign-out control. Everything is
 * localStorage-backed via `useDemoAccount` — a preview of the real, Supabase
 * backed customer accounts a published store gets.
 */
export function DemoAccount({
  slug,
  lang,
  brand,
}: {
  slug: string
  lang: Lang
  brand: string
}) {
  const account = useDemoAccount(slug)
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const shopHref = `/demo/${slug}/urunler?lang=${lang}`

  if (!account.ready) {
    return <div className="mx-auto w-full max-w-md px-6 py-20" aria-hidden />
  }

  if (account.profile) {
    return <SignedInView account={account} lang={lang} brand={brand} shopHref={shopHref} />
  }

  return (
    <div className="mx-auto w-full max-w-md px-6 py-12 sm:py-16">
      <h1
        className="text-2xl font-bold tracking-tight"
        style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
      >
        {mode === 'login' ? t(lang, 'Giriş yap', 'Sign in') : t(lang, 'Üye ol', 'Create account')}
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
        {mode === 'login'
          ? t(lang, 'Hesabınla giriş yap ya da yeni üyelik oluştur.', 'Sign in or create a new membership.')
          : t(lang, 'Bilgilerin bir sonraki alışverişinde hazır olsun.', 'Save your details for faster checkout.')}
      </p>

      {/* Tab switch */}
      <div
        className="mt-6 flex rounded-lg p-1"
        style={{ backgroundColor: 'color-mix(in srgb, var(--site-fg) 6%, transparent)' }}
      >
        <TabButton active={mode === 'login'} onClick={() => setMode('login')}>
          <LogIn className="h-4 w-4" aria-hidden />
          {t(lang, 'Giriş', 'Sign in')}
        </TabButton>
        <TabButton active={mode === 'register'} onClick={() => setMode('register')}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {t(lang, 'Üye ol', 'Register')}
        </TabButton>
      </div>

      {mode === 'login' ? (
        <LoginForm account={account} lang={lang} />
      ) : (
        <RegisterForm account={account} lang={lang} />
      )}

      {/* Guest option */}
      <div className="mt-6 flex items-center gap-3">
        <span className="h-px flex-1" style={{ backgroundColor: 'var(--site-border)' }} />
        <span className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
          {t(lang, 'veya', 'or')}
        </span>
        <span className="h-px flex-1" style={{ backgroundColor: 'var(--site-border)' }} />
      </div>
      <Link
        href={shopHref}
        className="mt-4 inline-flex w-full items-center justify-center px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-70"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', color: 'var(--site-fg)' }}
      >
        {t(lang, 'Üyeliksiz devam et', 'Continue as guest')}
      </Link>
    </div>
  )
}

/* -------------------------- signed-in dashboard --------------------------- */

function SignedInView({
  account,
  lang,
  brand,
  shopHref,
}: {
  account: DemoAccountApi
  lang: Lang
  brand: string
  shopHref: string
}) {
  const [tab, setTab] = useState<'profile' | 'orders'>('profile')
  const profile = account.profile!

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-12 sm:py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
          >
            {t(lang, 'Hesabım', 'My account')}
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
            {t(lang, `${brand} üyesi olarak giriş yaptınız.`, `Signed in as a ${brand} member.`)}
          </p>
        </div>
        <button
          type="button"
          onClick={account.logout}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ border: '1px solid var(--site-border)', color: 'var(--site-fg)' }}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          {t(lang, 'Çıkış', 'Sign out')}
        </button>
      </div>

      {/* Tabs */}
      <div
        className="mt-6 flex rounded-lg p-1"
        style={{ backgroundColor: 'color-mix(in srgb, var(--site-fg) 6%, transparent)' }}
      >
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')}>
          <UserIcon className="h-4 w-4" aria-hidden />
          {t(lang, 'Profil', 'Profile')}
        </TabButton>
        <TabButton active={tab === 'orders'} onClick={() => setTab('orders')}>
          <Package className="h-4 w-4" aria-hidden />
          {t(lang, 'Siparişlerim', 'My orders')}
          {account.orders.length > 0 ? (
            <span
              className="ml-1 rounded-full px-1.5 text-[11px] font-bold"
              style={{ backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
            >
              {account.orders.length}
            </span>
          ) : null}
        </TabButton>
      </div>

      {tab === 'profile' ? (
        <ProfilePanel account={account} lang={lang} profile={profile} shopHref={shopHref} />
      ) : (
        <OrdersPanel orders={account.orders} lang={lang} shopHref={shopHref} />
      )}
    </div>
  )
}

function ProfilePanel({
  account,
  lang,
  profile,
  shopHref,
}: {
  account: DemoAccountApi
  lang: Lang
  profile: DemoProfile
  shopHref: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DemoProfile>(profile)

  function save(e: React.FormEvent) {
    e.preventDefault()
    account.updateProfile({
      name: draft.name,
      phone: draft.phone,
      city: draft.city,
      address: draft.address,
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <form onSubmit={save} className="mt-6 flex flex-col gap-4">
        <DemoField label={t(lang, 'Ad Soyad', 'Full name')} value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} required />
        <DemoField label={t(lang, 'Telefon', 'Phone')} type="tel" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
        <DemoField label={t(lang, 'Şehir', 'City')} value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} />
        <DemoField label={t(lang, 'Adres', 'Address')} value={draft.address} onChange={(v) => setDraft({ ...draft, address: v })} />
        <div className="mt-1 flex gap-3">
          <SubmitButton>{t(lang, 'Kaydet', 'Save')}</SubmitButton>
          <button
            type="button"
            onClick={() => {
              setDraft(profile)
              setEditing(false)
            }}
            className="inline-flex items-center justify-center px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-70"
            style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', color: 'var(--site-fg)' }}
          >
            {t(lang, 'Vazgeç', 'Cancel')}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div
        className="mt-6 flex flex-col gap-3 p-5"
        style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
      >
        <ProfileRow icon={<UserIcon className="h-4 w-4" />} value={profile.name} />
        <ProfileRow icon={<Mail className="h-4 w-4" />} value={profile.email} />
        {profile.phone ? <ProfileRow value={profile.phone} /> : null}
        {profile.city || profile.address ? (
          <ProfileRow value={[profile.address, profile.city].filter(Boolean).join(', ')} />
        ) : null}
      </div>

      <p className="mt-4 inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--site-muted-fg)' }}>
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {t(
          lang,
          'Bilgileriniz ödeme sırasında otomatik doldurulacak. (Demo — tarayıcınızda saklanır.)',
          'Your details will prefill at checkout. (Demo — stored in your browser.)',
        )}
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => {
            setDraft(profile)
            setEditing(true)
          }}
          className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ borderRadius: 'var(--site-radius)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          <Pencil className="h-4 w-4" aria-hidden />
          {t(lang, 'Bilgileri düzenle', 'Edit details')}
        </button>
        <Link
          href={shopHref}
          className="inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-70"
          style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', color: 'var(--site-fg)' }}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden />
          {t(lang, 'Alışverişe başla', 'Start shopping')}
        </Link>
      </div>
    </>
  )
}

function OrdersPanel({ orders, lang, shopHref }: { orders: DemoOrder[]; lang: Lang; shopHref: string }) {
  if (orders.length === 0) {
    return (
      <div
        className="mt-6 flex flex-col items-center gap-3 p-8 text-center"
        style={{ borderRadius: 'var(--site-radius)', border: '1px dashed var(--site-border)', backgroundColor: 'var(--site-card)' }}
      >
        <Package className="h-8 w-8" style={{ color: 'var(--site-muted-fg)' }} aria-hidden />
        <p className="text-sm" style={{ color: 'var(--site-fg)' }}>
          {t(lang, 'Henüz siparişiniz yok.', 'You have no orders yet.')}
        </p>
        <Link
          href={shopHref}
          className="mt-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ borderRadius: 'var(--site-radius)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          <ShoppingBag className="h-4 w-4" aria-hidden />
          {t(lang, 'Alışverişe başla', 'Start shopping')}
        </Link>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {orders.map((order) => (
        <OrderCard key={order.id} order={order} lang={lang} />
      ))}
    </div>
  )
}

const SHIPMENT_META: Record<
  DemoShipmentStatus,
  { icon: typeof Clock; tr: string; en: string }
> = {
  preparing: { icon: Clock, tr: 'Hazırlanıyor', en: 'Preparing' },
  shipped: { icon: Package, tr: 'Kargoya verildi', en: 'Shipped' },
  in_transit: { icon: Truck, tr: 'Yolda', en: 'In transit' },
  delivered: { icon: CheckCircle2, tr: 'Teslim edildi', en: 'Delivered' },
}

function OrderCard({ order, lang }: { order: DemoOrder; lang: Lang }) {
  const { status, trackingNo } = demoShipment(order)
  const meta = SHIPMENT_META[status]
  const StatusIcon = meta.icon
  const dateStr = new Date(order.createdAt).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div
      className="flex flex-col gap-3 p-5"
      style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
          #{order.id}
        </span>
        <span className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
          {dateStr}
        </span>
      </div>

      <ul className="flex flex-col gap-1">
        {order.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm" style={{ color: 'var(--site-muted-fg)' }}>
            <span className="flex-1 truncate">
              {item.name} <span className="opacity-70">× {item.quantity}</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--site-border)' }}>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{
            backgroundColor:
              status === 'delivered'
                ? 'color-mix(in srgb, #16a34a 16%, transparent)'
                : 'color-mix(in srgb, var(--site-primary) 12%, transparent)',
            color: status === 'delivered' ? '#16a34a' : 'var(--site-primary)',
          }}
        >
          <StatusIcon className="h-3.5 w-3.5" aria-hidden />
          {t(lang, meta.tr, meta.en)}
        </span>
        <span className="text-sm font-bold" style={{ color: 'var(--site-fg)' }}>
          {formatPrice(order.totalCents, order.currency)}
        </span>
      </div>

      {trackingNo ? (
        <p className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
          {t(lang, 'Takip no', 'Tracking no')}: <span className="font-mono font-medium">{trackingNo}</span>
        </p>
      ) : (
        <p className="text-xs" style={{ color: 'var(--site-muted-fg)' }}>
          {t(lang, 'Kargo takip numarası hazırlanıyor.', 'Tracking number is being generated.')}
        </p>
      )}
    </div>
  )
}

function LoginForm({ account, lang }: { account: ReturnType<typeof useDemoAccount>; lang: Lang }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [forgot, setForgot] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const err = account.login(email, password)
    if (err) {
      setError(t(lang, 'E-posta veya şifre hatalı.', 'Invalid email or password.'))
    }
  }

  if (forgot) {
    return <ForgotPasswordForm account={account} lang={lang} onBack={() => setForgot(false)} />
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <DemoField label={t(lang, 'E-posta', 'Email')} type="email" value={email} onChange={setEmail} required />
      <DemoField
        label={t(lang, 'Şifre', 'Password')}
        type="password"
        value={password}
        onChange={setPassword}
        required
      />
      {error ? <FieldError>{error}</FieldError> : null}
      <SubmitButton>{t(lang, 'Giriş yap', 'Sign in')}</SubmitButton>
      <button
        type="button"
        onClick={() => setForgot(true)}
        className="inline-flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--site-primary)' }}
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden />
        {t(lang, 'Şifremi unuttum', 'Forgot password')}
      </button>
    </form>
  )
}

/**
 * Simulated password reset. There is no email in the demo, so instead of
 * sending a link we show a "reset code sent" step then let the user set a new
 * password locally — mirroring the real store's request/confirm reset flow.
 */
function ForgotPasswordForm({
  account,
  lang,
  onBack,
}: {
  account: DemoAccountApi
  lang: Lang
  onBack: () => void
}) {
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  function request(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    // Demo: always advance to the reset step (don't reveal whether the email exists).
    setStep('reset')
  }

  function reset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 4) {
      setError(t(lang, 'Şifre en az 4 karakter olmalı.', 'Password must be at least 4 characters.'))
      return
    }
    const err = account.resetPassword(email, password)
    if (err === 'unknown_email') {
      setError(t(lang, 'Bu e-posta ile kayıtlı üye bulunamadı.', 'No member found with this email.'))
      return
    }
    setDone(true)
  }

  if (done) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div
          className="flex items-center gap-2.5 p-4 text-sm"
          style={{
            borderRadius: 'var(--site-radius)',
            border: '1px solid var(--site-border)',
            backgroundColor: 'color-mix(in srgb, #16a34a 10%, transparent)',
            color: 'var(--site-fg)',
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: '#16a34a' }} aria-hidden />
          {t(lang, 'Şifreniz güncellendi. Artık yeni şifrenizle giriş yapabilirsiniz.', 'Your password was updated. You can now sign in with the new password.')}
        </div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex w-full items-center justify-center px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{ borderRadius: 'var(--site-radius)', backgroundColor: 'var(--site-primary)', color: 'var(--site-primary-fg)' }}
        >
          {t(lang, 'Girişe dön', 'Back to sign in')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={step === 'request' ? request : reset} className="mt-6 flex flex-col gap-4">
      {step === 'request' ? (
        <>
          <p className="text-sm" style={{ color: 'var(--site-muted-fg)' }}>
            {t(
              lang,
              'Kayıtlı e-postanı gir; sana bir sıfırlama kodu gönderelim. (Demo — kod simüle edilir.)',
              'Enter your registered email and we\u2019ll send a reset code. (Demo — the code is simulated.)',
            )}
          </p>
          <DemoField label={t(lang, 'E-posta', 'Email')} type="email" value={email} onChange={setEmail} required />
          <SubmitButton>{t(lang, 'Sıfırlama kodu gönder', 'Send reset code')}</SubmitButton>
        </>
      ) : (
        <>
          <div
            className="flex items-center gap-2.5 p-3 text-xs"
            style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', color: 'var(--site-muted-fg)' }}
          >
            <Mail className="h-4 w-4 shrink-0" aria-hidden />
            {t(lang, `${email} adresine sıfırlama kodu gönderildi (demo).`, `A reset code was sent to ${email} (demo).`)}
          </div>
          <DemoField label={t(lang, 'Yeni şifre', 'New password')} type="password" value={password} onChange={setPassword} required />
          {error ? <FieldError>{error}</FieldError> : null}
          <SubmitButton>{t(lang, 'Şifreyi güncelle', 'Update password')}</SubmitButton>
        </>
      )}
      {error && step === 'request' ? <FieldError>{error}</FieldError> : null}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center justify-center text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--site-muted-fg)' }}
      >
        {t(lang, 'Girişe dön', 'Back to sign in')}
      </button>
    </form>
  )
}

function RegisterForm({ account, lang }: { account: ReturnType<typeof useDemoAccount>; lang: Lang }) {
  const [data, setData] = useState<DemoProfile & { password: string }>({
    name: '',
    email: '',
    phone: '',
    city: '',
    address: '',
    password: '',
  })
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof typeof data>(key: K, value: string) {
    setData((d) => ({ ...d, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!data.name.trim() || !data.email.trim() || data.password.length < 4) {
      setError(t(lang, 'Ad, e-posta ve en az 4 karakterli şifre gerekli.', 'Name, email and a 4+ char password are required.'))
      return
    }
    const err = account.register(data)
    if (err === 'email_taken') {
      setError(t(lang, 'Bu e-posta zaten kayıtlı.', 'This email is already registered.'))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
      <DemoField label={t(lang, 'Ad Soyad', 'Full name')} value={data.name} onChange={(v) => set('name', v)} required />
      <DemoField label={t(lang, 'E-posta', 'Email')} type="email" value={data.email} onChange={(v) => set('email', v)} required />
      <DemoField label={t(lang, 'Telefon', 'Phone')} type="tel" value={data.phone} onChange={(v) => set('phone', v)} />
      <DemoField label={t(lang, 'Şifre', 'Password')} type="password" value={data.password} onChange={(v) => set('password', v)} required />
      {error ? <FieldError>{error}</FieldError> : null}
      <SubmitButton>{t(lang, 'Üye ol', 'Create account')}</SubmitButton>
    </form>
  )
}

/* -------------------------------- primitives ------------------------------- */

function ProfileRow({ icon, value }: { icon?: React.ReactNode; value: string }) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--site-fg)' }}>
      {icon ? <span style={{ color: 'var(--site-muted-fg)' }}>{icon}</span> : <span className="w-4" />}
      <span className="truncate">{value}</span>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-colors"
      style={{
        backgroundColor: active ? 'var(--site-card)' : 'transparent',
        color: active ? 'var(--site-fg)' : 'var(--site-muted-fg)',
        border: active ? '1px solid var(--site-border)' : '1px solid transparent',
      }}
    >
      {children}
    </button>
  )
}

function DemoField({
  label,
  type = 'text',
  value,
  onChange,
  required,
}: {
  label: string
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--site-muted-fg)' }}>
        {label}
        {required ? <span style={{ color: 'var(--site-primary)' }}> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors focus:ring-2"
        style={{
          border: '1px solid var(--site-border)',
          backgroundColor: 'var(--site-bg)',
          color: 'var(--site-fg)',
        }}
      />
    </label>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-lg px-3 py-2 text-sm"
      style={{
        backgroundColor: 'color-mix(in srgb, #ef4444 12%, transparent)',
        color: '#ef4444',
      }}
    >
      {children}
    </p>
  )
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="mt-1 inline-flex w-full items-center justify-center px-5 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
      style={{
        borderRadius: 'var(--site-radius)',
        backgroundColor: 'var(--site-primary)',
        color: 'var(--site-primary-fg)',
      }}
    >
      {children}
    </button>
  )
}
