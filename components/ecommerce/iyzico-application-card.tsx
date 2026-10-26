'use client'

import { useState, type FormEvent } from 'react'
import useSWR from 'swr'
import { CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw, XCircle } from 'lucide-react'
import {
  getIyzicoApplicationOverview,
  setIyzicoApplicationMarker,
  submitIyzicoApplicationRequest,
  type ApplicationOverview,
} from '@/lib/iyzico-application'
import {
  APPLICATION_DOCUMENTS,
  APPLICATION_LIMITS,
  IYZICO_APPLY_URL,
  type ApplicationError,
  type ApplicationMarker,
  type ReadinessFix,
  type ReadinessItem,
  type ReadinessItemId,
  type ReadinessProblem,
} from '@/lib/iyzico-application-shared'
import { IyzicoSettingsPanel } from '@/components/ecommerce/iyzico-settings-panel'
import { IyzicoInstantCard, useIyzicoInstantPrefill } from '@/components/ecommerce/iyzico-instant-card'

type Lang = 'tr' | 'en'

const itemLabel: Record<ReadinessItemId, { tr: string; en: string }> = {
  published: { tr: 'Site yayında', en: 'Site is published' },
  reachable: { tr: 'Site adresi erişilebilir', en: 'Site address is reachable' },
  https: { tr: 'Adres https ile açılıyor', en: 'Address opens over https' },
  privacy: { tr: 'Gizlilik Politikası sayfası', en: 'Privacy Policy page' },
  about: { tr: 'Hakkımızda bölümü', en: 'About section' },
  contact: { tr: 'İletişim bölümü (dolu bilgilerle)', en: 'Contact section (filled in)' },
  delivery: { tr: 'Teslimat ve İade sayfası', en: 'Delivery & Returns page' },
  distance: { tr: 'Mesafeli Satış Sözleşmesi sayfası', en: 'Distance Sales Agreement page' },
  footer: { tr: 'Alt bilgide iyzico, Mastercard ve Visa logoları', en: 'iyzico, Mastercard and Visa logos in the footer' },
}

const problemText: Record<ReadinessProblem, { tr: string; en: string }> = {
  not_published: { tr: 'Önce siteyi yayınla.', en: 'Publish the site first.' },
  unreachable: { tr: 'Adrese ulaşılamadı. Yayını kontrol edip yeniden dene.', en: 'The address could not be reached. Check publishing and retry.' },
  not_https: { tr: 'Adres https ile açılmıyor.', en: 'The address does not open over https.' },
  missing: { tr: 'Bulunamadı.', en: 'Not found.' },
  hidden: { tr: 'Gizlenmiş; görünür yap.', en: 'Hidden; make it visible.' },
  empty: { tr: 'İçerik boş veya çok kısa.', en: 'Content is empty or too short.' },
  placeholder: { tr: 'Yer tutucu (ör. [Adres]) kalmış; gerçek bilgiyle doldur.', en: 'Placeholder text (e.g. [Address]) remains; fill in real details.' },
  footer_hidden: { tr: 'Alt bilgi bölümü gizli; görünür yap.', en: 'The footer section is hidden; make it visible.' },
  unchecked: { tr: 'Önceki adım tamamlanınca kontrol edilir.', en: 'Checked once the previous step is done.' },
}

const fixHint: Record<ReadinessFix, { tr: string; en: string }> = {
  publish: { tr: 'Editörün üst çubuğundaki Yayınla düğmesini kullan.', en: 'Use the Publish button in the editor header.' },
  legal: { tr: 'Tasarım sekmesi, Yasal metinler bölümü.', en: 'Design tab, Legal texts section.' },
  sections: { tr: 'Tasarım sekmesi, ilgili bölümün alanları.', en: 'Design tab, the section\u2019s fields.' },
  footer: { tr: 'Tasarım sekmesi, Alt bilgi bölümü.', en: 'Design tab, Footer section.' },
}

