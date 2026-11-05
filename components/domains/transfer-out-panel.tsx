'use client'

import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRightLeft, Check, Copy, Loader2, ShieldAlert } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DomainModal, fill } from '@/components/domains/domain-chrome'
import {
  getMyTransferOutStatus,
  revealMyAuthCode,
  type TransferErrorCode,
  type TransferOutStatus,
} from '@/lib/custom-domains/registrar/transfer-actions'
import {
  extendMyTransferWindow,
  relockMyTransferWindow,
  requestMyTransferOutCode,
} from '@/lib/custom-domains/registrar/transfer-window-actions'
import type { Dict } from '@/lib/i18n'

const CODE_VISIBLE_MS = 60_000

type TransferOutPanelActions = {
  getStatus: typeof getMyTransferOutStatus
  revealLegacyCode: typeof revealMyAuthCode
  requestWindowCode: typeof requestMyTransferOutCode
  extendWindow: typeof extendMyTransferWindow
  relockWindow: typeof relockMyTransferWindow
}

const DEFAULT_ACTIONS: TransferOutPanelActions = {
  getStatus: getMyTransferOutStatus,
  revealLegacyCode: revealMyAuthCode,
  requestWindowCode: requestMyTransferOutCode,
  extendWindow: extendMyTransferWindow,
  relockWindow: relockMyTransferWindow,
}

function outErrorText(code: TransferErrorCode, d: Dict['domains']): string {
  switch (code) {
    case 'RATE_LIMITED':
      return d.outErrRateLimited
    case 'RESTRICTED_60_DAYS':
    case 'NOT_TRANSFERABLE':
      return d.outErrNotTransferable
    case 'DOMAIN_LOCKED':
      return d.outWindow.statusLocked
    case 'UNSUPPORTED_TLD':
      return d.outUnsupported
    case 'WINDOW_UNAVAILABLE':
    case 'NOT_CONFIGURED':
      return d.outWindow.unavailable
    case 'WINDOW_NOT_OPEN':
      return d.outWindow.noWindow
    case 'WINDOW_EXPIRED':
      return d.outWindow.expired
    case 'WINDOW_LIMIT_REACHED':
      return d.outWindow.extensionLimit
    case 'CONFIRMATION_MISMATCH':
      return d.outWindow.confirmationMismatch
    case 'STATUS_UNVERIFIED':
      return d.outWindow.statusUnverified
    case 'START_DATE_CONFIRMATION_REQUIRED':
      return d.outWindow.startDateUnverifiedWarning
    default:
      return d.outErr
  }
}

function formatRemainingTime(milliseconds: number, copy: Dict['domains']['outWindow']): string {
  const safeMilliseconds = Math.max(0, milliseconds)
  const hours = Math.floor(safeMilliseconds / 3_600_000)
  const minutes = Math.ceil((safeMilliseconds % 3_600_000) / 60_000)
  return `${hours} ${copy.hour} ${minutes} ${copy.minute}`
}

