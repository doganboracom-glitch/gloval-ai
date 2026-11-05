'use client'

import type { FormEvent } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/components/language-provider'
import type { ManualPlanInput } from '@/lib/ads/manual-plan'

export function AdsManualPlanForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: (input: ManualPlanInput) => void
}) {
  const { lang, t } = useLanguage()
  const copy = t.ads.manualFallback
  const defaultLanguage = lang === 'tr' ? 'tr' : 'en'

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled) return

    const data = new FormData(event.currentTarget)
    const businessName = String(data.get('businessName') ?? '').trim()
    const industry = String(data.get('industry') ?? '').trim()
    const services = String(data.get('services') ?? '').trim()
    const location = String(data.get('location') ?? '').trim()
    const language = String(data.get('language') ?? defaultLanguage)

    if (!businessName || !industry || !services) {
      const firstInvalid = event.currentTarget.querySelector<HTMLElement>(':invalid')
      firstInvalid?.focus()
      return
    }
    if (language !== 'tr' && language !== 'en') return

    onSubmit({ businessName, industry, services, location, language })
  }

  return (
    <section
      aria-labelledby="ads-manual-plan-title"
      className="flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-start sm:p-6"
    >
      <header className="flex flex-col gap-1">
        <h3 id="ads-manual-plan-title" className="text-lg font-semibold text-foreground">
          {copy.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{copy.description}</p>
      </header>

      <form onSubmit={submit} aria-busy={disabled} className="flex flex-col gap-4">
        <FieldSet disabled={disabled} className="min-w-0">
          <FieldLegend className="sr-only">{copy.title}</FieldLegend>
          <FieldGroup className="sm:grid sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ads-manual-business">{copy.businessLabel}</FieldLabel>
              <Input
                id="ads-manual-business"
                name="businessName"
                autoComplete="organization"
                maxLength={80}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ads-manual-industry">{copy.industryLabel}</FieldLabel>
              <Input id="ads-manual-industry" name="industry" maxLength={80} required />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="ads-manual-services">{copy.servicesLabel}</FieldLabel>
              <Textarea
                id="ads-manual-services"
                name="services"
                rows={3}
                maxLength={500}
                required
                className="min-h-28 resize-y"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ads-manual-location">{copy.locationLabel}</FieldLabel>
              <Input id="ads-manual-location" name="location" maxLength={120} />
            </Field>
            <Field>
              <FieldLabel htmlFor="ads-manual-language">{copy.languageLabel}</FieldLabel>
              <select
                id="ads-manual-language"
                name="language"
                defaultValue={defaultLanguage}
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="tr">{t.ads.languageTr}</option>
                <option value="en">{t.ads.languageEn}</option>
              </select>
            </Field>
          </FieldGroup>
        </FieldSet>

        <p role="note" className="text-sm leading-relaxed text-muted-foreground">
          {copy.note}
        </p>

        <button
          type="submit"
          disabled={disabled}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-base font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {disabled ? (
            <Loader2 data-icon="inline-start" className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <ArrowRight data-icon="inline-start" className="size-4" aria-hidden="true" />
          )}
          {copy.submitLabel}
        </button>
      </form>
    </section>
  )
}
