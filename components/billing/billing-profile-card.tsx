'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { getBillingProfileCopy } from '@/lib/billing-profile-copy'
import { saveBillingProfileAction } from '@/lib/billing-profile-actions'
import { validateBillingProfileInput } from '@/lib/billing-profile-validation'
import type { BillingProfileField, BillingProfileFieldErrors, BillingProfileFormValues, BillingProfileSummary } from '@/lib/billing-profile-types'

function emptyForm(profile: BillingProfileSummary | null, name: string, email: string): BillingProfileFormValues {
  return { customerType: profile?.customerType ?? 'individual', fullName: profile?.fullName || name, companyTitle: profile?.companyTitle ?? '', taxOffice: profile?.taxOffice ?? '', nationalId: '', taxNumber: '', addressLine: profile?.addressLine ?? '', district: profile?.district ?? '', city: profile?.city ?? '', postalCode: profile?.postalCode ?? '', country: 'TR', phone: profile?.phone ?? '', invoiceEmail: profile?.invoiceEmail || email, eInvoicePayer: profile?.eInvoicePayer ?? false }
}

export function BillingProfileCard({ initialProfile, storageAvailable, defaultFullName, defaultEmail, onSaved }: { initialProfile: BillingProfileSummary | null; storageAvailable: boolean; defaultFullName: string; defaultEmail: string; onSaved?: (profile: BillingProfileSummary) => void }) {
  const { lang } = useLanguage()
  const copy = getBillingProfileCopy(lang)
  const [profile, setProfile] = useState(initialProfile)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(() => emptyForm(initialProfile, defaultFullName, defaultEmail))
  const [errors, setErrors] = useState<BillingProfileFieldErrors>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const firstInput = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const originalRef = useRef(form)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('fatura') === '1' || window.location.hash === '#fatura-bilgileri') openEditor()
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    window.setTimeout(() => firstInput.current?.focus(), 120)
  }, [open])

  const update = (key: keyof BillingProfileFormValues, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value } as BillingProfileFormValues))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice(null)
  }

  const closeEditor = () => {
    if (JSON.stringify(form) !== JSON.stringify(originalRef.current) && !window.confirm(lang === 'tr' ? 'Kaydedilmemiş değişiklikler silinsin mi?' : 'Discard unsaved changes?')) return
    setOpen(false)
    setErrors({})
  }

  const openEditor = () => {
    const next = emptyForm(profile, defaultFullName, defaultEmail)
    originalRef.current = next
    setForm(next)
    setErrors({})
    setNotice(null)
    setOpen(true)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const validation = validateBillingProfileInput(form, { hasSavedNationalId: Boolean(profile?.hasNationalId), hasSavedTaxNumber: Boolean(profile?.hasTaxNumber) })
    if (!validation.ok) { setErrors(validation.fieldErrors); return }
    startTransition(async () => {
      const result = await saveBillingProfileAction(form)
      if (!result.ok) { setErrors((result.fieldErrors ?? {}) as BillingProfileFieldErrors); setNotice(result.error === 'unavailable' ? copy.unavailable : copy.saveFailed); return }
      setProfile(result.profile)
      setForm(emptyForm(result.profile, defaultFullName, defaultEmail))
      setOpen(false)
      setNotice(copy.saved)
      onSaved?.(result.profile)
    })
  }

  const errorMessage = (key: BillingProfileField, error: keyof typeof copy.validation | undefined) => {
    if (!error) return null
    const specific = copy.validation[key as keyof typeof copy.validation]
    return <span id={`billing-${key}-error`} className="text-xs text-destructive">{specific || copy.validation[error]}</span>
  }

  const field = (key: BillingProfileField, label: string, required = false, type = 'text', maxLength?: number, hint?: string) => {
    const error = errors[key]
    const id = `billing-${key}`
    return <label key={key} className="flex flex-col gap-1.5 text-sm"><span className="font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span><input ref={key === 'fullName' || key === 'companyTitle' ? firstInput : undefined} id={id} value={String(form[key] ?? '')} onChange={(event) => update(key, event.target.value)} type={type} maxLength={maxLength} inputMode={key === 'nationalId' || key === 'taxNumber' ? 'numeric' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`rounded-lg border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 ${error ? 'border-destructive' : 'border-border'}`} />{hint ? <span id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</span> : null}{errorMessage(key, error)}</label>
  }

  const incomplete = !profile?.complete
  const overview = !storageAvailable ? <p role="status" className="mt-4 text-sm text-muted-foreground">{copy.unavailable}</p> : incomplete ? <Button className="mt-4" type="button" onClick={openEditor}>{copy.bannerCta}</Button> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{profile?.invoiceEmail}</p><Button type="button" variant="outline" onClick={openEditor}>{copy.edit}</Button></div>

  return <section id="fatura-bilgileri" className="scroll-mt-24 rounded-2xl border border-primary/30 bg-card/80 p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-xl font-semibold">{copy.title}</h2><p className="mt-1 text-sm text-muted-foreground">{incomplete ? copy.subtitle : copy.complete}</p></div><span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">{incomplete ? copy.incomplete : <><Check aria-hidden="true" className="size-3.5" />{copy.complete}</>}</span></div>{overview}{notice ? <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}<div ref={panelRef} id="billing-profile-panel" hidden={!open} role="region" aria-labelledby="billing-profile-toggle" className="mt-5 border-t border-border pt-5"><form className="flex flex-col gap-5" onSubmit={submit}><fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">{copy.typeLabel}</legend><div className="grid gap-3 sm:grid-cols-2">{(['individual', 'company'] as const).map((type) => <label key={type} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"><input type="radio" name="billing-type" checked={form.customerType === type} onChange={() => update('customerType', type)} />{type === 'individual' ? copy.individual : copy.company}</label>)}</div></fieldset><div className="grid gap-4 sm:grid-cols-2">{form.customerType === 'individual' ? field('fullName', copy.fullName, true, 'text', 160, form.fullName && /ltd|a\.ş\.?|inc|llc/i.test(form.fullName) ? copy.companyHint : undefined) : <>{field('companyTitle', copy.companyTitle, true, 'text', 200)}{field('taxOffice', copy.taxOffice, true, 'text', 120)}{field('fullName', copy.fullNameOptional, false, 'text', 160)}</>} {form.customerType === 'individual' ? field('nationalId', copy.nationalId, true, 'text', 11, copy.tcknHint) : field('taxNumber', copy.taxNumber, true, 'text', 10, copy.vknHint)}{field('invoiceEmail', copy.invoiceEmail, true, 'email', 254)}{field('phone', copy.phone, true, 'tel')}</div><div className="flex flex-col gap-4">{field('addressLine', copy.addressLine, true, 'text', 240, lang === 'tr' ? 'Mahalle, sokak/cadde ve bina numarasını yazın.' : 'Include neighborhood, street, and building number.')}{<div className="grid gap-4 sm:grid-cols-2">{field('city', copy.city, true, 'text', 100)}{field('district', copy.district, true, 'text', 100)}</div>}{field('postalCode', copy.postalCode, false, 'text', 20)}<label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">{copy.country}</span><input value={lang === 'tr' ? 'Türkiye' : 'Türkiye (TR)'} readOnly aria-readonly="true" className="rounded-lg border border-border bg-muted px-3 py-2.5 text-muted-foreground" /></label></div>{form.customerType === 'company' ? <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.eInvoicePayer} onChange={(event) => update('eInvoicePayer', event.target.checked)} className="mt-1" /><span>{copy.eInvoicePayer}<span className="mt-1 block text-xs text-muted-foreground">{copy.eInvoiceHint}</span></span></label> : null}<div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={closeEditor}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{pending ? <><Loader2 className="mr-2 size-4 animate-spin" />{copy.saving}</> : copy.save}</Button></div></form></div><button id="billing-profile-toggle" type="button" aria-expanded={open} aria-controls="billing-profile-panel" onClick={open ? closeEditor : openEditor} className="mt-4 inline-flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/60"><span>{open ? copy.cancel : incomplete ? copy.bannerCta : copy.edit}</span><ChevronDown aria-hidden="true" className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} /></button></section>
}