function TransferWindowGuide({ domains }: { domains: Dict['domains'] }) {
  return (
    <details className="rounded-xl border border-border bg-background/40 px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-foreground">{domains.outWindow.guideTitle}</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{domains.outWindow.intro}</p>
        <ul className="flex list-disc flex-col gap-2 ps-5 text-sm leading-relaxed text-muted-foreground">
          {domains.outWindow.guideItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function TransferCodeCard({
  code,
  copied,
  copyLabel,
  copiedLabel,
  note,
  autoHide,
  onCopy,
}: {
  code: string
  copied: boolean
  copyLabel: string
  copiedLabel: string
  note: string
  autoHide: string
  onCopy: () => void
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <code className="min-w-0 break-all font-mono text-sm">{code}</code>
        <Button type="button" variant="ghost" size="sm" onClick={onCopy}>
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? copiedLabel : copyLabel}
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{note}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">{autoHide}</p>
    </div>
  )
}

function TransferWindowConfirmation({
  kind,
  domain,
  typedDomain,
  pending,
  domains,
  onTypedDomainChange,
  onClose,
  onConfirm,
}: {
  kind: 'open' | 'lock' | null
  domain: string
  typedDomain: string
  pending: boolean
  domains: Dict['domains']
  onTypedDomainChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const titleId = useId()
  const inputId = useId()
  if (!kind) return null

  const opening = kind === 'open'
  const title = opening ? domains.outWindow.confirmOpenTitle : domains.outWindow.confirmLockTitle

  return (
    <DomainModal onClose={onClose} ariaLabelledBy={titleId}>
      <h3 id={titleId} className="mb-3 text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {opening ? domains.outWindow.confirmOpenBody : domains.outWindow.confirmLockBody}
      </p>
      {!opening && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed text-foreground">
          <ShieldAlert data-icon="inline-start" className="mt-0.5 shrink-0 text-destructive" />
          {domains.outWindow.pendingWarning}
        </p>
      )}
      {opening && (
        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-medium text-foreground">
            {domains.outWindow.confirmOpenLabel}
          </label>
          <Input
            id={inputId}
            autoComplete="off"
            spellCheck={false}
            value={typedDomain}
            placeholder={domains.outWindow.confirmOpenPlaceholder}
            onChange={(event) => onTypedDomainChange(event.target.value)}
            aria-describedby={`${inputId}-expected`}
          />
          <p id={`${inputId}-expected`} className="font-mono text-xs text-muted-foreground">
            {domain}
          </p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {domains.outWindow.cancel}
        </Button>
        <Button
          type="button"
          disabled={pending || (opening && typedDomain !== domain)}
          onClick={onConfirm}
        >
          {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {opening ? domains.outWindow.confirmOpenContinue : domains.outWindow.confirmLockContinue}
        </Button>
      </div>
    </DomainModal>
  )
}

/** Transfer controls for a domain registered through us. */
export function TransferOutPanel({
  domain,
  actions = DEFAULT_ACTIONS,
}: {
  domain: string
  actions?: TransferOutPanelActions
}) {
  const { t, lang } = useLanguage()
  const d = t.domains
  const [code, setCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmKind, setConfirmKind] = useState<'open' | 'lock' | null>(null)
  const [typedDomain, setTypedDomain] = useState('')
  const [dateRiskAcknowledgement, setDateRiskAcknowledgement] = useState<{
    domain: string
    windowId: string | null
  } | null>(null)
  const [serverDateConfirmationDomain, setServerDateConfirmationDomain] = useState<string | null>(null)
  const dateRiskCheckboxId = useId()
  const [now, setNow] = useState(() => Date.now())
  const [isPending, startTransition] = useTransition()
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const statusKey = ['registrar-transfer-out', domain] as const
  const { data: status, error: statusError, isLoading, mutate } = useSWR(statusKey, () => actions.getStatus(domain))

  const clearCode = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = null
    setCode(null)
    setCopied(false)
  }, [])

  const relockAt = status?.ok && status.supported && status.activeWindow ? status.activeWindow.relockAt : null

  useEffect(() => {
    if (!relockAt) return
    const interval = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(interval)
  }, [relockAt])

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!status?.ok || !status.supported || !status.featureEnabled) return
    if (status.locked !== false || status.transferState !== 'held' || !status.activeWindow) clearCode()
  }, [status, clearCode])

  useEffect(() => {
    if (code && relockAt && Date.parse(relockAt) <= now) clearCode()
  }, [code, relockAt, now, clearCode])

  if (isLoading) return null
  if (!status && !statusError) return null
  if (status?.ok && !status.supported && status.reason === 'NOT_REGISTERED_HERE') return null

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setError(d.outErr)
    }
  }

  function startCodeRequest(confirmation?: string, confirmedStartDateRisk = false) {
    setError(null)
    startTransition(async () => {
      try {
        const result = status?.ok && status.supported && status.featureEnabled
          ? await actions.requestWindowCode(domain, confirmation, confirmedStartDateRisk)
          : await actions.revealLegacyCode(domain)
        if (!result.ok) {
          if (result.error === 'START_DATE_CONFIRMATION_REQUIRED') {
            setServerDateConfirmationDomain(domain)
            setDateRiskAcknowledgement(null)
            setTypedDomain(confirmation ?? '')
            setConfirmKind(null)
            setError(null)
            void mutate()
            return
          }
          if (result.error === 'STATUS_UNVERIFIED') setDateRiskAcknowledgement(null)
          setError(outErrorText(result.error, d))
          return
        }
        if (confirmedStartDateRisk && 'window' in result) {
          setDateRiskAcknowledgement({ domain, windowId: result.window.id })
          setServerDateConfirmationDomain(null)
        }
        setCode(result.authCode)
        setCopied(false)
        if (hideTimer.current) clearTimeout(hideTimer.current)
        hideTimer.current = setTimeout(clearCode, CODE_VISIBLE_MS)
        void mutate()
      } catch {
        setError(d.outErr)
      }
    })
  }

  function extendWindow() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await actions.extendWindow(domain)
        if (!result.ok) {
          setError(outErrorText(result.error, d))
          return
        }
        clearCode()
        await mutate()
      } catch {
        setError(d.outErr)
      }
    })
  }

  function lockNow() {
    setError(null)
    startTransition(async () => {
      try {
        const result = await actions.relockWindow(domain)
        if (!result.ok) {
          setError(outErrorText(result.error, d))
          return
        }
        setConfirmKind(null)
        clearCode()
        await mutate()
      } catch {
        setError(d.outErr)
      }
    })
  }

  async function copyCodeHandler() {
    await copyCode()
  }

  const showUnknownStatus = !status || !status.ok
  if (showUnknownStatus) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ArrowRightLeft className="size-4 text-primary" />
          {d.outTitle}
        </h2>
        <p role="status" className="mt-3 text-sm font-medium text-muted-foreground">
          {d.outWindow.statusUnverified}
        </p>
      </section>
    )
  }

  if (!status.supported) {
    return (
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <ArrowRightLeft className="size-4 text-primary" />
          {d.outTitle}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{d.outUnsupported}</p>
        {domain.toLowerCase().endsWith('.tr') && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{d.outWindow.trUnsupported}</p>
        )}
      </section>
    )
  }

  const statusCopy = d.outWindow
  const activeWindow = status.activeWindow
  const windowRemainingMs = activeWindow ? Date.parse(activeWindow.relockAt) - now : 0
  const windowExpired = activeWindow ? windowRemainingMs <= 0 : false
  const liveVerified = status.liveStatusReadable && status.locked !== null
  const startDateConfirmationRequired =
    status.startDateNeedsConfirmation ||
    (serverDateConfirmationDomain === domain &&
      status.liveStatusReadable &&
      status.activeAndUnexpired &&
      status.transferState === 'held')
  const activeWindowId = activeWindow?.id ?? null
  const startDateConfirmationChecked =
    dateRiskAcknowledgement?.domain === domain && dateRiskAcknowledgement.windowId === activeWindowId
  const eligibilityVerified =
    liveVerified &&
    status.activeAndUnexpired &&
    (status.restrictionVerified || (startDateConfirmationRequired && startDateConfirmationChecked))
  const canRequestWindow =
    status.featureEnabled &&
    status.windowAvailable &&
    eligibilityVerified &&
    !status.restrictedUntil &&
    status.transferState === 'held' &&
    status.locked === true &&
    !activeWindow
  const canShowWindowCode =
    status.featureEnabled &&
    status.windowAvailable &&
    eligibilityVerified &&
    !status.restrictedUntil &&
    status.transferState === 'held' &&
    status.locked === false &&
    Boolean(activeWindow) &&
    !windowExpired
  const canExtendWindow =
    canShowWindowCode &&
    Boolean(activeWindow) &&
    (activeWindow?.extensions ?? 0) < 2
  const canLockNow = liveVerified && status.locked === false
  const legacyBlocked = status.locked !== false || Boolean(status.restrictedUntil)

  let statusLabel = statusCopy.statusUnverified
  if (liveVerified) {
    if (status.transferState === 'pending_outgoing') statusLabel = statusCopy.statusPending
    else if (status.locked === true) statusLabel = statusCopy.statusLocked
    else if (status.locked === false && activeWindow) {
      statusLabel = fill(statusCopy.statusActive, {
        time: formatRemainingTime(windowRemainingMs, statusCopy),
      })
    } else if (status.locked === false) statusLabel = statusCopy.statusUnlocked
  }

  const restrictedDate = status.restrictedUntil
    ? new Date(status.restrictedUntil).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US')
    : null
  const legacyCodeVisible = Boolean(code) && !status.featureEnabled

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 font-display text-base font-semibold">
        <ArrowRightLeft className="size-4 text-primary" />
        {d.outTitle}
      </h2>

      {!status.featureEnabled ? (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{d.outBody}</p>
          <p role="status" className="text-sm font-medium">
            {status.locked === null ? statusCopy.statusUnverified : status.locked ? d.outLocked : d.outUnlocked}
          </p>
          {status.locked === true && (
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              {d.outLockSupport}{' '}
              <Link href="/support/new" className="font-medium text-brand underline underline-offset-4">
                {d.outSupportLink}
              </Link>
            </p>
          )}
          {restrictedDate && <p className="text-sm text-muted-foreground">{fill(d.outRestricted, { date: restrictedDate })}</p>}
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{d.outFeeNote}</p>
          <Button type="button" size="sm" disabled={isPending || legacyBlocked || Boolean(code)} onClick={() => startCodeRequest()}>
            {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
            {d.outShowCode}
          </Button>
          {legacyCodeVisible && (
            <TransferCodeCard
              code={code ?? ''}
              copied={copied}
              copyLabel={d.outCopy}
              copiedLabel={d.outCopied}
              note={d.outCodeNote}
              autoHide={d.outCodeAutoHide}
              onCopy={copyCodeHandler}
            />
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted-foreground">{statusCopy.intro}</p>
          <p role="status" aria-live="polite" className="text-sm font-medium text-foreground">
            {statusLabel}
          </p>
          {!status.liveStatusReadable && <p className="text-sm text-muted-foreground">{statusCopy.statusUnverified}</p>}
          {!status.windowAvailable && (
            <p role="status" className="rounded-lg border border-border bg-background/50 p-3 text-sm text-muted-foreground">
              {statusCopy.unavailable}
            </p>
          )}
          {!status.restrictionVerified && status.liveStatusReadable && !startDateConfirmationRequired && (
            <p className="text-sm text-muted-foreground">{statusCopy.restrictionUnknown}</p>
          )}
          {startDateConfirmationRequired && (
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p role="alert" className="flex items-start gap-2 text-sm leading-relaxed text-foreground">
                <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>{statusCopy.startDateUnverifiedWarning}</span>
              </p>
              <label htmlFor={dateRiskCheckboxId} className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-foreground">
                <input
                  id={dateRiskCheckboxId}
                  type="checkbox"
                  className="mt-1 size-4 shrink-0 accent-primary"
                  checked={startDateConfirmationChecked}
                  disabled={isPending}
                  onChange={(event) =>
                    setDateRiskAcknowledgement(
                      event.currentTarget.checked ? { domain, windowId: activeWindowId } : null,
                    )
                  }
                />
                <span>{statusCopy.startDateConfirmationLabel}</span>
              </label>
            </div>
          )}
          {restrictedDate && <p className="text-sm text-muted-foreground">{fill(d.outRestricted, { date: restrictedDate })}</p>}

          {status.transferState === 'pending_outgoing' && activeWindow && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fill(statusCopy.statusActive, { time: formatRemainingTime(windowRemainingMs, statusCopy) })}
            </p>
          )}
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">{d.outFeeNote}</p>
          {status.windowAvailable && !status.liveStatusReadable && (
            <p className="text-sm text-muted-foreground">{statusCopy.statusUnverified}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {status.locked === true && (
              <Button
                type="button"
                size="sm"
                disabled={isPending || !canRequestWindow}
                onClick={() => {
                  setError(null)
                  setTypedDomain((current) => (current === domain ? current : ''))
                  setConfirmKind('open')
                }}
              >
                {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                {statusCopy.requestCode}
              </Button>
            )}
            {activeWindow && status.locked === false && (
              <>
                <Button
                  type="button"
                  size="sm"
                  disabled={isPending || !canShowWindowCode || Boolean(code)}
                  onClick={() => startCodeRequest(undefined, startDateConfirmationRequired && startDateConfirmationChecked)}
                >
                  {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {statusCopy.showCode}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={isPending || !canExtendWindow} onClick={extendWindow}>
                  {statusCopy.extend}
                </Button>
              </>
            )}
            {canLockNow && activeWindow && (
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => setConfirmKind('lock')}>
                {statusCopy.relock}
              </Button>
            )}
            {status.locked === false && !activeWindow && (
              <Button type="button" size="sm" variant="outline" disabled={isPending || !canLockNow} onClick={() => setConfirmKind('lock')}>
                {statusCopy.lockNow}
              </Button>
            )}
          </div>
          {code && status.featureEnabled && (
            <TransferCodeCard
              code={code}
              copied={copied}
              copyLabel={d.outCopy}
              copiedLabel={d.outCopied}
              note={d.outCodeNote}
              autoHide={d.outCodeAutoHide}
              onCopy={copyCodeHandler}
            />
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <TransferWindowGuide domains={d} />
        </div>
      )}
      <TransferWindowConfirmation
        kind={confirmKind}
        domain={domain}
        typedDomain={typedDomain}
        pending={isPending}
        domains={d}
        onTypedDomainChange={setTypedDomain}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => {
          if (confirmKind === 'open') {
            startCodeRequest(typedDomain, startDateConfirmationRequired && startDateConfirmationChecked)
            setConfirmKind(null)
            setTypedDomain('')
          } else if (confirmKind === 'lock') {
            lockNow()
          }
        }}
      />
    </section>
  )
}
