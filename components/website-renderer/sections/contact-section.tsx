'use client'

import { Mail, Phone, MapPin } from 'lucide-react'
import type { Section } from '@/lib/website-schema'
import {
  SectionShell,
  SectionHeading,
} from '@/components/website-renderer/primitives'

type ContactData = Extract<Section, { type: 'contact' }>

export function ContactSection({
  data,
  submitLabel = 'Send',
}: {
  data: ContactData
  submitLabel?: string
}) {
  const fields = data.fields && data.fields.length > 0 ? data.fields : ['Name', 'Email', 'Message']

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
        </div>

        <form
          className="grid gap-3"
          onSubmit={(e) => e.preventDefault()}
          style={{
            backgroundColor: 'var(--site-bg)',
            border: '1px solid var(--site-border)',
            borderRadius: 'var(--site-radius)',
            padding: '1.25rem',
          }}
        >
          {fields.map((label) => {
            const isMessage = /message|mesaj/i.test(label)
            return (
              <label key={label} className="grid gap-1.5 text-xs font-medium" style={{ color: 'var(--site-muted-fg)' }}>
                {label}
                {isMessage ? (
                  <textarea
                    rows={3}
                    className="resize-none px-3 py-2 text-sm outline-none"
                    style={fieldStyle}
                  />
                ) : (
                  <input
                    type="text"
                    className="px-3 py-2 text-sm outline-none"
                    style={fieldStyle}
                  />
                )}
              </label>
            )
          })}
          <button
            type="submit"
            className="mt-1 px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--site-primary)',
              color: 'var(--site-primary-fg)',
              borderRadius: 'var(--site-radius)',
            }}
          >
            {submitLabel}
          </button>
        </form>
      </div>
    </SectionShell>
  )
}

const fieldStyle: React.CSSProperties = {
  backgroundColor: 'var(--site-card)',
  border: '1px solid var(--site-border)',
  borderRadius: 'var(--site-radius)',
  color: 'var(--site-fg)',
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
