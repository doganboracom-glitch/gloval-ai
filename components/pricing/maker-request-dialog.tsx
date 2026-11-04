'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { CheckCircle2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { getMakerRequestCopy } from '@/lib/maker-requests/copy'
import type { MakerRequestBudgetRange } from '@/lib/maker-requests/types'
import type { Lang } from '@/lib/i18n'

type LinkField = { id: number; value: string }
type FormState = {
  fullName: string
  phone: string
  email: string
  budgetRange: MakerRequestBudgetRange | ''
  consent: boolean
  companyWebsite: string
}

const EMPTY_FORM: FormState = {
  fullName: '',
  phone: '',
  email: '',
  budgetRange: '',
  consent: false,
  companyWebsite: '',
}

export function MakerRequestDialog({ lang }: { lang: Lang }) {
  const copy = getMakerRequestCopy(lang).form
  const uiLang = lang === 'tr' ? 'tr' : 'en'
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [links, setLinks] = useState<LinkField[]>([{ id: 0, value: '' }])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const nextLinkId = useRef(1)

  function loadAccountPrefill() {
    void fetch('/api/maker-requests', { cache: 'no-store' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload: { prefill?: { fullName?: string; email?: string } } | null) => {
        if (!payload?.prefill) return
        setForm((current) => ({
          ...current,
          fullName: current.fullName || payload.prefill?.fullName || '',
          email: current.email || payload.prefill?.email || '',
        }))
      })
      .catch(() => undefined)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setForm(EMPTY_FORM)
      setLinks([{ id: 0, value: '' }])
      nextLinkId.current = 1
      setError(null)
      setSubmitted(false)
      loadAccountPrefill()
    } else {
      setError(null)
    }
    setOpen(nextOpen)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch('/api/maker-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          referenceLinks: links.map((link) => link.value),
          lang: uiLang,
        }),
      })
      const payload = await response.json().catch(() => null) as { error?: string } | null

      if (response.ok) {
        setSubmitted(true)
      } else if (response.status === 429 || payload?.error === 'rate_limited') {
        setError(copy.rateLimited)
      } else if (payload?.error === 'too_many_links') {
        setError(copy.tooManyLinks)
      } else if (response.status === 400) {
        setError(copy.invalid)
      } else {
        setError(copy.unavailable)
      }
    } catch {
      setError(copy.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger
        type="button"
        className="inline-flex h-12 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand px-6 text-base font-semibold text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-auto"
      >
        {copy.trigger}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-xl outline-none sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-balance font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {submitted ? copy.successTitle : copy.title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-pretty text-sm leading-relaxed text-muted-foreground">
                {submitted ? copy.successMessage : copy.description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              type="button"
              aria-label={copy.close}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden="true" />
            </Dialog.Close>
          </div>

          {submitted ? (
            <div className="flex flex-col items-start gap-4 rounded-xl border border-brand/30 bg-brand/5 p-4" role="status">
              <div className="flex items-center gap-2 text-sm font-medium text-brand">
                <CheckCircle2 aria-hidden="true" />
                <span>{copy.successSaved}</span>
              </div>
              <Dialog.Close
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copy.close}
              </Dialog.Close>
            </div>
          ) : (
            <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
              <FieldGroup className="gap-4">
                <Field>
                  <FieldLabel htmlFor="maker-request-name">{copy.fullName}</FieldLabel>
                  <Input
                    id="maker-request-name"
                    name="fullName"
                    autoComplete="name"
                    maxLength={120}
                    required
                    value={form.fullName}
                    onChange={(event) => {
                      const fullName = event.currentTarget.value
                      setForm((current) => ({ ...current, fullName }))
                    }}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="maker-request-phone">{copy.phone}</FieldLabel>
                    <Input
                      id="maker-request-phone"
                      name="phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      maxLength={32}
                      required
                      value={form.phone}
                      onChange={(event) => {
                        const phone = event.currentTarget.value
                        setForm((current) => ({ ...current, phone }))
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="maker-request-email">{copy.email}</FieldLabel>
                    <Input
                      id="maker-request-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                      value={form.email}
                      onChange={(event) => {
                        const email = event.currentTarget.value
                        setForm((current) => ({ ...current, email }))
                      }}
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="maker-request-budget">{copy.budget}</FieldLabel>
                  <select
                    id="maker-request-budget"
                    name="budgetRange"
                    required
                    value={form.budgetRange}
                    onChange={(event) => {
                      const budgetRange = event.currentTarget.value as MakerRequestBudgetRange | ''
                      setForm((current) => ({ ...current, budgetRange }))
                    }}
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                  >
                    <option value="">{copy.budgetPlaceholder}</option>
                    <option value="5000-10000">{copy.budgets['5000-10000']}</option>
                    <option value="10000-25000">{copy.budgets['10000-25000']}</option>
                    <option value="25000-plus">{copy.budgets['25000-plus']}</option>
                  </select>
                </Field>
                <Field>
                  <div className="flex items-center justify-between gap-3">
                    <FieldLabel htmlFor="maker-request-reference-0">{copy.references}</FieldLabel>
                    <button
                      type="button"
                      disabled={links.length >= 5}
                      onClick={() => setLinks((current) => [...current, { id: nextLinkId.current++, value: '' }])}
                      className="shrink-0 text-sm font-medium text-brand underline decoration-brand/40 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {copy.addReference}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {links.map((link, index) => (
                      <div className="flex items-center gap-2" key={link.id}>
                        <Input
                          id={index === 0 ? 'maker-request-reference-0' : `maker-request-reference-${link.id}`}
                          type="text"
                          aria-label={`${copy.references} ${index + 1}`}
                          inputMode="url"
                          autoComplete="url"
                          maxLength={300}
                          placeholder={copy.referencePlaceholder}
                          value={link.value}
                          onChange={(event) => {
                            const value = event.currentTarget.value
                            setLinks((current) => current.map((item) => (
                              item.id === link.id ? { ...item, value } : item
                            )))
                          }}
                        />
                        {links.length > 1 ? (
                          <button
                            type="button"
                            aria-label={copy.removeReference}
                            onClick={() => setLinks((current) => current.filter((item) => item.id !== link.id))}
                            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <X aria-hidden="true" />
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </Field>
              </FieldGroup>

              <div className="flex items-start gap-3">
                <input
                  id="maker-request-consent"
                  name="consent"
                  type="checkbox"
                  required
                  checked={form.consent}
                  onChange={(event) => {
                    const consent = event.currentTarget.checked
                    setForm((current) => ({ ...current, consent }))
                  }}
                  className="mt-1 size-4 shrink-0 accent-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <label htmlFor="maker-request-consent" className="text-sm leading-relaxed text-muted-foreground">
                  {copy.consentPrefix}{' '}
                  <a href="/yasal/kvkk" target="_blank" rel="noreferrer" className="font-medium text-brand underline decoration-brand/40 underline-offset-4">
                    {copy.consentLink}
                  </a>{' '}
                  {copy.consentSuffix}
                </label>
              </div>

              <div aria-hidden="true" className="absolute -left-[10000px] top-auto size-px overflow-hidden">
                <label htmlFor="maker-request-company-website">{copy.companyWebsite}</label>
                <input
                  id="maker-request-company-website"
                  name="companyWebsite"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.companyWebsite}
                  onChange={(event) => {
                    const companyWebsite = event.currentTarget.value
                    setForm((current) => ({ ...current, companyWebsite }))
                  }}
                />
              </div>

              {error ? <p id="maker-request-error" role="alert" className="text-sm text-destructive">{error}</p> : null}

              <div className="flex justify-end">
                <Button type="submit" variant="brand" disabled={submitting} aria-describedby={error ? 'maker-request-error' : undefined}>
                  {submitting ? copy.submitting : copy.submit}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
