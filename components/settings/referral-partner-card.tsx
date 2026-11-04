'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { activateReferralPartner, closeReferralPartner, saveReferralPartnerIban } from '@/lib/referrals/partner-actions'
import { REFERRAL_TERMS, REFERRAL_TERMS_VERSION } from '@/lib/referrals/terms'
import { REFERRAL_PAYOUT_MIN_TRY } from '@/lib/referrals/commission-config'
import type { ReferralPartnerSettings, ReferralPayoutPanelData } from '@/lib/referrals/partner-types'
import { ReferralPayoutControls } from '@/components/settings/referral-payout-controls'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const minimumPayoutTr = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)
const minimumPayoutEn = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(REFERRAL_PAYOUT_MIN_TRY)

const COPY = {
  tr: {
    title: 'Satış Ortaklığı',
    descriptionBeforeLink: 'GLOVAL AI bağlantınızı paylaşın ve yönlendirmelerinizi ',
    descriptionLink: 'panelden',
    descriptionAfterLink: ' güvenli biçimde takip edin.',
    active: 'Aktif',
    suspended: 'İncelemede',
    closed: 'Kapalı',
    codeLabel: 'Yönlendirme bağlantınız',
    copy: 'Bağlantıyı kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Bağlantı kopyalanamadı.',
    ibanLast4: 'Kayıtlı IBAN son 4 hane',
    payoutHint: `Bakiyeniz ${minimumPayoutTr} TL olduğunda "Ödeme İste" yapabilirsiniz.`, 
    close: 'Ortaklığı kapat',
    joinTitle: 'Programa katılın',
    termsIntro: 'Katılım şartlarını aşağıdaki kutudan okuyun. Kabul kutusu şartların hemen ardından yer alır.',
    termsBox: 'Satış ortaklığı programı şartları',
    acceptTerms: 'Satış Ortaklığı Programı Şartları’nı okudum ve kabul ediyorum.',
    fullTerms: 'Şartların tamamını aç',
    payeeName: 'Ödeme alacak kişinin / kuruluşun adı',
    payeeNameHint: 'Vergi veya ödeme kaydınızda yer alan adı girin.',
    taxStatus: 'Vergi statüsü',
    individual: 'Bireysel',
    company: 'Şirket',
    companyTaxHint: 'Program eşlemesinde şirket ve şahıs şirketi statüsü nakit ödeme için fatura gerektirir.',
    individualTaxHint: 'Bireysel statü bu program iş akışında fatura gerektirmez.',
    iban: 'IBAN',
    ibanHint: 'Türkiye IBAN’ı girin. IBAN sunucu tarafında AES-256-GCM ile şifrelenir; burada yalnızca son 4 hane gösterilir.',
    join: 'Programa katıl',
    submitting: 'Kaydediliyor…',
    closeTitle: 'Ortaklığı kapatmak istiyor musunuz?',
    closeDescription: 'Yönlendirme bağlantınız devre dışı bırakılır ve şifreli IBAN bilgisi silinir. Bu işlem geri alınamaz.',
    closeConfirm: 'Ortaklığı kapat',
    cancel: 'Vazgeç',
    closing: 'Kapatılıyor…',
    success: 'Satış ortaklığı etkinleştirildi.',
    closeSuccess: 'Satış ortaklığı kapatıldı.',
    suspendedStatusDescription: 'Bu ortaklık için yeni yönlendirme alınmıyor. Durum değişikliği için destek ekibiyle iletişime geçebilirsiniz.',
    taxVerificationNotice: 'Bir sonraki ödeme için vergi bilgilerinizin doğrulanması gerekiyor. Destek ekibimizle iletişime geçin.',
    closedStatusDescription: 'Ortaklığınız kapalı. Yeniden etkinleştirme için bize yazın.',
    supportLink: 'Destek sayfası',
    ibanMissingTitle: 'IBAN ekleyin',
    ibanMissing: 'Ortaklığınız aktif ve yönlendirme bağlantınız çalışıyor. Yeniden etkinleştirme sonrası IBAN kaydınız bulunmuyor.',
    saveIban: 'IBAN ekle',
    savingIban: 'IBAN kaydediliyor…',
    ibanSaved: 'IBAN kaydedildi.',
    noReferral: 'Bağlantınız hazır olduğunda burada gösterilir.',
    missingName: 'Ödeme alacak kişinin veya kuruluşun adını girin.',
    missingIban: 'Devam etmek için Türkiye IBAN’ınızı girin.',
    balanceOutstanding: 'Pozitif bekleyen/kullanılabilir bakiye veya açık nakit talebi varken ortaklık kapatılamaz.',

    errors: {
      not_authenticated: 'Oturumunuz doğrulanamadı. Lütfen yeniden giriş yapın.',
      program_unavailable: 'Program şu anda kullanılamıyor. Lütfen daha sonra tekrar deneyin.',
      invalid_input: 'Form bilgilerini kontrol edip yeniden deneyin.',
      terms_required: 'Devam etmek için şartları kabul etmelisiniz.',
      invalid_name: 'Ad alanını kontrol edin (2–120 karakter).',
      invalid_tax_status: 'Geçerli bir vergi statüsü seçin.',
      invalid_iban: 'Geçerli bir Türkiye IBAN’ı girin.',
      encryption_unavailable: 'IBAN güvenli biçimde saklanamadı. Bilgiler kaydedilmedi; lütfen daha sonra tekrar deneyin.',
      already_registered: 'Bu hesap için zaten bir ortaklık kaydı bulunuyor.',
      not_active: 'Etkin bir ortaklık bulunamadı.',
      iban_unavailable: 'Aktif ve IBAN bilgisi eksik bir ortaklık bulunamadı. Sayfayı yenileyip tekrar deneyin.',
      balance_outstanding: 'Pozitif bakiye veya açık nakit talebi varken ortaklık kapatılamaz.',
    } as Record<string, string>,
  },
  en: {
    title: 'Referral Partner',
    descriptionBeforeLink: 'Share your GLOVAL AI link and securely track referrals from your ',
    descriptionLink: 'dashboard',
    descriptionAfterLink: '.',
    active: 'Active',
    suspended: 'Under review',
    closed: 'Closed',
    codeLabel: 'Your referral link',
    copy: 'Copy link',
    copied: 'Copied',
    copyFailed: 'Could not copy the link.',
    ibanLast4: 'Last 4 digits of the saved IBAN',
    payoutHint: `You can request a payout when your available balance reaches TRY ${minimumPayoutEn}.`, 
    close: 'Close partnership',
    joinTitle: 'Join the program',
    termsIntro: 'Read the participation terms in the box below. The acceptance checkbox follows the terms.',
    termsBox: 'Referral partner program terms',
    acceptTerms: 'I have read and accept the Referral Partner Program Terms.',
    fullTerms: 'Open the full terms',
    payeeName: 'Payee person or organization name',
    payeeNameHint: 'Enter the name associated with your tax or payout records.',
    taxStatus: 'Tax status',
    individual: 'Individual',
    company: 'Company',
    companyTaxHint: 'Under this program mapping, company and sole-proprietor status require an invoice for cash payout.',
    individualTaxHint: 'Individual status does not require an invoice in this program workflow.',
    iban: 'IBAN',
    ibanHint: 'Enter a Turkish IBAN. It is encrypted server-side with AES-256-GCM; only its last 4 digits are shown here.',
    join: 'Join the program',
    submitting: 'Saving…',
    closeTitle: 'Close your partnership?',
    closeDescription: 'Your referral link will be disabled and the encrypted IBAN will be removed. This action cannot be undone.',
    closeConfirm: 'Close partnership',
    cancel: 'Cancel',
    closing: 'Closing…',
    success: 'Referral partnership activated.',
    closeSuccess: 'Referral partnership closed.',
    suspendedStatusDescription: 'This partnership is not accepting new referrals. Contact support if you believe its status should change.',
    taxVerificationNotice: 'Your tax information must be verified before the next payout. Please contact our support team.',
    closedStatusDescription: 'Your partnership is closed. Contact us to request reactivation.',
    supportLink: 'Support page',
    ibanMissingTitle: 'Add an IBAN',
    ibanMissing: 'Your partnership is active and the referral link still works. There is no IBAN on file after reactivation.',
    saveIban: 'Add IBAN',
    savingIban: 'Saving IBAN…',
    ibanSaved: 'IBAN saved.',
    noReferral: 'Your link will appear here once it is ready.',
    missingName: 'Enter the payee person or organization name.',
    missingIban: 'Enter your Turkish IBAN to continue.',
    balanceOutstanding: 'A partnership cannot be closed while a positive pending/available balance or open cash request remains.',

    errors: {
      not_authenticated: 'Your session could not be verified. Please sign in again.',
      program_unavailable: 'The program is unavailable right now. Please try again later.',
      invalid_input: 'Check the form and try again.',
      terms_required: 'You must accept the terms to continue.',
      invalid_name: 'Check the name field (2–120 characters).',
      invalid_tax_status: 'Choose a valid tax status.',
      invalid_iban: 'Enter a valid Turkish IBAN.',
      encryption_unavailable: 'The IBAN could not be stored securely. Nothing was saved; please try again later.',
      already_registered: 'A partner record already exists for this account.',
      not_active: 'No active partnership was found.',
      iban_unavailable: 'No active partnership with a missing IBAN was found. Refresh the page and try again.',
      balance_outstanding: 'A partnership cannot be closed while a positive balance or open cash request remains.',
    } as Record<string, string>,
  },
} as const

