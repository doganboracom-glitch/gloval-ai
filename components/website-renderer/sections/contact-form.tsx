'use client'

import { useState, type CSSProperties, type FormEvent } from 'react'
import { useSiteNav } from '@/components/website-renderer/site-nav-context'
import {
  CONTACT_HONEYPOT_FIELD,
  CONTACT_LIMITS,
  contactFormCopy,
  postContactForm,
  resolveContactFormLayout,
  type ContactFieldErrors,
  type ContactSubmitError,
} from '@/lib/site-contact-form'

/** Present only on a published site; the editor preview and demos render the form inert. */
export type ContactFormLive = { slug: string; token: string }

type Status = 'idle' | 'sending' | 'sent' | 'error'

const PRIVACY_HREF = '/yasal/gizlilik-politikasi'

const fieldStyle: CSSProperties = {
  backgroundColor: 'var(--site-card)',
  border: '1px solid var(--site-border)',
  borderRadius: 'var(--site-radius)',
  color: 'var(--site-fg)',
}

const labelStyle: CSSProperties = { color: 'var(--site-muted-fg)' }
const errorStyle: CSSProperties = { color: 'var(--site-primary)' }

export function ContactForm({
  labels,
  lang,
  live,
}: {
  labels: readonly string[] | undefined
  lang: string
  live: ContactFormLive | null
}) {
  const copy = contactFormCopy(lang)
  const layout = resolveContactFormLayout(labels, lang)
  const nav = useSiteNav()

  const [status, setStatus] = useState<Status>('idle')
  const [errors, setErrors] = useState<ContactFieldErrors>({})
  const [submitError, setSubmitError] = useState<ContactSubmitError>('server')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!live || status === 'sending') return
    // React clears `event.currentTarget` once the handler yields, so keep the element.
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const text = (key: string) => String(form.get(key) ?? '')

    setStatus('sending')
    setErrors({})
    const result = await postContactForm({
      slug: live.slug,
      token: live.token,
      name: text('name'),
      email: text('email'),
      phone: text('phone'),
      message: text('message'),
      consent: form.get('consent') === 'on',
      [CONTACT_HONEYPOT_FIELD]: text(CONTACT_HONEYPOT_FIELD),
    })

    if (result.kind === 'sent') {
      formElement.reset()
      setStatus('sent')
    } else if (result.kind === 'validation') {
      setErrors(result.fields)
      setStatus('idle')
    } else {
      setSubmitError(result.error)
      setStatus('error')
    }
  }

  function onPrivacyClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (nav?.(PRIVACY_HREF)) event.preventDefault()
  }

  const errorId = (field: string) => `contact-${field}-error`
  const inputProps = (field: keyof ContactFieldErrors) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? errorId(field) : undefined,
    disabled: status === 'sending',
  })
  const fieldError = (field: keyof ContactFieldErrors) =>
    errors[field] ? (
      <span id={errorId(field)} role="alert" className="text-xs font-normal" style={errorStyle}>
        {field === 'consent' ? copy.consentRequired : copy.errors[errors[field]!]}
      </span>
    ) : null

  return (
    <form
      className="grid gap-3"
      onSubmit={onSubmit}
      noValidate
      style={{
        backgroundColor: 'var(--site-bg)',
        border: '1px solid var(--site-border)',
        borderRadius: 'var(--site-radius)',
        padding: '1.25rem',
      }}
    >
      <label className="grid gap-1.5 text-xs font-medium" style={labelStyle}>
        {layout.name}
        <input
          name="name"
          type="text"
          autoComplete="name"
          maxLength={CONTACT_LIMITS.nameMax}
          className="px-3 py-2 text-sm outline-none"
          style={fieldStyle}
          {...inputProps('name')}
        />
        {fieldError('name')}
      </label>

      <label className="grid gap-1.5 text-xs font-medium" style={labelStyle}>
        {layout.email}
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={CONTACT_LIMITS.emailMax}
          className="px-3 py-2 text-sm outline-none"
          style={fieldStyle}
          {...inputProps('email')}
        />
        {fieldError('email')}
      </label>

      {layout.phone && (
        <label className="grid gap-1.5 text-xs font-medium" style={labelStyle}>
          {layout.phone}
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={CONTACT_LIMITS.phoneMax}
            className="px-3 py-2 text-sm outline-none"
            style={fieldStyle}
            {...inputProps('phone')}
          />
          {fieldError('phone')}
        </label>
      )}

      <label className="grid gap-1.5 text-xs font-medium" style={labelStyle}>
        {layout.message}
        <textarea
          name="message"
          rows={4}
          maxLength={CONTACT_LIMITS.messageMax}
          className="resize-none px-3 py-2 text-sm outline-none"
          style={fieldStyle}
          {...inputProps('message')}
        />
        {fieldError('message')}
      </label>

      {/* Decoy for bots: invisible and unreachable by keyboard, so a human never fills it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          {copy.honeypotLabel}
          <input name={CONTACT_HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <div className="grid gap-1">
        <label className="flex items-start gap-2 text-xs leading-relaxed" style={labelStyle}>
          <input
            name="consent"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0"
            style={{ accentColor: 'var(--site-primary)' }}
            {...inputProps('consent')}
          />
          <span>
            {copy.consentLead}
            <a
              href={PRIVACY_HREF}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onPrivacyClick}
              className="underline underline-offset-2"
              style={{ color: 'var(--site-primary)' }}
            >
              {copy.consentLink}
            </a>
            {copy.consentTail}
          </span>
        </label>
        {fieldError('consent')}
      </div>

      <button
        type="submit"
        disabled={!live || status === 'sending'}
        className="mt-1 px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          backgroundColor: 'var(--site-primary)',
          color: 'var(--site-primary-fg)',
          borderRadius: 'var(--site-radius)',
        }}
      >
        {status === 'sending' ? copy.sending : copy.send}
      </button>

      {!live && (
        <p className="text-xs" style={labelStyle}>
          {copy.previewNote}
        </p>
      )}
      <p role="status" aria-live="polite" className="text-sm" style={{ color: 'var(--site-fg)' }}>
        {status === 'sent' ? copy.success : status === 'error' ? copy.submitErrors[submitError] : ''}
      </p>
    </form>
  )
}
