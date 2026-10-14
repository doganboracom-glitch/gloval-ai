'use client'

import { Mail, Phone, MapPin } from 'lucide-react'
import type { Section, WebsiteSchema } from '@/lib/website-schema'
import { resolveSocialLinks } from '@/lib/social-links'
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
        </div>

        <ContactForm labels={data.fields} lang={lang} live={live} />
      </div>
      <ContactMap mapEmbed={data.mapEmbed} address={data.address} lang={lang} />
    </SectionShell>
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
