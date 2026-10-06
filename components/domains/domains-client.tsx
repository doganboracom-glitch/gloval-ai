'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft, ChevronRight, Globe, Loader2, Plus, ShoppingCart, Star, Trash2 } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import { DomainModal, DomainShell, DomainStatusBadge, fill } from '@/components/domains/domain-chrome'
import { BuyDomainDialog } from '@/components/domains/buy-domain-dialog'
import { TransferDomainDialog } from '@/components/domains/transfer-domain-dialog'
import { normalizeDomain, type NormalizeFailure } from '@/lib/custom-domains/normalize'
import {
  addMyDomain,
  getMyDomainsPage,
  removeMyDomain,
  setMyPrimaryDomain,
  type DomainsOverview,
} from '@/lib/custom-domains/actions'
import { pageCount, type DomainListErrorKind, type DomainPage } from '@/lib/custom-domains/pagination'
import type { CustomDomain, DomainErrorCode } from '@/lib/custom-domains/types'

/**
 * Customer domains screen.
 *
 * Three states, in the order the entitlement gate resolves them:
 *   1. plan does not include custom domains -> upgrade prompt to /billing
 *   2. entitled, nothing connected          -> empty state + connect CTA
 *   3. entitled, domains connected          -> list, primary selection, removal
 *
 * The plan check comes from the existing billing entitlement (`getDomainEntitlement`
 * over the real subscription rows), not a new plan system, and the server
 * re-checks it on every mutation.
 */
const IN_FLIGHT_ORDER_STATUSES = ['payment_verified', 'registration_pending', 'registration_reconciliation_required']
const POLL_INTERVAL_MS = 4000
const POLL_MAX_ATTEMPTS = 15