export function ReferralPartnerCard({
  enabled,
  partner,
  payoutData = null,
  payoutsEnabled = false,
  cashPayoutsEnabled = false,
}: {
  enabled: boolean
  partner: ReferralPartnerSettings | null
  payoutData?: ReferralPayoutPanelData | null
  payoutsEnabled?: boolean
  cashPayoutsEnabled?: boolean
}) {
  const { lang } = useLanguage()
  const language = lang === 'tr' ? 'tr' : 'en'
  const copy = COPY[language]
  const router = useRouter()
  const payeeNameRef = useRef<HTMLInputElement>(null)
  const ibanRef = useRef<HTMLInputElement>(null)
  const termsCheckboxRef = useRef<HTMLInputElement>(null)
  const [payeeName, setPayeeName] = useState('')
  const [taxStatus, setTaxStatus] = useState<'individual' | 'company'>('individual')
  const [iban, setIban] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [termsError, setTermsError] = useState(false)
  const [nameError, setNameError] = useState(false)
  const [ibanError, setIbanError] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [noticeKind, setNoticeKind] = useState<'activated' | 'closed' | 'iban-saved' | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSavingIban, setIsSavingIban] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!enabled) return null

  const referralUrl = partner?.status === 'active'
    ? `https://gloval.ai/?ref=${partner.referralCode}`
    : null
  const terms = REFERRAL_TERMS[language]

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return

    setError(null)
    setNotice(null)
    setNoticeKind(null)

    if (!termsAccepted) {
      setTermsError(true)
      termsCheckboxRef.current?.focus()
      return
    }
    setTermsError(false)

    const normalizedName = payeeName.trim()
    if (normalizedName.length < 2) {
      setNameError(true)
      payeeNameRef.current?.focus()
      return
    }
    setNameError(false)

    const normalizedIban = iban.replace(/\s+/g, '').toUpperCase()
    if (!normalizedIban) {
      setIbanError(true)
      ibanRef.current?.focus()
      return
    }
    setIbanError(false)

    setIsSubmitting(true)
    const result = await activateReferralPartner({
      payeeName: normalizedName,
      taxStatus,
      iban: normalizedIban,
      termsAccepted,
      termsVersion: REFERRAL_TERMS_VERSION,
      lang: language,
    })
    setIsSubmitting(false)

    if (!result.ok) {
      setError(copy.errors[result.error] ?? copy.errors.program_unavailable)
      return
    }

    setIban('')
    setPayeeName('')
    setNotice(copy.success)
    setNoticeKind('activated')
    router.refresh()
  }

  async function handleCopyLink() {
    if (!referralUrl) return
    try {
      await navigator.clipboard.writeText(referralUrl)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  async function handleSaveIban(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingIban) return

    setError(null)
    setNotice(null)
    setNoticeKind(null)
    setIsSavingIban(true)
    const result = await saveReferralPartnerIban({ iban })
    setIsSavingIban(false)

    if (!result.ok) {
      setError(copy.errors[result.error] ?? copy.errors.program_unavailable)
      return
    }

    setIban('')
    setNotice(copy.ibanSaved)
    setNoticeKind('iban-saved')
    router.refresh()
  }

  async function handleClosePartner() {
    if (isClosing) return
    setError(null)
    setNotice(null)
    setNoticeKind(null)
    setIsClosing(true)
    const result = await closeReferralPartner()
    setIsClosing(false)
    setShowCloseConfirm(false)

    if (!result.ok) {
      setError(copy.errors[result.error] ?? copy.errors.program_unavailable)
      return
    }

    setNotice(copy.closeSuccess)
    setNoticeKind('closed')
    router.refresh()
  }

  const statusLabel = partner?.status === 'active'
    ? copy.active
    : partner?.status === 'suspended'
      ? copy.suspended
      : copy.closed
  const payoutState = payoutData?.state
  const closeBlocked = Boolean(
    payoutsEnabled &&
    payoutState &&
    (payoutState.pendingCents > 0 || payoutState.availableCents > 0 || payoutState.requestedCents > 0 || payoutState.hasOpenCashRequest),
  )
  const taxVerificationRequired = Boolean(
    payoutsEnabled && partner?.status === 'suspended' && payoutState && !payoutState.taxVerified,
  )

  return (
    <>
      <Card className="mx-auto mt-6 w-full max-w-2xl border-border/80 bg-card/70">
        <CardHeader className="gap-2 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              {copy.title}
            </CardTitle>
            {partner && <Badge variant={partner.status === 'active' ? 'default' : 'secondary'}>{statusLabel}</Badge>}
          </div>
          <CardDescription>
            {copy.descriptionBeforeLink}
            <Link href="/dashboard#satis-ortakligi" className="font-medium text-primary underline underline-offset-4">
              {copy.descriptionLink}
            </Link>
            {copy.descriptionAfterLink}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4 pt-0 sm:p-5 sm:pt-0">
          {partner?.status === 'active' && referralUrl ? (
            <>
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{copy.codeLabel}</p>
                  <p className="mt-1 font-mono text-sm text-muted-foreground">
              https://gloval.ai/?ref=<wbr />
              <span className="whitespace-nowrap">{partner.referralCode}</span>
            </p>
                </div>
                <Button type="button" variant="outline" onClick={handleCopyLink} className="shrink-0 gap-2">
                  {copyState === 'copied' ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                  {copyState === 'copied' ? copy.copied : copy.copy}
                </Button>
              </div>
              {!partner.ibanLast4 && (
                <div className="flex flex-col gap-3">
                  <Alert>
                    <AlertDescription>
                      <span className="font-medium text-foreground">{copy.ibanMissingTitle}.</span>{' '}
                      {copy.ibanMissing}
                    </AlertDescription>
                  </Alert>
                  <form onSubmit={handleSaveIban} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <Field className="flex-1">
                      <FieldLabel htmlFor="referral-iban-update">{copy.iban}</FieldLabel>
                      <Input
                        id="referral-iban-update"
                        value={iban}
                        onChange={(event) => setIban(event.target.value.toUpperCase())}
                        autoComplete="off"
                        inputMode="text"
                        maxLength={34}
                        required
                        disabled={isSavingIban}
                      />
                    </Field>
                    <Button type="submit" disabled={isSavingIban} className="gap-2">
                      {isSavingIban && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                      {isSavingIban ? copy.savingIban : copy.saveIban}
                    </Button>
                  </form>
                </div>
              )}
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  <p>{copy.ibanLast4}: <span className="font-mono text-foreground">•••• {partner.ibanLast4 ?? '—'}</span></p>
                  {payoutsEnabled && <p>{copy.payoutHint}</p>}
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  {payoutsEnabled && (
                    <div className="min-w-0 flex-1">
                      <ReferralPayoutControls
                        data={payoutData}
                        enabled={payoutsEnabled}
                        cashEnabled={cashPayoutsEnabled}
                        variant="compact"
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowCloseConfirm(true)}
                    disabled={closeBlocked}
                    title={closeBlocked ? copy.balanceOutstanding : undefined}
                    className="w-fit shrink-0 self-start"
                  >
                    {copy.close}
                  </Button>
                </div>
                {closeBlocked && <p className="text-xs text-muted-foreground">{copy.balanceOutstanding}</p>}
              </div>
            </>
          ) : partner ? (
            <div className="flex flex-col gap-4">
              <Alert>
                <AlertDescription className="flex flex-wrap items-center gap-1">
                  {partner.status === 'closed'
                    ? copy.closedStatusDescription
                    : taxVerificationRequired
                      ? copy.taxVerificationNotice
                      : copy.suspendedStatusDescription}{' '}
                  <Link href="/support" className="font-medium text-primary underline underline-offset-4">
                    {copy.supportLink}
                  </Link>
                </AlertDescription>
              </Alert>
              {partner.status === 'suspended' && payoutsEnabled && (
                <ReferralPayoutControls
                  data={payoutData}
                  enabled={payoutsEnabled}
                  cashEnabled={cashPayoutsEnabled}
                  variant="compact"
                />
              )}
            </div>
          ) : (
            <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{copy.termsIntro}</p>
                <div
                  tabIndex={0}
                  aria-label={copy.termsBox}
                  aria-invalid={termsError || undefined}
                  aria-describedby={termsError ? 'referral-terms-error' : undefined}
                  className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/20 p-4 text-sm leading-relaxed text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <p>{terms.intro.join(' ')}</p>
                  <div className="mt-4 flex flex-col gap-4">
                    {terms.sections.map((section) => (
                      <section key={section.heading}>
                        <h3 className="font-semibold text-foreground">{section.heading}</h3>
                        <div className="mt-1 flex flex-col gap-2">
                          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
                <Link href="/yasal/satis-ortakligi-sartlari" className="w-fit text-sm text-primary underline underline-offset-4">
                  {copy.fullTerms}
                </Link>
              </div>

              <div className={termsError ? 'rounded-md border border-destructive bg-destructive/5 p-3' : 'rounded-md border border-transparent p-3'}>
                <label htmlFor="referral-terms-accepted" className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                  <input
                    ref={termsCheckboxRef}
                    id="referral-terms-accepted"
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(event) => {
                      setTermsAccepted(event.target.checked)
                      if (event.target.checked) setTermsError(false)
                    }}
                    disabled={isSubmitting}
                    aria-invalid={termsError}
                    aria-describedby={termsError ? 'referral-terms-error' : undefined}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                  <span>{copy.acceptTerms}</span>
                </label>
                {termsError && (
                  <p id="referral-terms-error" role="alert" className="mt-2 text-sm text-destructive">
                    {copy.errors.terms_required}
                  </p>
                )}
              </div>

              <FieldGroup>
                <FieldGroup className="sm:flex-row">
                  <Field className="flex-1" data-invalid={nameError || undefined}>
                    <FieldLabel htmlFor="referral-payee-name">{copy.payeeName}</FieldLabel>
                    <Input
                      ref={payeeNameRef}
                      id="referral-payee-name"
                      value={payeeName}
                      onChange={(event) => {
                        setPayeeName(event.target.value)
                        if (event.target.value.trim().length >= 2) setNameError(false)
                      }}
                      autoComplete="name"
                      maxLength={120}
                      disabled={isSubmitting}
                      aria-invalid={nameError}
                      aria-describedby={nameError ? 'referral-payee-name-hint referral-payee-name-error' : 'referral-payee-name-hint'}
                    />
                    <FieldDescription id="referral-payee-name-hint">{copy.payeeNameHint}</FieldDescription>
                    {nameError && (
                      <p id="referral-payee-name-error" role="alert" className="text-sm text-destructive">
                        {copy.missingName}
                      </p>
                    )}
                  </Field>
                  <Field className="flex-1">
                    <FieldLabel htmlFor="referral-tax-status">{copy.taxStatus}</FieldLabel>
                    <select
                      id="referral-tax-status"
                      value={taxStatus}
                      onChange={(event) => setTaxStatus(event.target.value as 'individual' | 'company')}
                      disabled={isSubmitting}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="individual">{copy.individual}</option>
                      <option value="company">{copy.company}</option>
                    </select>
                    <FieldDescription>{taxStatus === 'company' ? copy.companyTaxHint : copy.individualTaxHint}</FieldDescription>
                  </Field>
                </FieldGroup>
                <Field data-invalid={ibanError || undefined}>
                  <FieldLabel htmlFor="referral-iban">{copy.iban}</FieldLabel>
                  <Input
                    ref={ibanRef}
                    id="referral-iban"
                    value={iban}
                    onChange={(event) => {
                      setIban(event.target.value.toUpperCase())
                      if (event.target.value.trim()) setIbanError(false)
                    }}
                    autoComplete="off"
                    inputMode="text"
                    maxLength={34}
                    disabled={isSubmitting}
                    aria-invalid={ibanError}
                    aria-describedby={ibanError ? 'referral-iban-hint referral-iban-error' : 'referral-iban-hint'}
                  />
                  <FieldDescription id="referral-iban-hint">{copy.ibanHint}</FieldDescription>
                  {ibanError && (
                    <p id="referral-iban-error" role="alert" className="text-sm text-destructive">
                      {copy.missingIban}
                    </p>
                  )}
                </Field>
              </FieldGroup>

              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {notice && <p role="status" className="text-sm text-primary">{notice}</p>}

              <div className="flex justify-end">
                <Button type="submit" aria-disabled={!termsAccepted || isSubmitting} disabled={isSubmitting} className="gap-2">
                  {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {isSubmitting ? copy.submitting : copy.join}
                </Button>
              </div>
            </form>
          )}
          {partner && error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {copyState !== 'idle' && (
            <p
              role="status"
              aria-live="polite"
              className={copyState === 'failed' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
            >
              {copyState === 'failed' ? copy.copyFailed : copy.copied}
            </p>
          )}
          {notice && partner && (
            <p role="status" className="flex items-center gap-2 text-sm text-primary">
              {noticeKind === 'activated' && (
                <span className="referral-activated-dot size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
              )}
              {notice}
            </p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showCloseConfirm}
        title={copy.closeTitle}
        description={copy.closeDescription}
        confirmLabel={isClosing ? copy.closing : copy.closeConfirm}
        cancelLabel={copy.cancel}
        destructive
        confirmDisabled={isClosing}
        onConfirm={handleClosePartner}
        onCancel={() => setShowCloseConfirm(false)}
      />
    </>
  )
}
