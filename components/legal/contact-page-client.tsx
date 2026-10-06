'use client'

import { useState, useTransition } from 'react'
import { ArrowLeft, Mail, Phone, MapPin, Building2, ShieldCheck, Send, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Button } from '@/components/ui/button'
import { COMPANY, isPlaceholder } from '@/lib/legal/company'
import { submitContactRequest } from '@/lib/support/contact'

/**
 * İletişim sayfası. İletişim kanalları merkezi `COMPANY` yapılandırmasından
 * gelir; bir alan hâlâ placeholder ise yanında "eksik" etiketi gösterilir.
 *
 * Kurumsal bilgi tablosunun yerini, gönderilen her talebi admin panelindeki
 * "Destek" ekranına bir talep (ticket) olarak düşüren bir iletişim formu aldı.
 */
export function ContactPageClient() {
  const { t, lang } = useLanguage()
  const tr = lang === 'tr'

  const rows = [
    { icon: Building2, label: tr ? 'Şirket unvanı' : 'Legal name', value: COMPANY.legalName },
    { icon: Mail, label: tr ? 'Destek e-postası' : 'Support email', value: COMPANY.supportEmail, href: `mailto:${COMPANY.supportEmail}` },
    { icon: ShieldCheck, label: tr ? 'KVKK başvuru' : 'Data requests', value: COMPANY.kvkkEmail, href: `mailto:${COMPANY.kvkkEmail}` },
    { icon: Phone, label: tr ? 'Telefon' : 'Phone', value: COMPANY.phone, href: `tel:${COMPANY.phone.replace(/\s+/g, '')}` },
    { icon: MapPin, label: tr ? 'Adres' : 'Address', value: COMPANY.address },
  ]

  const missing = tr ? 'Eksik' : 'Missing'

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t.nav.backHome}
        </Link>

        <header className="mt-8">
          <h1 className="text-balance font-display text-3xl font-bold tracking-tight sm:text-4xl">
            {tr ? 'İletişim' : 'Contact'}
          </h1>
          <p className="mt-3 text-pretty leading-relaxed text-muted-foreground">
            {tr
              ? 'Sorularınız ve destek talepleriniz için aşağıdaki kanallardan bize ulaşabilir veya formu doldurabilirsiniz.'
              : 'Reach us through the channels below or send us a message using the form.'}
          </p>
        </header>

        <div className="mt-10 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => {
            const Icon = row.icon
            const ph = isPlaceholder(row.value)
            return (
              <div
                key={row.label}
                className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-4"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/12 text-brand">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {row.label}
                  </p>
                  {ph ? (
                    <p className="mt-1 break-words text-sm text-muted-foreground">
                      {row.value}{' '}
                      <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                        {missing}
                      </span>
                    </p>
                  ) : row.href ? (
                    <a
                      href={row.href}
                      className="mt-1 block break-words text-sm font-medium text-foreground transition-colors hover:text-brand"
                    >
                      {row.value}
                    </a>
                  ) : (
                    <p className="mt-1 break-words text-sm font-medium text-foreground">
                      {row.value}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <ContactForm tr={tr} />
      </main>
      <SiteFooter />
    </div>
  )
}

/** İletişim formu — gönderim admin panelinde destek talebi olarak açılır. */
function ContactForm({ tr }: { tr: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await submitContactRequest({ name, email, message })
      if (res.ok) {
        setDone(true)
        setName('')
        setEmail('')
        setMessage('')
      } else {
        setError(
          res.error === 'invalid_email'
            ? tr
              ? 'Lütfen geçerli bir e-posta adresi girin.'
              : 'Please enter a valid email address.'
            : res.error === 'invalid_name'
              ? tr
                ? 'Lütfen adınızı girin.'
                : 'Please enter your name.'
              : res.error === 'invalid_message'
                ? tr
                  ? 'Mesajınız en az 10 karakter olmalı.'
                  : 'Your message must be at least 10 characters.'
                : tr
                  ? 'Talebiniz gönderilemedi. Lütfen tekrar deneyin.'
                  : 'Could not send your request. Please try again.',
        )
      }
    })
  }

  const inputCls =
    'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/40'

  return (
    <section className="mt-12">
      <h2 className="font-display text-xl font-semibold tracking-tight">
        {tr ? 'Bize Yazın' : 'Send us a message'}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {tr
          ? 'Formu doldurun; talebiniz ekibimize destek kaydı olarak iletilir ve en kısa sürede dönüş yaparız.'
          : 'Fill in the form and your request will reach our team as a support ticket. We will get back to you shortly.'}
      </p>

      {done ? (
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand/40 bg-brand/10 px-4 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {tr ? 'Talebiniz alındı' : 'Your request was received'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr
                ? 'En kısa sürede e-posta ile size dönüş yapacağız.'
                : 'We will reply to you by email as soon as possible.'}
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
                {tr ? 'Ad Soyad' : 'Full name'}
              </label>
              <input
                id="contact-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                className={inputCls}
                placeholder={tr ? 'Adınız' : 'Your name'}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
                {tr ? 'E-posta' : 'Email'}
              </label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputCls}
                placeholder={tr ? 'ornek@eposta.com' : 'you@example.com'}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
              {tr ? 'Mesajınız' : 'Message'}
            </label>
            <textarea
              id="contact-message"
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className={inputCls + ' resize-y leading-relaxed'}
              placeholder={
                tr ? 'Size nasıl yardımcı olabiliriz?' : 'How can we help you?'
              }
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            disabled={pending}
            className="self-start gap-2 bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {pending
              ? tr
                ? 'Gönderiliyor...'
                : 'Sending...'
              : tr
                ? 'Gönder'
                : 'Send'}
          </Button>
        </form>
      )}
    </section>
  )
}
