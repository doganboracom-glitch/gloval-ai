import Link from 'next/link'
import type { ReactNode } from 'react'
import { daysRemaining, formatIstanbulDate } from '@/lib/whois/format'
import type { Dict } from '@/lib/i18n'
import type { StatusCode } from '@/lib/whois/sanitize'
import type { WhoisOutcome } from '@/lib/whois/service'

const BADGE = {
  registered: 'bg-destructive/10 text-destructive',
  available: 'bg-emerald-500/10 text-emerald-500',
  unavailable: 'bg-muted text-muted-foreground',
} as const

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm">{children}</dd>
    </div>
  )
}

export function WhoisResult({
  outcome,
  copy,
  locale,
  now,
}: {
  outcome: WhoisOutcome
  copy: Dict['whois']
  locale: string
  now: Date
}) {
  const buyHref = `/alan-adi-sorgula?q=${encodeURIComponent(outcome.buyQuery)}`
  const label =
    outcome.status === 'registered'
      ? copy.statusRegistered
      : outcome.status === 'available'
        ? copy.statusAvailable
        : copy.statusUnavailable

  const note =
    outcome.status === 'registered'
      ? outcome.buyable
        ? copy.registeredBuyNote
        : copy.registeredNote
      : outcome.status === 'available'
        ? copy.availableNote
        : outcome.reason === 'NO_RDAP'
          ? outcome.buyable
            ? copy.noRdapBuyNote
            : copy.noRdapNote
          : copy.lookupFailedNote

  const showBuy = outcome.status === 'available' || (outcome.status === 'registered' && outcome.buyable) || outcome.status === 'unavailable'

  return (
    <section aria-live="polite" className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-all font-display text-xl font-semibold">{outcome.domain}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${BADGE[outcome.status]}`}>{label}</span>
      </div>
      <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">{note}</p>

      {outcome.status === 'registered' && (
        <dl className="mt-5">
          <Row label={copy.registrar}>{outcome.record.registrar ?? copy.noData}</Row>
          <Row label={copy.createdAt}>
            {outcome.record.registeredAt ? formatIstanbulDate(outcome.record.registeredAt, locale) : copy.noData}
          </Row>
          <Row label={copy.updatedAt}>
            {outcome.record.updatedAt ? formatIstanbulDate(outcome.record.updatedAt, locale) : copy.noData}
          </Row>
          <Row label={copy.expiresAt}>
            {outcome.record.expiresAt ? (
              <>
                {formatIstanbulDate(outcome.record.expiresAt, locale)}
                <ExpiryHint iso={outcome.record.expiresAt} now={now} copy={copy} />
              </>
            ) : (
              copy.noData
            )}
          </Row>
          <Row label={copy.statuses}>
            {outcome.record.statuses.length === 0 ? (
              copy.noData
            ) : (
              <ul className="flex flex-col gap-1.5">
                {outcome.record.statuses.map((code) => (
                  <li key={code}>
                    <span className="font-mono text-xs">{code}</span>
                    <span className="text-muted-foreground">{' - '}{copy.statusCodes[code as StatusCode]}</span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
          <Row label={copy.nameservers}>
            {outcome.record.nameservers.length === 0 ? (
              copy.noData
            ) : (
              <ul className="flex flex-col gap-1 font-mono text-xs">
                {outcome.record.nameservers.map((ns) => (
                  <li key={ns}>{ns}</li>
                ))}
              </ul>
            )}
          </Row>
          <Row label={copy.dnssec}>
            {outcome.record.dnssec === 'signed'
              ? copy.dnssecSigned
              : outcome.record.dnssec === 'unsigned'
                ? copy.dnssecUnsigned
                : copy.dnssecUnknown}
          </Row>
        </dl>
      )}

      {outcome.status === 'registered' && (
        <p className="mt-3 text-xs text-muted-foreground">{copy.timeZoneNote}</p>
      )}

      {showBuy && (
        <Link
          href={buyHref}
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          {outcome.status === 'registered' ? copy.seeAlternatives : copy.buyCta}
        </Link>
      )}
    </section>
  )
}

function ExpiryHint({ iso, now, copy }: { iso: string; now: Date; copy: Dict['whois'] }) {
  const days = daysRemaining(iso, now)
  if (days === null) return null
  const text = days < 0 ? copy.expired : copy.daysLeft.replace('{n}', String(days))
  return <span className={days < 0 ? 'ml-2 text-destructive' : 'ml-2 text-muted-foreground'}>({text})</span>
}
