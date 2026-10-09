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
  const panelRef = useRef<HTMLDivElement>(null)
  const firstInput = useRef<HTMLInputElement>(null)
  const original = useRef(form)

  const openEditor = () => {
    const next = emptyForm(profile, defaultFullName, defaultEmail)
    original.current = next
    setForm(next)
    setErrors({})
    setNotice(null)
    setOpen(true)
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('fatura') === '1' || window.location.hash === '#fatura-bilgileri') openEditor()
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
    window.setTimeout(() => firstInput.current?.focus(), 100)
  }, [open])

  const update = (key: keyof BillingProfileFormValues, value: string | boolean) => {
    setForm((current) => ({ ...current, [key]: value } as BillingProfileFormValues))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setNotice(null)
  }

  const closeEditor = () => {
    if (JSON.stringify(form) !== JSON.stringify(original.current) && !window.confirm(lang === 'tr' ? 'Kaydedilmemiş değişiklikler silinsin mi?' : 'Discard unsaved changes?')) return
    setOpen(false)
    setErrors({})
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const validation = validateBillingProfileInput(form, { hasSavedNationalId: Boolean(profile?.hasNationalId), hasSavedTaxNumber: Boolean(profile?.hasTaxNumber) })
    if (!validation.ok) { setErrors(validation.fieldErrors); setNotice(copy.saveFailed); return }
    startTransition(async () => {
      const result = await saveBillingProfileAction(form)
      if (!result.ok) { setErrors((result.fieldErrors ?? {}) as BillingProfileFieldErrors); setNotice(result.error === 'unavailable' ? copy.unavailable : copy.saveFailed); return }
      setProfile(result.profile)
      setOpen(false)
      setNotice(copy.saved)
      onSaved?.(result.profile)
    })
  }

  const field = (key: BillingProfileField, label: string, required = false, maxLength?: number, hint?: string) => {
    const error = errors[key]
    const id = `billing-${key}`
    const specific = copy.validation[key as keyof typeof copy.validation]
    return <label key={key} className="flex flex-col gap-1.5 text-sm"><span className="font-medium">{label}{required ? <span className="text-destructive"> *</span> : null}</span><input ref={key === 'fullName' || key === 'companyTitle' ? firstInput : undefined} id={id} value={String(form[key] ?? '')} onChange={(event) => update(key, event.target.value)} maxLength={maxLength} inputMode={key === 'nationalId' || key === 'taxNumber' ? 'numeric' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined} className={`rounded-lg border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary/30 ${error ? 'border-destructive' : 'border-border'}`} />{hint ? <span id={`${id}-hint`} className="text-xs text-muted-foreground">{hint}</span> : null}{error ? <span id={`${id}-error`} className="text-xs text-destructive">{specific || copy.validation[error]}</span> : null}</label>
  }

  const incomplete = !profile?.complete
  const summary = profile ? `${profile.customerType === 'company' ? profile.companyTitle : profile.fullName} · •••${profile.customerType === 'company' ? profile.taxNumber?.slice(-3) : profile.nationalId?.slice(-3)} · ${profile.city} · ${profile.invoiceEmail}` : copy.notProvided
  if (!storageAvailable) return <section id="fatura-bilgileri" className="scroll-mt-24"><p role="status" className="text-sm text-muted-foreground">{copy.unavailable}</p></section>

  return <section id="fatura-bilgileri" className="scroll-mt-24" aria-label={copy.title}>
    {incomplete ? <div className="rounded-2xl border border-primary/40 bg-primary/10 p-4 sm:p-5"><p className="font-medium">{copy.bannerBody}</p><button type="button" onClick={openEditor} aria-expanded={open} aria-controls="billing-profile-panel" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">{copy.bannerCta}<ChevronDown aria-hidden="true" className={`size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} /></button></div> : <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card/80 p-4 sm:p-5"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-medium">{copy.title}</h2><span className="inline-flex items-center gap-1 rounded-full border border-primary/30 px-2 py-0.5 text-xs text-primary"><Check aria-hidden="true" className="size-3" />{copy.complete}</span></div><p className="mt-2 truncate text-sm text-muted-foreground">{summary}</p></div><Button type="button" variant="outline" onClick={openEditor} aria-expanded={open} aria-controls="billing-profile-panel">{copy.edit}</Button></div>}
    {notice && !open ? <p role="status" className="mt-3 text-sm text-muted-foreground">{notice}</p> : null}
    <div ref={panelRef} id="billing-profile-panel" hidden={!open} role="region" aria-label={copy.title} className="mt-3 rounded-2xl border border-border bg-card/80 p-4 sm:p-5"><form className="flex flex-col gap-5" onSubmit={submit}>{notice && open ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{notice}</p> : null}<fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">{copy.typeLabel}</legend><div className="grid gap-3 sm:grid-cols-2">{(['individual', 'company'] as const).map((type) => <label key={type} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 text-sm"><input type="radio" name="billing-type" checked={form.customerType === type} onChange={() => update('customerType', type)} />{type === 'individual' ? copy.individual : copy.company}</label>)}</div></fieldset><div className="grid gap-4 sm:grid-cols-2">{form.customerType === 'individual' ? field('fullName', copy.fullName, true, 160) : <>{field('companyTitle', copy.companyTitle, true, 200)}{field('taxOffice', copy.taxOffice, true, 120)}{field('fullName', copy.fullNameOptional, false, 160)}</>}{form.customerType === 'individual' ? field('nationalId', copy.nationalId, true, 11, copy.tcknHint) : field('taxNumber', copy.taxNumber, true, 10, copy.vknHint)}{field('addressLine', copy.addressLine, true, 240, copy.validation.addressLine)}{field('district', copy.district, true, 100)}{field('city', copy.city, true, 100)}{field('postalCode', copy.postalCode, false, 20)}{field('phone', copy.phone, true)}{field('invoiceEmail', copy.invoiceEmail, true, 254, copy.validation.invoiceEmail)}</div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.eInvoicePayer} onChange={(event) => update('eInvoicePayer', event.target.checked)} />{copy.eInvoicePayer}</label><div className="flex flex-wrap justify-end gap-3"><Button type="button" variant="ghost" onClick={closeEditor}>{copy.cancel}</Button><Button type="submit" disabled={pending}>{pending ? <><Loader2 aria-hidden="true" className="mr-2 size-4 animate-spin" />{copy.saving}</> : copy.save}</Button></div></form></div>
  </section>
}