const errorText: Record<ApplicationError, { tr: string; en: string }> = {
  invalid_name: { tr: 'Ad ve soyadı birlikte yaz.', en: 'Enter first and last name.' },
  invalid_email: { tr: 'Geçerli bir e-posta yaz.', en: 'Enter a valid e-mail.' },
  invalid_phone: { tr: 'Geçerli bir cep telefonu yaz (ör. 0532 000 00 00).', en: 'Enter a valid mobile number (e.g. 0532 000 00 00).' },
  consent_required: { tr: 'Devam etmek için onay kutusunu işaretle.', en: 'Tick the consent box to continue.' },
  site_not_published: { tr: 'Talep için sitenin yayında olması gerekir.', en: 'Your site must be published first.' },
  rate_limited: {
    tr: `24 saat içinde en fazla ${APPLICATION_LIMITS.perUser} talep gönderilebilir. Daha sonra tekrar dene.`,
    en: `At most ${APPLICATION_LIMITS.perUser} requests can be sent per 24 hours. Try again later.`,
  },
  unavailable: { tr: 'Talep şu an gönderilemedi. Biraz sonra tekrar dene.', en: 'The request could not be sent right now. Try again shortly.' },
}

const copy = {
  tr: {
    title: 'iyzico başvuru asistanı',
    intro: 'Kart ödemesi almak için iyzico\u2019da kendi üye işyeri hesabını açarsın. Adımları sırayla takip et.',
    s1: 'Siteni hazırla',
    s1d: 'iyzico, başvuruda yayındaki siteni inceler. Aşağıdaki kontroller siteni canlı olarak denetler.',
    recheck: 'Yeniden kontrol et',
    checking: 'Kontrol ediliyor…',
    allGood: 'Site başvuruya hazır görünüyor.',
    someMissing: 'Eksikleri tamamlayıp yeniden kontrol et.',
    s2: 'iyzico\u2019ya başvur',
    s2d: 'Başvuruyu iyzico\u2019nun sitesinde sen yaparsın. Hazır bulundurman gerekenler:',
    apply: 'iyzico\u2019da başvur',
    orApply: 'veya iyzico.com üzerinden başvur',
    applied: 'Başvurumu yaptım',
    appliedDone: 'Başvuru yapıldı olarak işaretlendi',
    undo: 'Geri al',
    s3: 'API anahtarlarını gir',
    s3d: 'iyzico hesabın açılınca panelden API ve gizli anahtarını alıp buraya gir.',
    opened: 'iyzico hesabım açıldı',
    openedDone: 'Hesap açıldı olarak işaretlendi',
    helpTitle: 'Başvuruda yardım ister misin?',
    helpD: 'Bilgilerini bırak, platform ekibi seninle e-posta ile iletişime geçsin.',
    name: 'Ad soyad',
    email: 'E-posta',
    phone: 'Cep telefonu',
    consent:
      'Ad, e-posta ve telefonumun, başvuru talebimi iletmek ve benimle iletişime geçmek amacıyla platform ekibine e-posta ile iletilmesini kabul ediyorum. Bu bilgiler kalıcı olarak saklanmaz.',
    send: 'Talebi gönder',
    sending: 'Gönderiliyor…',
    sent: 'Talebin alındı. Ekip e-posta ile seninle iletişime geçecek.',
    formOff: 'Yardım talebi şu an kullanılamıyor.',
    publishFirst: 'Talep için önce siteyi yayınla.',
    loadFail: 'Başvuru asistanı yüklenemedi.',
    retry: 'Tekrar dene',
    openDesign: 'Tasarım sekmesini aç',
    saveFail: 'Kaydedilemedi, tekrar dene.',
  },
  en: {
    title: 'iyzico application assistant',
    intro: 'To accept card payments you open your own iyzico merchant account. Follow the steps in order.',
    s1: 'Get your site ready',
    s1d: 'iyzico reviews your live site when you apply. These checks audit your site live.',
    recheck: 'Check again',
    checking: 'Checking…',
    allGood: 'Your site looks ready for the application.',
    someMissing: 'Complete what is missing, then check again.',
    s2: 'Apply at iyzico',
    s2d: 'You apply on iyzico\u2019s own website. Have these ready:',
    apply: 'Apply at iyzico',
    orApply: 'or apply on iyzico.com',
    applied: 'I have applied',
    appliedDone: 'Marked as applied',
    undo: 'Undo',
    s3: 'Enter your API keys',
    s3d: 'Once your iyzico account is open, copy the API and secret key from its panel and enter them here.',
    opened: 'My iyzico account is open',
    openedDone: 'Marked as account open',
    helpTitle: 'Want help with the application?',
    helpD: 'Leave your details and the platform team will contact you by e-mail.',
    name: 'Full name',
    email: 'E-mail',
    phone: 'Mobile phone',
    consent:
      'I agree that my name, e-mail and phone are sent by e-mail to the platform team to relay my application request and contact me. These details are not stored.',
    send: 'Send request',
    sending: 'Sending…',
    sent: 'Request received. The team will contact you by e-mail.',
    formOff: 'The help request is unavailable right now.',
    publishFirst: 'Publish your site first to send a request.',
    loadFail: 'The application assistant could not be loaded.',
    retry: 'Retry',
    openDesign: 'Open the Design tab',
    saveFail: 'Could not save, try again.',
  },
}

