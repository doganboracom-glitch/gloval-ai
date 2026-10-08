'use client'

import { useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { validateBillingProfileInput } from '@/lib/billing-profile-validation'
import { saveBillingProfileAction } from '@/lib/billing-profile-actions'
import type {
  BillingProfileField,
  BillingProfileFieldErrors,
  BillingProfileFormValues,
  BillingProfileSummary,
} from '@/lib/billing-profile-types'

function formFromProfile(
  profile: BillingProfileSummary | null,
  defaults: { fullName: string; email: string },
): BillingProfileFormValues {
  return {
    customerType: profile?.customerType ?? 'individual',
    fullName: profile?.fullName || defaults.fullName,
    companyTitle: profile?.companyTitle ?? '',
    taxOffice: profile?.taxOffice ?? '',
    nationalId: '',
    taxNumber: '',
    addressLine: profile?.addressLine ?? '',
    district: profile?.district ?? '',
    city: profile?.city ?? '',
    postalCode: profile?.postalCode ?? '',
    country: profile?.country ?? 'TR',
    phone: profile?.phone ?? '',
    invoiceEmail: profile?.invoiceEmail || defaults.email,
    eInvoicePayer: profile?.eInvoicePayer ?? false,
  }
}

export function BillingProfileCard({
  initialProfile,
  storageAvailable,
  defaultFullName,
  defaultEmail,
  onSaved,
}: {
  initialProfile: BillingProfileSummary | null
  storageAvailable: boolean
  defaultFullName: string
  defaultEmail: string
  onSaved?: (profile: BillingProfileSummary) => void
}) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)
  const [profile, setProfile] = useState(initialProfile)
  const [editing, setEditing] = useState(storageAvailable && (!initialProfile || !initialProfile.complete))
  const [form, setForm] = useState(() =>
    formFromProfile(initialProfile, { fullName: defaultFullName, email: defaultEmail }),
  )
  const [fieldErrors, setFieldErrors] = useState<BillingProfileFieldErrors>({})
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function updateField<K extends keyof BillingProfileFormValues>(field: K, value: BillingProfileFormValues[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => ({ ...current, [field]: undefined }))
    setFeedback(null)
  }

  function cancelEditing() {
    setForm(formFromProfile(profile, { fullName: defaultFullName, email: defaultEmail }))
    setFieldErrors({})
    setFeedback(null)
    setEditing(false)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending || !storageAvailable) return

    const sameType = profile?.customerType === form.customerType
    const validation = validateBillingProfileInput(form, {
      hasSavedNationalId: Boolean(sameType && profile?.hasNationalId),
      hasSavedTaxNumber: Boolean(sameType && profile?.hasTaxNumber),
    })
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors)
      setFeedback({ type: 'error', message: copy.saveFailed })
      return
    }

    setFieldErrors({})
    setFeedback(null)
    startTransition(async () => {
      const result = await saveBillingProfileAction(form)
      if (!result.ok) {
        if (result.error === 'validation' && result.fieldErrors) {
          setFieldErrors(result.fieldErrors as BillingProfileFieldErrors)
        }
        setFeedback({
          type: 'error',
          message: result.error === 'unavailable' ? copy.unavailable : copy.saveFailed,
        })
        return
      }

      setProfile(result.profile)
      onSaved?.(result.profile)
      setForm(formFromProfile(result.profile, { fullName: defaultFullName, email: defaultEmail }))
      setEditing(false)
      setFeedback({ type: 'success', message: copy.saved })
    })
  }

  function fieldError(field: BillingProfileField) {
    const error = fieldErrors[field]
    return error ? copy.validation[error] : null
  }

  function textField({
    field,
    label,
    required = false,
    autoComplete,
    inputMode,
    maxLength,
    type = 'text',
    placeholder,
    hint,
  }: {
    field: Exclude<BillingProfileField, 'customerType' | 'eInvoicePayer'>
    label: string
    required?: boolean
    autoComplete?: string
    inputMode?: 'text' | 'numeric' | 'email' | 'tel'
    maxLength?: number
    type?: 'text' | 'email' | 'tel' | 'password'
    placeholder?: string
    hint?: string
  }) {
    const error = fieldError(field)
    return (
      <label className="flex min-w-0 flex-col gap-1.5 text-sm">
        <span className="font-medium text-foreground">
          {label}
          {required ? <span className="text-destructive"> *</span> : null}
        </span>
        <input
          type={type}
          value={form[field] as string}
          onChange={(event) => updateField(field, event.target.value)}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          placeholder={placeholder}
          required={required}
          aria-invalid={Boolean(error)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {hint ? <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span> : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </label>
    )
  }

  const savedIdentifier =
    profile?.customerType === form.customerType
      ? form.customerType === 'individual'
        ? profile.hasNationalId
          ? `${'•'.repeat(8)}${profile.nationalIdLast3 ?? ''}`
          : null
        : profile.hasTaxNumber
          ? `${'•'.repeat(7)}${profile.taxNumberLast3 ?? ''}`
          : null
      : null

  return (
    <section
      id="fatura-bilgileri"
      aria-labelledby="billing-profile-title"
      className="scroll-mt-24 rounded-2xl border border-primary/30 bg-card/80 p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="billing-profile-title" className="font-display text-xl font-semibold text-balance">
            {copy.title}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {copy.subtitle}
          </p>
        </div>
        {profile ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
              profile.complete
                ? 'border-accent/25 bg-accent/10 text-accent'
                : 'border-primary/30 bg-primary/10 text-primary'
            }`}
          >
            {profile.complete ? <Check aria-hidden="true" className="size-3.5" /> : null}
            {profile.complete ? copy.complete : copy.incomplete}
          </span>
        ) : null}
      </div>

      {!storageAvailable ? (
        <p role="status" className="mt-5 rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
          {copy.unavailable}
        </p>
      ) : editing ? (
        <form
          className="mt-6 flex flex-col gap-5"
          onSubmit={handleSubmit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) {
              event.preventDefault()
            }
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-foreground">{copy.typeLabel}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['individual', 'company'] as const).map((type) => (
                <label
                  key={type}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm transition-colors hover:border-primary/40"
                >
                  <input
                    type="radio"
                    name="billing-customer-type"
                    value={type}
                    checked={form.customerType === type}
                    onChange={() => {
                      updateField('customerType', type)
                      updateField('nationalId', '')
                      updateField('taxNumber', '')
                    }}
                    className="size-4 accent-primary"
                  />
                  <span className="font-medium text-foreground">
                    {type === 'individual' ? copy.individual : copy.company}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            {form.customerType === 'individual'
              ? textField({ field: 'fullName', label: copy.fullName, required: true, autoComplete: 'name', maxLength: 160 })
              : textField({ field: 'companyTitle', label: copy.companyTitle, required: true, autoComplete: 'organization', maxLength: 200 })}
            {form.customerType === 'individual'
              ? textField({
                  field: 'nationalId',
                  label: copy.nationalId,
                  required: !profile || profile.customerType !== form.customerType || !profile.hasNationalId,
                  inputMode: 'numeric',
                  type: 'password',
                  maxLength: 11,
                  placeholder: savedIdentifier ?? undefined,
                  hint: savedIdentifier ? `${copy.identifierSaved}: ${savedIdentifier}. ${copy.identifierUnchanged}` : copy.tcknHint,
                })
              : textField({ field: 'taxOffice', label: copy.taxOffice, required: true, maxLength: 120 })}
            {form.customerType === 'company'
              ? textField({
                  field: 'taxNumber',
                  label: copy.taxNumber,
                  required: !profile || profile.customerType !== form.customerType || !profile.hasTaxNumber,
                  inputMode: 'numeric',
                  type: 'password',
                  maxLength: 10,
                  placeholder: savedIdentifier ?? undefined,
                  hint: savedIdentifier ? `${copy.identifierSaved}: ${savedIdentifier}. ${copy.identifierUnchanged}` : copy.vknHint,
                })
              : textField({ field: 'phone', label: copy.phone, required: true, autoComplete: 'tel', inputMode: 'tel', maxLength: 24 })}
            {form.customerType === 'company'
              ? textField({ field: 'fullName', label: copy.fullNameOptional, autoComplete: 'name', maxLength: 160 })
              : textField({ field: 'phone', label: copy.phone, required: true, autoComplete: 'tel', inputMode: 'tel', maxLength: 24 })}
            {textField({ field: 'invoiceEmail', label: copy.invoiceEmail, required: true, autoComplete: 'email', inputMode: 'email', type: 'email', maxLength: 254 })}
            {textField({ field: 'addressLine', label: copy.addressLine, required: true, autoComplete: 'street-address', maxLength: 240 })}
            {textField({ field: 'district', label: copy.district, required: true, maxLength: 100 })}
            {textField({ field: 'city', label: copy.city, required: true, autoComplete: 'address-level2', maxLength: 100 })}
            {textField({ field: 'postalCode', label: copy.postalCode, autoComplete: 'postal-code', maxLength: 20 })}
            {textField({ field: 'country', label: copy.country, required: true, maxLength: 2, hint: copy.countryHint })}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.eInvoicePayer}
              onChange={(event) => updateField('eInvoicePayer', event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span>{copy.eInvoicePayer}</span>
          </label>

          {feedback ? (
            <p role={feedback.type === 'error' ? 'alert' : 'status'} className={feedback.type === 'error' ? 'text-sm text-destructive' : 'text-sm text-accent'}>
              {feedback.message}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {profile ? (
              <Button type="button" variant="outline" disabled={isPending} onClick={cancelEditing}>
                {copy.cancel}
              </Button>
            ) : null}
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {isPending ? copy.saving : copy.save}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {profile ? (
            <dl className="grid gap-x-6 gap-y-4 rounded-xl border border-border bg-background/60 p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{copy.typeLabel}</dt>
                <dd className="mt-1 text-sm font-medium">{profile.customerType === 'individual' ? copy.individual : copy.company}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{profile.customerType === 'individual' ? copy.fullName : copy.companyTitle}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{profile.customerType === 'individual' ? profile.fullName : profile.companyTitle}</dd>
              </div>
              {profile.customerType === 'company' ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{copy.taxOffice}</dt>
                  <dd className="mt-1 text-sm font-medium">{profile.taxOffice}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{profile.customerType === 'individual' ? copy.nationalId : copy.taxNumber}</dt>
                <dd className="mt-1 font-mono text-sm font-medium">
                  {savedIdentifier ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{copy.invoiceEmail}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{profile.invoiceEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{copy.phone}</dt>
                <dd className="mt-1 text-sm font-medium">{profile.phone}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-muted-foreground">{copy.addressLine}</dt>
                <dd className="mt-1 break-words text-sm font-medium">
                  {[profile.addressLine, profile.district, profile.city, profile.postalCode, profile.country].filter(Boolean).join(', ')}
                </dd>
              </div>
              {profile.customerType === 'company' && profile.fullName ? (
                <div>
                  <dt className="text-xs text-muted-foreground">{copy.fullNameOptional}</dt>
                  <dd className="mt-1 text-sm font-medium">{profile.fullName}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">{copy.eInvoicePayer}</dt>
                <dd className="mt-1 text-sm font-medium">{profile.eInvoicePayer ? copy.yes : copy.no}</dd>
              </div>
            </dl>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-background/60 px-4 py-5 text-sm text-muted-foreground">
              {copy.notProvided}
            </p>
          )}
          {feedback ? <p role="status" className="text-sm text-accent">{feedback.message}</p> : null}
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setEditing(true)}>
              {copy.edit}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function sameTypeForId(profile: BillingProfileSummary, customerType: BillingProfileSummary['customerType']) {
  return profile.customerType === customerType
}
