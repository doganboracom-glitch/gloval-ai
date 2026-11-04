'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  getReferralPartnerHistory,
  searchReferralPartners,
  updateReferralPartnerStatus,
} from '@/lib/referrals/admin-actions'
import type {
  ReferralAdminPartner,
  ReferralPartnerStatusAction,
  ReferralPartnerStatusEvent,
} from '@/lib/referrals/partner-types'

type AdminLanguage = 'tr' | 'en'
type StatusFilter = 'all' | ReferralAdminPartner['status']
type SortOption = 'recent' | 'clicks' | 'signups' | 'conversion'

const copyByLanguage: Record<AdminLanguage, {
  search: string
  searchPlaceholder: string
  searchAction: string
  searching: string
  searchError: string
  statusFilter: string
  sortBy: string
  allStatuses: string
  active: string
  suspended: string
  closed: string
  recent: string
  mostClicks: string
  mostSignups: string
  bestConversion: string
  referralCode: string
  email: string
  status: string
  activated: string
  lastStatusChange: string
  iban: string
  clicks: string
  signups: string
  verifiedSignups: string
  paidCustomers: string
  conversion: string
  actions: string
  suspend: string
  reactivate: string
  close: string
  history: string
  noPartners: string
  noMatches: string
  historyTitle: string
  loadingHistory: string
  emptyHistory: string
  historyError: string
  actor: string
  previousStatus: string
  newStatus: string
  suspendedEvent: string
  reactivatedEvent: string
  closedEvent: string
  confirmSuspendTitle: string
  confirmSuspendDescription: string
  confirmReactivateTitle: string
  confirmReactivateDescription: string
  confirmCloseTitle: string
  confirmCloseDescription: string
  confirm: string
  cancel: string
  working: string
  actionSuccess: string
  actionError: string
  transitionConflict: string
  deletedActor: string
}> = {
  tr: {
    search: 'E-posta veya yönlendirme kodu',
    searchPlaceholder: 'E-posta ya da kod ara',
    searchAction: 'Ara',
    searching: 'Aranıyor…',
    searchError: 'Arama tamamlanamadı. Lütfen tekrar deneyin.',
    statusFilter: 'Durum filtresi',
    sortBy: 'Sırala',
    allStatuses: 'Tüm durumlar',
    active: 'Aktif',
    suspended: 'Askıda',
    closed: 'Kapalı',
    recent: 'En yeni katılım',
    mostClicks: 'En çok tıklama',
    mostSignups: 'En çok kayıt',
    bestConversion: 'En yüksek tıklama-kayıt dönüşümü',
    referralCode: 'Yönlendirme kodu',
    email: 'E-posta',
    status: 'Durum',
    activated: 'Katılım tarihi',
    lastStatusChange: 'Son durum değişikliği',
    iban: 'IBAN (son 4)',
    clicks: 'Tıklama',
    signups: 'Kayıt',
    verifiedSignups: 'Doğrulanmış',
    paidCustomers: 'Ücretli müşteri',
    conversion: 'Dönüşüm',
    actions: 'İşlemler',
    suspend: 'Askıya al',
    reactivate: 'Yeniden etkinleştir',
    close: 'Kapat',
    history: 'Durum geçmişi',
    noPartners: 'Henüz satış ortağı kaydı yok.',
    noMatches: 'Bu filtrelerle eşleşen ortak bulunamadı.',
    historyTitle: 'Durum değişikliği geçmişi',
    loadingHistory: 'Geçmiş yükleniyor…',
    emptyHistory: 'Henüz bir durum değişikliği kaydedilmedi.',
    historyError: 'Durum geçmişi yüklenemedi.',
    actor: 'İşlemi yapan',
    previousStatus: 'Önceki durum',
    newStatus: 'Yeni durum',
    suspendedEvent: 'Askıya alındı',
    reactivatedEvent: 'Yeniden etkinleştirildi',
    closedEvent: 'Kapatıldı',
    confirmSuspendTitle: 'Ortak askıya alınsın mı?',
    confirmSuspendDescription: 'Yönlendirme bağlantısı yeni tıklamaları kaydetmeyecek. İşlem daha sonra geri alınabilir.',
    confirmReactivateTitle: 'Ortak yeniden etkinleştirilsin mi?',
    confirmReactivateDescription: 'Yönlendirme bağlantısı yeniden çalışır. Kapalı ortaklıkta IBAN bilgisi silinmiştir ve ortak tarafından tekrar girilmesi gerekir.',
    confirmCloseTitle: 'Ortaklık kapatılsın mı?',
    confirmCloseDescription: 'Ortaklık kapatılır ve kayıtlı IBAN/vergi alıcı bilgileri kalıcı olarak temizlenir. Yönlendirme bağlantısı çalışmayı durdurur.',
    confirm: 'Onayla',
    cancel: 'Vazgeç',
    working: 'İşleniyor…',
    actionSuccess: 'Ortaklık durumu güncellendi.',
    actionError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    transitionConflict: 'Ortaklığın durumu değişmiş. Sayfayı yenileyip tekrar deneyin.',
    deletedActor: 'Silinmiş kullanıcı',
  },
  en: {
    search: 'Email or referral code',
    searchPlaceholder: 'Search email or code',
    searchAction: 'Search',
    searching: 'Searching…',
    searchError: 'Search could not be completed. Try again.',
    statusFilter: 'Filter by status',
    sortBy: 'Sort by',
    allStatuses: 'All statuses',
    active: 'Active',
    suspended: 'Suspended',
    closed: 'Closed',
    recent: 'Most recently joined',
    mostClicks: 'Most clicks',
    mostSignups: 'Most signups',
    bestConversion: 'Highest click-to-signup conversion',
    referralCode: 'Referral code',
    email: 'Email',
    status: 'Status',
    activated: 'Joined',
    lastStatusChange: 'Last status change',
    iban: 'IBAN (last 4)',
    clicks: 'Clicks',
    signups: 'Signups',
    verifiedSignups: 'Verified',
    paidCustomers: 'Paid customers',
    conversion: 'Conversion',
    actions: 'Actions',
    suspend: 'Suspend',
    reactivate: 'Reactivate',
    close: 'Close',
    history: 'Status history',
    noPartners: 'No referral partners yet.',
    noMatches: 'No partners match these filters.',
    historyTitle: 'Status change history',
    loadingHistory: 'Loading history…',
    emptyHistory: 'No status changes recorded yet.',
    historyError: 'Could not load status history.',
    actor: 'Changed by',
    previousStatus: 'Previous status',
    newStatus: 'New status',
    suspendedEvent: 'Suspended',
    reactivatedEvent: 'Reactivated',
    closedEvent: 'Closed',
    confirmSuspendTitle: 'Suspend this partner?',
    confirmSuspendDescription: 'The referral link will stop recording new clicks. This action can be reversed later.',
    confirmReactivateTitle: 'Reactivate this partner?',
    confirmReactivateDescription: 'The referral link will work again. A closed partnership has no IBAN on file; the partner must enter it again.',
    confirmCloseTitle: 'Close this partnership?',
    confirmCloseDescription: 'The partnership will be closed and stored IBAN/tax recipient details will be permanently cleared. The referral link will stop working.',
    confirm: 'Confirm',
    cancel: 'Cancel',
    working: 'Working…',
    actionSuccess: 'Partner status updated.',
    actionError: 'The action could not be completed. Please try again.',
    transitionConflict: 'The partner status changed. Refresh the page and try again.',
    deletedActor: 'Deleted user',
  },
}

