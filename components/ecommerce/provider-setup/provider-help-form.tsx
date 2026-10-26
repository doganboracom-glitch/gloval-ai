'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import type { Lang, ProviderSetupConfig, ProviderSetupOverview } from '@/lib/payment-providers/types'

const copy = {
  tr: {
    title: 'Başvuruda yardım ister misin?',
    description: 'Bilgilerini bırak, platform ekibi seninle e-posta ile iletişime geçsin.',
    name: 'Ad soyad',
    email: 'E-posta',
    phone: 'Cep telefonu',
    consent:
      'Ad, e-posta ve telefonumun, başvuru talebimi iletmek ve benimle iletişime geçmek amacıyla platform ekibine e-posta ile iletilmesini kabul ediyorum. Bu bilgiler kalıcı olarak saklanmaz.',
    send: 'Talebi gönder',
    sending: 'Gönderiliyor…',
    sent: 'Talebin alındı. Ekip e-posta ile seninle iletişime geçecek.',
    off: 'Yardım talebi şu an kullanılamıyor.',
    publishFirst: 'Talep için önce siteyi yayınla.',
    fallbackError: 'Talep şu an gönderilemedi. Biraz sonra tekrar dene.',
  },
  en: {
    title: 'Want help with the application?',
    description: 'Leave your details and the platform team will contact you by e-mail.',
    name: 'Full name',
    email: 'E-mail',
    phone: 'Mobile phone',
    consent:
      'I agree that my name, e-mail and phone are sent by e-mail to the platform team to relay my application request and contact me. These details are not stored.',
    send: 'Send request',
    sending: 'Sending…',
    sent: 'Request received. The team will contact you by e-mail.',
    off: 'The help request is unavailable right now.',
    publishFirst: 'Publish your site first to send a request.',
    fallbackError: 'The request could not be sent right now. Try again shortly.',
  },
}

export function ProviderHelpForm({
  config,
  projectId,
  overview,
  lang,
}: {
  config: ProviderSetupConfig
  projectId: string
  overview: ProviderSetupOverview
  lang: Lang
}) {
  const c = copy[lang]
  const [name, setName] = useState(overview.help.prefill.name)
  const [email, setEmail] = useState(overview.help.prefill.email)
  const [phone, setPhone] = useState(overview.help.prefill.phone)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const live = overview.siteUrl !== null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await config.help.submit(projectId, { name, email, phone }, consent)
      if (result.ok) setSent(true)
      else setError(config.help.errors[result.error]?.[lang] ?? c.fallbackError)
    } catch {
      setError(config.help.errors.unavailable?.[lang] ?? c.fallbackError)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
        {c.sent}
      </p>
    )
  }
  if (!overview.help.enabled) return <p className="text-xs text-muted-foreground">{c.off}</p>

  const field =
    'h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-3" noValidate>
      <div>
        <p className="text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted-foreground">{c.description}</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.name}
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={160} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.email}
        <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.phone}
        <input className={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={24} required />
      </label>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
        <span>{c.consent}</span>
      </label>
      {!live && <p className="text-xs text-muted-foreground">{c.publishFirst}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !consent || !live}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? c.sending : c.send}
      </button>
    </form>
  )
}
