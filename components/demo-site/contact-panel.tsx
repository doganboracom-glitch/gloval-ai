import { Phone, MessageCircle, Mail, MapPin, Clock } from 'lucide-react'
import { pickLang, type Lang } from '@/lib/i18n'
import type { DemoContact } from '@/lib/demo-catalog'
import { telHref, whatsappHref, mailHref } from '@/lib/contact-links'

/**
 * ContactPanel
 * ------------
 * Generic contact page body for every demo: phone, WhatsApp, email, address and
 * hours — all as real, working links. Themed via `--site-*`.
 */
export function ContactPanel({
  contact,
  lang,
  brand,
}: {
  contact: DemoContact
  lang: Lang
  brand: string
}) {
  const title = lang === 'tr' ? 'İletişime geçin' : 'Get in touch'
  const subtitle =
    lang === 'tr'
      ? `${brand} ekibine ulaşın — telefon, WhatsApp veya e-posta ile hızlıca yanıt veriyoruz.`
      : `Reach the ${brand} team — we respond quickly by phone, WhatsApp or email.`
  const waMessage = lang === 'tr' ? `Merhaba, bilgi almak istiyorum.` : `Hi, I'd like some information.`

  const rows = [
    { icon: Phone, label: lang === 'tr' ? 'Telefon' : 'Phone', value: contact.phoneDisplay, href: telHref(contact.phoneTel) },
    { icon: MessageCircle, label: 'WhatsApp', value: contact.phoneDisplay, href: whatsappHref(contact.whatsapp, waMessage), external: true },
    { icon: Mail, label: lang === 'tr' ? 'E-posta' : 'Email', value: contact.email, href: mailHref(contact.email) },
  ]

  return (
    <section className="mx-auto w-full max-w-5xl px-6 py-12 sm:py-16">
      <header className="mb-8">
        <h1
          className="text-3xl font-bold tracking-tight text-balance sm:text-4xl"
          style={{ color: 'var(--site-fg)', fontFamily: 'var(--site-heading-font)' }}
        >
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty leading-relaxed" style={{ color: 'var(--site-muted-fg)' }}>
          {subtitle}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {rows.map((row) => (
          <a
            key={row.label}
            href={row.href}
            target={row.external ? '_blank' : undefined}
            rel={row.external ? 'noopener noreferrer' : undefined}
            className="flex flex-col gap-2 p-5 transition-transform hover:-translate-y-1"
            style={{
              borderRadius: 'var(--site-radius)',
              border: '1px solid var(--site-border)',
              backgroundColor: 'var(--site-card)',
            }}
          >
            <row.icon className="h-5 w-5" style={{ color: 'var(--site-primary)' }} aria-hidden />
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--site-muted-fg)' }}>
              {row.label}
            </span>
            <span className="text-sm font-semibold" style={{ color: 'var(--site-fg)' }}>
              {row.value}
            </span>
          </a>
        ))}
      </div>

      <div
        className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div
          className="flex items-start gap-3 p-5"
          style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
        >
          <MapPin className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden />
          <div>
            <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--site-muted-fg)' }}>
              {lang === 'tr' ? 'Adres' : 'Address'}
            </span>
            <span className="text-sm" style={{ color: 'var(--site-fg)' }}>{pickLang(contact.address, lang)}</span>
          </div>
        </div>
        <div
          className="flex items-start gap-3 p-5"
          style={{ borderRadius: 'var(--site-radius)', border: '1px solid var(--site-border)', backgroundColor: 'var(--site-card)' }}
        >
          <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: 'var(--site-primary)' }} aria-hidden />
          <div>
            <span className="block text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--site-muted-fg)' }}>
              {lang === 'tr' ? 'Çalışma saatleri' : 'Hours'}
            </span>
            <span className="text-sm" style={{ color: 'var(--site-fg)' }}>{pickLang(contact.hours, lang)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