function formatDate(value: string, locale: string, includeTime = false): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return new Intl.DateTimeFormat(locale, includeTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(date)
}

function statusLabel(status: ReferralAdminPartner['status'], copy: (typeof copyByLanguage)['tr']): string {
  return status === 'active' ? copy.active : status === 'suspended' ? copy.suspended : copy.closed
}

function actionLabel(action: ReferralPartnerStatusAction, copy: (typeof copyByLanguage)['tr']): string {
  return action === 'suspend' ? copy.suspendedEvent : action === 'reactivate' ? copy.reactivatedEvent : copy.closedEvent
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value)
}

function conversionRate(partner: ReferralAdminPartner): number {
  return partner.clicks > 0 ? partner.signups / partner.clicks : 0
}

function PartnerHistory({ partner, copy, locale }: {
  partner: ReferralAdminPartner
  copy: (typeof copyByLanguage)['tr']
  locale: string
}) {
  const [open, setOpen] = useState(false)
  const [events, setEvents] = useState<ReferralPartnerStatusEvent[] | null | undefined>(undefined)
  const [loading, setLoading] = useState(false)

  async function toggleHistory() {
    const nextOpen = !open
    setOpen(nextOpen)
    if (!nextOpen || events !== undefined || loading) return

    setLoading(true)
    try {
      setEvents(await getReferralPartnerHistory(partner.partnerId))
    } catch {
      setEvents(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" size="sm" variant="outline" aria-expanded={open} onClick={toggleHistory}>
        {copy.history}
      </Button>
      {open && (
        <div className="w-full min-w-64 rounded-lg border border-border bg-background p-3" role="region" aria-label={copy.historyTitle}>
          <p className="mb-2 text-xs font-semibold text-foreground">{copy.historyTitle}</p>
          {loading ? <p className="text-xs text-muted-foreground">{copy.loadingHistory}</p> : null}
          {events === null ? <p className="text-xs text-destructive">{copy.historyError}</p> : null}
          {Array.isArray(events) && events.length === 0 ? <p className="text-xs text-muted-foreground">{copy.emptyHistory}</p> : null}
          {events && events.length > 0 ? (
            <ol className="flex flex-col gap-3">
              {events.map((event) => (
                <li key={event.id} className="border-t border-border pt-2 text-xs leading-relaxed">
                  <p className="font-medium text-foreground">
                    {actionLabel(event.action, copy)} · {formatDate(event.createdAt, locale, true)}
                  </p>
                  <p className="text-muted-foreground">
                    {copy.previousStatus}: {statusLabel(event.fromStatus, copy)} · {copy.newStatus}: {statusLabel(event.toStatus, copy)}
                  </p>
                  <p className="break-all font-mono text-muted-foreground">
                    {copy.actor}: {event.actorUserId ?? copy.deletedActor}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PartnerActions({ partner, copy, busy, onAction, locale }: {
  partner: ReferralAdminPartner
  copy: (typeof copyByLanguage)['tr']
  busy: boolean
  onAction: (partner: ReferralAdminPartner, action: ReferralPartnerStatusAction) => void
  locale: string
}) {
  return (
    <div className="flex min-w-40 flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        {partner.status === 'active' ? (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onAction(partner, 'suspend')}>
            {copy.suspend}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onAction(partner, 'reactivate')}>
            {copy.reactivate}
          </Button>
        )}
        {partner.status !== 'closed' ? (
          <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => onAction(partner, 'close')}>
            {copy.close}
          </Button>
        ) : null}
      </div>
      <PartnerHistory partner={partner} copy={copy} locale={locale} />
    </div>
  )
}

export function ReferralPartnersAdminTable({ partners }: { partners: ReferralAdminPartner[] }) {
  const { lang } = useLanguage()
  const language: AdminLanguage = lang === 'tr' ? 'tr' : 'en'
  const copy = copyByLanguage[language]
  const locale = language === 'tr' ? 'tr-TR' : 'en-US'
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [serverResults, setServerResults] = useState<ReferralAdminPartner[] | null>(null)
  const [searchFailed, setSearchFailed] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOption, setSortOption] = useState<SortOption>('recent')
  const [pending, setPending] = useState<{ partner: ReferralAdminPartner; action: ReferralPartnerStatusAction } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const sourcePartners = serverResults ?? partners
  const visiblePartners = useMemo(() => {
    const filtered = sourcePartners.filter((partner) => statusFilter === 'all' || partner.status === statusFilter)

    return filtered.sort((left, right) => {
      if (sortOption === 'clicks') return right.clicks - left.clicks || left.referralCode.localeCompare(right.referralCode)
      if (sortOption === 'signups') return right.signups - left.signups || left.referralCode.localeCompare(right.referralCode)
      if (sortOption === 'conversion') return conversionRate(right) - conversionRate(left) || left.referralCode.localeCompare(right.referralCode)
      return new Date(right.activatedAt).getTime() - new Date(left.activatedAt).getTime()
    })
  }, [sourcePartners, sortOption, statusFilter])

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedQuery = query.trim()
    setSearchFailed(false)

    if (!normalizedQuery) {
      setServerResults(null)
      return
    }

    setIsSearching(true)
    try {
      const results = await searchReferralPartners(normalizedQuery)
      if (results === null) {
        setSearchFailed(true)
        return
      }
      setServerResults(results)
    } catch {
      setSearchFailed(true)
    } finally {
      setIsSearching(false)
    }
  }

  async function confirmStatusChange() {
    if (!pending || isSubmitting) return
    setIsSubmitting(true)
    setNotice(null)
    try {
      const result = await updateReferralPartnerStatus(pending.partner.partnerId, pending.action)
      if (!result.ok) {
        setNotice({ type: 'error', text: result.error === 'transition_conflict' ? copy.transitionConflict : copy.actionError })
        setPending(null)
        if (result.error === 'transition_conflict') router.refresh()
        return
      }
      setNotice({ type: 'success', text: copy.actionSuccess })
      setPending(null)
      setSearchFailed(false)
      setServerResults(null)
      setQuery('')
      router.refresh()
    } catch {
      setNotice({ type: 'error', text: copy.actionError })
      setPending(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  function confirmationCopy() {
    if (!pending) return { title: '', description: '' }
    const title = pending.action === 'suspend'
      ? copy.confirmSuspendTitle
      : pending.action === 'reactivate'
        ? copy.confirmReactivateTitle
        : copy.confirmCloseTitle
    const description = pending.action === 'suspend'
      ? copy.confirmSuspendDescription
      : pending.action === 'reactivate'
        ? copy.confirmReactivateDescription
        : copy.confirmCloseDescription
    return { title, description: `${description} (${pending.partner.referralCode})` }
  }

  const confirmation = confirmationCopy()

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <Alert variant={notice.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      ) : null}
      {searchFailed ? (
        <Alert variant="destructive">
          <AlertDescription>{copy.searchError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <form role="search" onSubmit={submitSearch} className="flex w-full items-end gap-2 lg:max-w-sm">
          <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm font-medium text-foreground">
            {copy.search}
            <Input
              type="search"
              value={query}
              placeholder={copy.searchPlaceholder}
              onChange={(event) => {
                const nextQuery = event.target.value
                setQuery(nextQuery)
                if (!nextQuery) {
                  setServerResults(null)
                  setSearchFailed(false)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault()
              }}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={isSearching}>
            {isSearching ? copy.searching : copy.searchAction}
          </Button>
        </form>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            {copy.statusFilter}
            <select
              aria-label={copy.statusFilter}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="all">{copy.allStatuses}</option>
              <option value="active">{copy.active}</option>
              <option value="suspended">{copy.suspended}</option>
              <option value="closed">{copy.closed}</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium text-foreground">
            {copy.sortBy}
            <select
              aria-label={copy.sortBy}
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
              className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="recent">{copy.recent}</option>
              <option value="clicks">{copy.mostClicks}</option>
              <option value="signups">{copy.mostSignups}</option>
              <option value="conversion">{copy.bestConversion}</option>
            </select>
          </label>
        </div>
      </div>

      {visiblePartners.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {sourcePartners.length === 0 && !query.trim() ? copy.noPartners : copy.noMatches}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 md:hidden">
            {visiblePartners.map((partner) => (
              <article key={partner.partnerId} className="flex flex-col gap-4 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs text-foreground">{partner.referralCode}</p>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{partner.maskedEmail}</p>
                  </div>
                  <Badge variant={partner.status === 'active' ? 'default' : partner.status === 'suspended' ? 'secondary' : 'outline'}>
                    {statusLabel(partner.status, copy)}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Metric label={copy.activated} value={formatDate(partner.activatedAt, locale)} />
                  <Metric label={copy.lastStatusChange} value={formatDate(partner.lastStatusChangedAt, locale)} />
                  <Metric label={copy.iban} value={partner.ibanLast4 ? `•••• ${partner.ibanLast4}` : '—'} mono />
                  <Metric label={copy.clicks} value={formatNumber(partner.clicks, locale)} />
                  <Metric label={copy.signups} value={formatNumber(partner.signups, locale)} />
                  <Metric label={copy.verifiedSignups} value={formatNumber(partner.verifiedSignups, locale)} />
                  <Metric label={copy.paidCustomers} value={formatNumber(partner.paidCustomers, locale)} />
                  <Metric label={copy.conversion} value={conversionRate(partner).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })} />
                </dl>
                <PartnerActions
                  partner={partner}
                  copy={copy}
                  locale={locale}
                  busy={isSubmitting && pending?.partner.partnerId === partner.partnerId}
                  onAction={(selected, action) => setPending({ partner: selected, action })}
                />
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[1480px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.referralCode}</TableHead>
                  <TableHead>{copy.email}</TableHead>
                  <TableHead>{copy.status}</TableHead>
                  <TableHead>{copy.activated}</TableHead>
                  <TableHead>{copy.lastStatusChange}</TableHead>
                  <TableHead>{copy.iban}</TableHead>
                  <TableHead className="text-right">{copy.clicks}</TableHead>
                  <TableHead className="text-right">{copy.signups}</TableHead>
                  <TableHead className="text-right">{copy.verifiedSignups}</TableHead>
                  <TableHead className="text-right">{copy.paidCustomers}</TableHead>
                  <TableHead className="text-right">{copy.conversion}</TableHead>
                  <TableHead>{copy.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePartners.map((partner) => (
                  <TableRow key={partner.partnerId}>
                    <TableCell className="font-mono text-xs">{partner.referralCode}</TableCell>
                    <TableCell className="max-w-48 truncate">{partner.maskedEmail}</TableCell>
                    <TableCell>
                      <Badge variant={partner.status === 'active' ? 'default' : partner.status === 'suspended' ? 'secondary' : 'outline'}>
                        {statusLabel(partner.status, copy)}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(partner.activatedAt, locale)}</TableCell>
                    <TableCell>{formatDate(partner.lastStatusChangedAt, locale)}</TableCell>
                    <TableCell className="font-mono text-xs">{partner.ibanLast4 ? `•••• ${partner.ibanLast4}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(partner.clicks, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(partner.signups, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(partner.verifiedSignups, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(partner.paidCustomers, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{conversionRate(partner).toLocaleString(locale, { style: 'percent', maximumFractionDigits: 1 })}</TableCell>
                    <TableCell>
                      <PartnerActions
                        partner={partner}
                        copy={copy}
                        locale={locale}
                        busy={isSubmitting && pending?.partner.partnerId === partner.partnerId}
                        onAction={(selected, action) => setPending({ partner: selected, action })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title={confirmation.title}
        description={confirmation.description}
        confirmLabel={isSubmitting ? copy.working : copy.confirm}
        cancelLabel={copy.cancel}
        destructive={pending?.action === 'close' || pending?.action === 'suspend'}
        confirmDisabled={isSubmitting}
        onConfirm={confirmStatusChange}
        onCancel={() => {
          if (!isSubmitting) setPending(null)
        }}
      />
    </div>
  )
}

function Metric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 tabular-nums ${mono ? 'font-mono text-xs' : 'text-foreground'}`}>{value}</dd>
    </div>
  )
}