function StepHeading({ index, title, done }: { index: number; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
        }`}
      >
        {done ? <CheckCircle2 className="size-4" /> : index}
      </span>
      <h3 className="text-sm font-medium">{title}</h3>
    </div>
  )
}

function ReadinessRow({ item, lang, onOpenDesign, openLabel }: { item: ReadinessItem; lang: Lang; onOpenDesign?: () => void; openLabel: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {item.ok ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      ) : (
        <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      )}
      <div className="min-w-0">
        <p className={item.ok ? '' : 'font-medium'}>
          {itemLabel[item.id][lang]}
          <span className="sr-only">{item.ok ? (lang === 'tr' ? ' tamam' : ' ok') : lang === 'tr' ? ' eksik' : ' missing'}</span>
        </p>
        {!item.ok && item.problem && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            {problemText[item.problem][lang]} {fixHint[item.fix][lang]}
            {item.fix !== 'publish' && onOpenDesign && (
              <>
                {' '}
                <button type="button" onClick={onOpenDesign} className="text-brand underline underline-offset-2">
                  {openLabel}
                </button>
              </>
            )}
          </p>
        )}
      </div>
    </li>
  )
}

function HelpForm({ projectId, overview, lang }: { projectId: string; overview: ApplicationOverview; lang: Lang }) {
  const c = copy[lang]
  const [name, setName] = useState(overview.prefill.name)
  const [email, setEmail] = useState(overview.prefill.email)
  const [phone, setPhone] = useState(overview.prefill.phone)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ApplicationError | null>(null)
  const [sent, setSent] = useState(false)
  const live = overview.siteUrl !== null

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await submitIyzicoApplicationRequest(projectId, { name, email, phone }, consent)
      if (result.ok) setSent(true)
      else setError(result.error)
    } catch {
      setError('unavailable')
    } finally {
      setBusy(false)
    }
  }

  if (sent) return <p role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">{c.sent}</p>
  if (!overview.formEnabled) return <p className="text-xs text-muted-foreground">{c.formOff}</p>

  const field = 'h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary'
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-border p-3" noValidate>
      <div>
        <p className="text-sm font-medium">{c.helpTitle}</p>
        <p className="text-xs text-muted-foreground">{c.helpD}</p>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.name}
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={160} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.email}
        <input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {c.phone}
        <input className={field} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={24} required />
      </label>
      <label className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
        <span>{c.consent}</span>
      </label>
      {!live && <p className="text-xs text-muted-foreground">{c.publishFirst}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {errorText[error][lang]}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !consent || !live}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? c.sending : c.send}
      </button>
    </form>
  )
}

export function IyzicoApplicationCard({
  projectId,
  lang,
  onOpenDesign,
}: {
  projectId: string
  lang: Lang
  onOpenDesign?: () => void
}) {
  const c = copy[lang]
  const { data, error, isValidating, mutate } = useSWR<ApplicationOverview>(
    ['iyzico-application', projectId],
    () => getIyzicoApplicationOverview(projectId),
    { revalidateOnFocus: false },
  )
  const { data: instantPrefill } = useIyzicoInstantPrefill(projectId)
  const [markerBusy, setMarkerBusy] = useState<ApplicationMarker | null>(null)
  const [markerError, setMarkerError] = useState(false)

  async function toggle(marker: ApplicationMarker, value: boolean) {
    setMarkerBusy(marker)
    setMarkerError(false)
    try {
      const result = await setIyzicoApplicationMarker(projectId, marker, value)
      if (result.ok && result.state) {
        await mutate((prev) => (prev ? { ...prev, state: result.state! } : prev), { revalidate: false })
      } else setMarkerError(true)
    } catch {
      setMarkerError(true)
    } finally {
      setMarkerBusy(null)
    }
  }

  if (error && !data) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm">
        <p className="text-destructive">{c.loadFail}</p>
        <button type="button" onClick={() => void mutate()} className="self-start text-brand underline underline-offset-2">
          {c.retry}
        </button>
      </section>
    )
  }
  if (!data) {
    return (
      <section className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="size-4 animate-spin" /> {c.checking}
      </section>
    )
  }

  const ready = data.items.every((item) => item.ok)
  const keysDone = data.iyzico.tested
  const instantPrimary =
    instantPrefill?.enabled === true && !data.iyzico.apiKeyPresent && !data.iyzico.secretKeyPresent

  return (
    <section aria-labelledby="iyzico-application-title" className="flex flex-col gap-4 rounded-lg border border-border p-3">
      <div>
        <h2 id="iyzico-application-title" className="text-sm font-semibold">{c.title}</h2>
        <p className="text-xs leading-relaxed text-muted-foreground">{c.intro}</p>
      </div>

      <div className="flex flex-col gap-2">
        <StepHeading index={1} title={c.s1} done={ready} />
        <p className="text-xs leading-relaxed text-muted-foreground">{c.s1d}</p>
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <ReadinessRow key={item.id} item={item} lang={lang} onOpenDesign={onOpenDesign} openLabel={c.openDesign} />
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void mutate()}
            disabled={isValidating}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isValidating ? 'animate-spin' : ''}`} />
            {isValidating ? c.checking : c.recheck}
          </button>
          <p role="status" className="text-xs text-muted-foreground">{ready ? c.allGood : c.someMissing}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <StepHeading index={2} title={c.s2} done={Boolean(data.state.appliedAt)} />
        <p className="text-xs text-muted-foreground">{c.s2d}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {APPLICATION_DOCUMENTS.map((doc) => (
            <li key={doc.key} className="flex items-start gap-2">
              <Circle className="mt-1.5 size-2 shrink-0 fill-current text-muted-foreground" aria-hidden />
              {doc[lang]}
            </li>
          ))}
        </ul>
        {instantPrimary && (
          <IyzicoInstantCard projectId={projectId} onSubmitted={() => void toggle('applied', true)} />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={IYZICO_APPLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={
              instantPrimary
                ? 'inline-flex items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground'
                : 'inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90'
            }
          >
            {instantPrimary ? c.orApply : c.apply}
            <ExternalLink className="size-4" aria-hidden />
          </a>
          {data.state.appliedAt ? (
            <>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{c.appliedDone}</span>
              <button type="button" disabled={markerBusy !== null} onClick={() => void toggle('applied', false)} className="text-xs text-muted-foreground underline underline-offset-2">
                {c.undo}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={markerBusy !== null}
              onClick={() => void toggle('applied', true)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {c.applied}
            </button>
          )}
        </div>
        <HelpForm projectId={projectId} overview={data} lang={lang} />
      </div>

      <div className="flex flex-col gap-2">
        <StepHeading index={3} title={c.s3} done={keysDone} />
        <p className="text-xs leading-relaxed text-muted-foreground">{c.s3d}</p>
        <div className="flex flex-wrap items-center gap-2">
          {data.state.accountOpenedAt ? (
            <>
              <span className="text-xs text-emerald-600 dark:text-emerald-400">{c.openedDone}</span>
              <button type="button" disabled={markerBusy !== null} onClick={() => void toggle('account_opened', false)} className="text-xs text-muted-foreground underline underline-offset-2">
                {c.undo}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={markerBusy !== null}
              onClick={() => void toggle('account_opened', true)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-3 text-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {c.opened}
            </button>
          )}
        </div>
        {markerError && <p role="alert" className="text-xs text-destructive">{c.saveFail}</p>}
        <IyzicoSettingsPanel
          projectId={projectId}
          showInstant={false}
          initial={data.iyzico}
          onChanged={(view) => void mutate((prev) => (prev ? { ...prev, iyzico: view } : prev), { revalidate: false })}
        />
      </div>
    </section>
  )
}