export function DomainsClient({
  overview,
  userEmail,
  paymentResult = null,
}: {
  overview: DomainsOverview
  userEmail: string
  paymentResult?: 'success' | 'failed' | 'error' | null
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const d = t.domains

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showBuy, setShowBuy] = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [removing, setRemoving] = useState<CustomDomain | null>(null)
  const [current, setCurrent] = useState<DomainPage>(overview.domainsPage)
  const [listError, setListError] = useState<{ kind: DomainListErrorKind; page: number } | null>(null)
  const [loadingPage, setLoadingPage] = useState(false)

  const { entitlement, live, canBuyDomain, recentOrders, projects } = overview

  // router.refresh() delivers a fresh overview but never resets useState, so the
  // list must be re-seeded from it or a just-registered domain stays invisible.
  useEffect(() => {
    setCurrent(overview.domainsPage)
  }, [overview.domainsPage])

  // After a payment redirect the registrar step can still be running. Re-read
  // the server state a few times until the order settles instead of leaving the
  // customer staring at a stale page.
  const inFlight = recentOrders.some((o) => IN_FLIGHT_ORDER_STATUSES.includes(o.status))
  const pollAttempts = useRef(0)
  useEffect(() => {
    if (!inFlight || pollAttempts.current >= POLL_MAX_ATTEMPTS) return
    const timer = setTimeout(() => {
      pollAttempts.current += 1
      router.refresh()
    }, POLL_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [inFlight, recentOrders, router])

  const latestOrder = recentOrders[0]
  const paymentBanner = ((): { tone: 'ok' | 'warn' | 'error'; text: string } | null => {
    if (paymentResult === 'failed') return { tone: 'error', text: d.payBannerFailed }
    if (paymentResult === 'error') return { tone: 'warn', text: d.payBannerError }
    if (paymentResult !== 'success') return null
    switch (latestOrder?.status) {
      case 'active':
        return { tone: 'ok', text: d.payBannerActive }
      case 'registration_failed':
        return { tone: 'error', text: d.payBannerRegFailed }
      case 'registration_reconciliation_required':
        return { tone: 'warn', text: d.payBannerReview }
      default:
        return { tone: 'warn', text: d.payBannerProcessing }
    }
  })()
  const domains = current.items
  const total = current.total
  const pages = pageCount(total, current.pageSize)
  // The plan only gates CONNECTING an existing domain; buying/transferring is a separate paid product.
  const connectBlocked = !entitlement.allowed || total >= entitlement.maxDomains

  /** Fetches one page; on failure keeps the rows already on screen and offers a retry. */
  async function loadPage(page: number) {
    setLoadingPage(true)
    const res = await getMyDomainsPage(page, current.pageSize).catch(
      () => ({ ok: false, kind: 'temporary' }) as const,
    )
    setLoadingPage(false)
    if (res.ok) {
      setCurrent(res.data)
      setListError(null)
    } else {
      setListError({ kind: res.kind, page })
    }
  }
  const atLimit = connectBlocked

  const errorText = (code: DomainErrorCode): string =>
    ({
      DOMAIN_EXISTS: d.errExists,
      INVALID_DOMAIN: d.errInvalidFormat,
      RESERVED_DOMAIN: d.errReserved,
      DOMAIN_LIMIT_REACHED: d.errLimit,
      NOT_ENTITLED: d.errNotEntitled,
      FORBIDDEN: d.errGeneric,
      UNAUTHENTICATED: d.errGeneric,
      NOT_FOUND: d.errGeneric,
      // Only ever returned by the website-binding action, not the add/remove/
      // verify flows this page drives, but included so the map stays
      // exhaustive over DomainErrorCode.
      DOMAIN_NOT_VERIFIED: d.errDomainNotVerified,
      PROJECT_NOT_PUBLISHED: d.errProjectNotPublished,
      PROJECT_REQUIRED: d.errProjectRequired,
      DOMAIN_BOUND_TO_OTHER_PROJECT: d.errBoundOtherProject,
      REGISTRAR_OWNED: d.errRegistrarOwned,
      NOT_REGISTRAR_MANAGED: d.errNotRegistrarManaged,
      REGISTRAR_UNAVAILABLE: d.errRegistrarUnavailable,
      INVALID_INPUT: d.errInvalidInput,
      PROVIDER_REFUSED: d.errProviderRefused,
      OUTCOME_UNKNOWN: d.errOutcomeUnknown,
      FEATURE_UNSUPPORTED: d.errFeatureUnsupported,
      PRICING_UNAVAILABLE: d.errPricingUnavailable,
      RENEWAL_IN_PROGRESS: d.errRenewalInProgress,
      DNS_VERIFICATION_UNAVAILABLE: d.errGeneric,
      TEMPORARY_FAILURE: d.errGeneric,
      VERCEL_DETACH_FAILED: d.errGeneric,
      SYNC_FAILED: d.errSyncFailed,
      USE_PROJECT_SYNC: d.errGeneric,
      UNEXPECTED_ERROR: d.errGeneric,
    })[code] ?? d.errGeneric

  function handleAdd(value: string, projectId: string) {
    setError(null)
    startTransition(async () => {
      const res = await addMyDomain(value, projectId)
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setShowAdd(false)
      // Land the customer on the DNS verification screen: a freshly added
      // domain is useless until its records are published.
      router.push(`/dashboard/domains/${res.data.id}`)
    })
  }

  function handleRemove(domain: CustomDomain) {
    setError(null)
    startTransition(async () => {
      const res = await removeMyDomain(domain.id)
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      setRemoving(null)
      await loadPage(current.page)
      router.refresh()
    })
  }

  function handleSetPrimary(domain: CustomDomain) {
    setError(null)
    startTransition(async () => {
      const res = await setMyPrimaryDomain(domain.id)
      if (!res.ok) {
        setError(errorText(res.error))
        return
      }
      await loadPage(current.page)
      router.refresh()
    })
  }

  const shellProps = {
    userEmail,
    backHref: '/dashboard',
    backLabel: t.mail.backToDashboard,
    title: d.title,
    subtitle: d.subtitle,
    icon: <Globe className="size-7 text-primary" />,
    error,
    onDismissError: () => setError(null),
    notice: live ? null : d.mockNotice,
  }

  /* ------------------------- state 2: nothing yet -------------------------- */
  if (total === 0) {
    return (
      <DomainShell {...shellProps}>
        <PaymentBanner banner={paymentBanner} />
        <section className="mt-8 rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Globe className="size-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold">{d.emptyTitle}</h2>
          <p className="mx-auto mt-2 max-w-lg text-pretty text-sm text-muted-foreground">
            {d.emptyBody}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="lg" onClick={() => setShowAdd(true)} disabled={connectBlocked} className="gap-2">
                <Plus className="size-4" />
                {d.connect}
              </Button>
              {canBuyDomain && (
                <Button size="lg" variant="outline" onClick={() => setShowBuy(true)} className="gap-2">
                  <ShoppingCart className="size-4" />
                  {d.buyCta}
                </Button>
              )}
              {canBuyDomain && (
                <Button size="lg" variant="outline" onClick={() => setShowTransfer(true)} className="gap-2">
                  <ArrowRightLeft className="size-4" />
                  {d.transferCta}
                </Button>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{d.emptyExample}</span>
            {!entitlement.allowed && (
              <Link href="/billing" className="text-xs text-primary underline-offset-4 hover:underline">
                {d.upgradeCta}
              </Link>
            )}
          </div>
        </section>

        {recentOrders.length > 0 && <RecentOrders orders={recentOrders} />}

        {showAdd && (
          <AddDomainDialog
            projects={projects}
            pending={isPending}
            onCancel={() => setShowAdd(false)}
            onSubmit={handleAdd}
          />
        )}
        {showBuy && <BuyDomainDialog onClose={() => setShowBuy(false)} />}
        {showTransfer && <TransferDomainDialog onClose={() => setShowTransfer(false)} />}
      </DomainShell>
    )
  }

  /* ----------------------- state 3: domain management ---------------------- */
  return (
    <DomainShell {...shellProps}>
      <PaymentBanner banner={paymentBanner} />
      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {fill(d.domainCount, { count: total, max: entitlement.maxDomains })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canBuyDomain && (
              <Button
                variant="outline"
                onClick={() => setShowBuy(true)}
                disabled={isPending}
                className="gap-2"
              >
                <ShoppingCart className="size-4" />
                {d.buyCta}
              </Button>
            )}
            {canBuyDomain && (
              <Button variant="outline" onClick={() => setShowTransfer(true)} disabled={isPending} className="gap-2">
                <ArrowRightLeft className="size-4" />
                {d.transferCta}
              </Button>
            )}
            <Button onClick={() => setShowAdd(true)} disabled={atLimit || isPending} className="gap-2">
              <Plus className="size-4" />
              {d.connect}
            </Button>
          </div>
        </div>
        {atLimit && entitlement.allowed && <p className="mt-2 text-xs text-muted-foreground">{d.limitReached}</p>}

        {listError && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <span>
              {listError.kind === 'rate_limited'
                ? d.pageRateLimited
                : listError.kind === 'unauthenticated'
                  ? d.pageSessionExpired
                  : d.pageLoadFailed}
            </span>
            {listError.kind !== 'unauthenticated' && (
              <Button size="sm" variant="outline" disabled={loadingPage} onClick={() => loadPage(listError.page)}>
                {d.pageRetry}
              </Button>
            )}
          </div>
        )}

        <ul className={`mt-4 flex flex-col gap-3 transition-opacity ${loadingPage ? 'opacity-60' : ''}`} aria-busy={loadingPage}>
          {domains.map((domain) => (
            <li
              key={domain.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card/70 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <Link
                href={`/dashboard/domains/${domain.id}`}
                className="group min-w-0 flex-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium transition-colors group-hover:text-primary">
                    {domain.domain}
                  </span>
                  {domain.isPrimary && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                      <Star className="size-3" />
                      {d.primary}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <DomainStatusBadge status={domain.status} />
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    {domain.source === 'registrar' ? d.mgSourceRegistrar : d.mgSourceExternal}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>

              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                {!domain.isPrimary && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetPrimary(domain)}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    <Star className="size-3.5" />
                    <span className="text-xs">{d.makePrimary}</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemoving(domain)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  <span className="sr-only">{d.remove}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <nav aria-label={d.pageNavLabel} className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingPage || current.page <= 1}
              onClick={() => loadPage(current.page - 1)}
            >
              {d.pagePrev}
            </Button>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {fill(d.pageOf, { page: current.page, pages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingPage || current.page >= pages}
              onClick={() => loadPage(current.page + 1)}
            >
              {d.pageNext}
            </Button>
          </nav>
        )}
      </section>

      {recentOrders.length > 0 && <RecentOrders orders={recentOrders} />}

      {showAdd && (
        <AddDomainDialog
          projects={projects}
          pending={isPending}
          onCancel={() => setShowAdd(false)}
          onSubmit={handleAdd}
        />
      )}
      {showBuy && <BuyDomainDialog onClose={() => setShowBuy(false)} />}
        {showTransfer && <TransferDomainDialog onClose={() => setShowTransfer(false)} />}

      {removing && (
        <DomainModal onClose={() => setRemoving(null)}>
          <h3 className="font-display text-lg font-semibold text-pretty">{d.removeConfirm}</h3>
          <p className="mt-2 text-sm text-pretty text-muted-foreground">
            {fill(d.removeBody, { domain: removing.domain })}
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={isPending}>
              {d.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleRemove(removing)}
              disabled={isPending}
              className="gap-2"
            >
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {d.removeCta}
            </Button>
          </div>
        </DomainModal>
      )}
    </DomainShell>
  )
}

function PaymentBanner({ banner }: { banner: { tone: 'ok' | 'warn' | 'error'; text: string } | null }) {
  if (!banner) return null
  const tone =
    banner.tone === 'ok'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
      : banner.tone === 'warn'
        ? 'border-accent/40 bg-accent/10 text-foreground'
        : 'border-destructive/40 bg-destructive/10 text-foreground'
  return (
    <div role="status" aria-live="polite" className={`mt-6 rounded-xl border px-4 py-3 text-sm ${tone}`}>
      {banner.text}
    </div>
  )
}

/* ------------------------------ recent orders ------------------------------ */

function RecentOrders({ orders }: { orders: DomainsOverview['recentOrders'] }) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'

  const statusText: Record<string, string> = {
    pending_payment: d.buyOrderPendingPayment,
    payment_verified: d.buyOrderPaymentVerified,
    registration_pending: d.buyOrderRegistrationPending,
    active: d.buyOrderActive,
    registration_reconciliation_required: d.buyOrderReconciliation,
    registration_failed: d.buyOrderRegistrationFailed,
    failed: d.buyOrderFailed,
    cancelled: d.buyOrderCancelled,
  }

  const statusTone: Record<string, string> = {
    active: 'text-emerald-500',
    registration_failed: 'text-destructive',
    failed: 'text-destructive',
    cancelled: 'text-muted-foreground',
  }

  function formatPrice(cents: number, currency: string): string {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
    } catch {
      return `${(cents / 100).toFixed(2)} ${currency}`
    }
  }

  return (
    <section className="mt-8">
      <h3 className="text-sm font-medium text-muted-foreground">{d.buyRecentTitle}</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card/50 px-4 py-2.5"
          >
            <span className="truncate font-mono text-sm">{order.domain}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {formatPrice(order.priceCents, order.currency)}
                {order.breakdown && (
                  <>
                    {' · '}
                    {formatPrice(order.breakdown.netCents, order.currency)} + {d.buyVat}{' '}
                    {formatPrice(order.breakdown.vatCents, order.currency)}
                  </>
                )}
              </span>
              <span className={`text-xs font-medium ${statusTone[order.status] ?? 'text-muted-foreground'}`}>
                {statusText[order.status] ?? order.status}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* -------------------------------- add form -------------------------------- */

function AddDomainDialog({
  projects,
  pending,
  onCancel,
  onSubmit,
}: {
  projects: DomainsOverview['projects']
  pending: boolean
  onCancel: () => void
  onSubmit: (value: string, projectId: string) => void
}) {
  const { t } = useLanguage()
  const d = t.domains
  const [value, setValue] = useState('')
  const [touched, setTouched] = useState(false)
  const publishedProjects = projects.filter((p) => p.published)
  // A single publishable project is preselected; with several the user must choose.
  const [projectId, setProjectId] = useState<string | null>(
    publishedProjects.length === 1 ? publishedProjects[0].id : null,
  )
  const [step, setStep] = useState<'project' | 'domain'>('project')
  const selectedProject = projects.find((p) => p.id === projectId) ?? null

  const failureText: Record<NormalizeFailure, string> = {
    empty: d.errEmpty,
    has_path: d.errHasPath,
    has_space: d.errHasSpace,
    non_ascii: d.errNonAscii,
    invalid_format: d.errInvalidFormat,
    reserved: d.errReserved,
  }

  // Same normalizer the server action re-runs, so the preview cannot disagree
  // with what actually gets stored.
  const result = useMemo(() => normalizeDomain(value), [value])

  /**
   * Verdicts that more typing cannot fix, so they are shown immediately rather
   * than waiting for blur/submit. Without this the submit button sits disabled
   * with no visible reason — the user cannot tell why `gloval.ai` is refused.
   * `invalid_format` and `empty` are excluded because they are the normal state
   * of a half-typed domain and would nag on every keystroke.
   */
  const isDefinitive =
    !result.ok && ['reserved', 'has_path', 'has_space', 'non_ascii'].includes(result.error)

  const showError = !result.ok && value.trim().length > 0 && (touched || isDefinitive)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (!result.ok || pending || !projectId) return
    onSubmit(result.domain, projectId)
  }

  if (step === 'project') {
    return (
      <DomainModal onClose={onCancel}>
        <p className="text-xs font-medium text-muted-foreground">{d.connectStepProject}</p>
        <h3 className="mt-1 font-display text-lg font-semibold">{d.connectProjectTitle}</h3>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{d.connectProjectHelp}</p>

        {publishedProjects.length === 0 ? (
          <p role="status" className="mt-5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-pretty">
            {d.connectNoPublished}
          </p>
        ) : (
          <fieldset className="mt-5">
            <legend className="sr-only">{d.connectProjectLabel}</legend>
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {projects.map((project) => (
                <li key={project.id}>
                  <label
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      project.published
                        ? 'cursor-pointer border-border hover:border-primary/60 has-[:checked]:border-primary'
                        : 'cursor-not-allowed border-border opacity-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="connect-project"
                      value={project.id}
                      checked={projectId === project.id}
                      disabled={!project.published}
                      onChange={() => setProjectId(project.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{project.name}</span>
                    {!project.published && (
                      <span className="shrink-0 text-xs text-muted-foreground">{d.connectDraftSuffix}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            {d.cancel}
          </Button>
          <Button type="button" onClick={() => setStep('domain')} disabled={!projectId}>
            {d.connectNext}
          </Button>
        </div>
      </DomainModal>
    )
  }

  return (
    <DomainModal onClose={onCancel}>
      <p className="text-xs font-medium text-muted-foreground">{d.connectStepDomain}</p>
      <h3 className="mt-1 font-display text-lg font-semibold">{d.addTitle}</h3>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">{d.addDescription}</p>
      {selectedProject && (
        <p className="mt-2 text-xs text-muted-foreground">
          {d.connectingTo} <span className="font-medium text-foreground">{selectedProject.name}</span>
        </p>
      )}

      <form onSubmit={submit} className="mt-5">
        <label htmlFor="domain-input" className="text-sm font-medium">
          {d.addLabel}
        </label>
        <input
          id="domain-input"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={d.addPlaceholder}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          inputMode="url"
          aria-invalid={showError || undefined}
          aria-describedby={showError ? 'domain-error' : 'domain-hint'}
          className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none transition-colors focus:border-primary"
        />

        {showError ? (
          <p id="domain-error" role="alert" className="mt-2 text-xs text-destructive">
            {failureText[result.error]}
          </p>
        ) : (
          <p id="domain-hint" className="mt-2 text-xs text-muted-foreground">
            {result.ok && result.changed ? (
              <>
                {d.normalizedAs} <span className="font-mono text-foreground">{result.domain}</span>
              </>
            ) : (
              d.emptyExample
            )}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => setStep('project')} disabled={pending}>
            {d.connectBack}
          </Button>
          <Button type="submit" disabled={pending || !result.ok || !projectId} className="gap-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            {d.addSubmit}
          </Button>
        </div>
      </form>
    </DomainModal>
  )
}
