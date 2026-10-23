'use client'

import { Mail, Phone, MapPin } from 'lucide-react'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { resolveSocialLinks } from '@/lib/social-links'
import {
  CONTACT_LOGO_MAX_HEIGHT,
  CONTACT_LOGO_PLATE_BACKGROUND,
  resolveContactLogo,
  type ContactLogo,
} from '@/lib/contact-logo'
import { ContactMap } from '@/components/website-renderer/contact-map'
import { SocialLinks } from '@/components/website-renderer/social-links'
import { ContactForm, type ContactFormLive } from '@/components/website-renderer/sections/contact-form'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type ContactData = Extract<Section, { type: 'contact' }>

export function ContactSection({
  data,
  lang,
  live = null,
  site = null,
}: {
  data: ContactData
  lang: string
  live?: ContactFormLive | null
  /** Whole site: the source of the owner's social media links. */
  site?: WebsiteSchema | null
}) {
  const logo = resolveContactLogo(site, data)
  return (
    <SectionShell id="contact" tinted>
      <div className="grid gap-10 lg:grid-cols-2">
        <div>
          <SectionHeading title={data.title} subtitle={data.description} center={false} />
          <div className="mt-6 grid gap-3 text-sm">
            {data.email && (
              <ContactRow icon={<Mail className="h-4 w-4" />}>{data.email}</ContactRow>
            )}
            {data.phone && (
              <ContactRow icon={<Phone className="h-4 w-4" />}>{data.phone}</ContactRow>
            )}
            {data.address && (
              <ContactRow icon={<MapPin className="h-4 w-4" />}>{data.address}</ContactRow>
            )}
          </div>
          <SocialLinks
            links={resolveSocialLinks(site)}
            variant="contact"
            label={lang === 'en' ? 'Social media' : 'Sosyal medya'}
          />
          {logo && <ContactLogoPlate logo={logo} />}
        </div>

        <ContactForm labels={data.fields} lang={lang} live={live} />
      </div>
      <ContactMap mapEmbed={data.mapEmbed} address={data.address} lang={lang} />
    </SectionShell>
  )
}

function ContactLogoPlate({ logo }: { logo: ContactLogo }) {
  const height = CONTACT_LOGO_MAX_HEIGHT
  const width = logo.ratio ? Math.round(height * logo.ratio) : undefined
  return (
    <div
      data-contact-logo
      className="mt-6 inline-flex max-w-full items-center rounded-2xl p-3"
      style={{
        backgroundColor: CONTACT_LOGO_PLATE_BACKGROUND,
        border: '1px solid var(--site-border)',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={logo.alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        className="h-[72px] w-auto max-w-full object-contain sm:h-24"
      />
    </div>
  )
}

function ContactRow({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3" style={{ color: 'var(--site-fg)' }}>
      <span style={{ color: 'var(--site-primary)' }}>{icon}</span>
      {children}
    </div>
  )
}
