'use client'

import { CheckCircle2, CircleDashed, Loader2, TriangleAlert } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { CustomDomain } from '@/lib/custom-domains/types'
import type { Dict } from '@/lib/i18n'

type Tone = 'ok' | 'wait' | 'bad'

type Copy = Dict['domains']['connection']

/** Maps the stored machine code to a sentence; unknown codes are shown as-is rather than hidden. */
function describeError(code: string, c: Copy): string {
  if (code.startsWith('inconclusive:')) return c.errInconclusive
  if (code === 'vercel:challenge_missing') return c.errChallengeMissing
  if (code === 'vercel:domain_already_in_use') return c.errInUse
  if (code === 'vercel:forbidden' || code === 'vercel:unauthorized') return c.errAuth
  if (code.startsWith('www:')) return c.errWww
  return code
}

function Row({ label, text, tone }: { label: string; text: string; tone: Tone }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'bad' ? TriangleAlert : CircleDashed
  const color = tone === 'ok' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground'
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium ${color}`}>
        <Icon className="size-4" />
        {text}
      </span>
    </li>
  )
}

export function ConnectionStatus({ domain, live, checking }: { domain: CustomDomain; live: boolean; checking: boolean }) {
  const { t } = useLanguage()
  const c = t.domains.connection
  const { connection: k } = domain
  const hostingMissing = !k.legacy && k.vercel === 'not_configured'
  const unconfirmed = live && !k.legacy && k.lastError?.startsWith('inconclusive:') === true

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-semibold">{c.title}</h2>
        {checking && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">
        {unconfirmed ? c.liveUnconfirmed : live ? c.live : hostingMissing ? c.notConfigured : c.notLive}
      </p>
      <ul className="mt-3 divide-y divide-border">
        <Row label={c.ownership} text={c.ownershipOk} tone="ok" />
        <Row
          label={c.dns}
          text={k.dns === 'configured' ? c.dnsConfigured : k.dns === 'misconfigured' ? c.dnsBad : c.dnsPending}
          tone={k.dns === 'configured' ? 'ok' : k.dns === 'misconfigured' ? 'bad' : 'wait'}
        />
        <Row
          label={c.host}
          text={
            k.vercel === 'connected'
              ? c.hostConnected
              : k.vercel === 'needs_verification'
                ? c.hostNeedsVerification
                : k.vercel === 'error'
                  ? c.hostError
                  : k.vercel === 'pending'
                    ? c.hostPending
                    : c.hostNone
          }
          tone={k.vercel === 'connected' ? 'ok' : k.vercel === 'error' ? 'bad' : 'wait'}
        />
        <Row
          label={c.ssl}
          text={k.ssl === 'ready' ? c.sslReady : k.ssl === 'error' ? c.sslError : c.sslPending}
          tone={k.ssl === 'ready' ? 'ok' : k.ssl === 'error' ? 'bad' : 'wait'}
        />
      </ul>
      {k.lastCheckedAt && (
        <p className="mt-3 text-xs text-muted-foreground">
          {c.lastChecked}: {new Date(k.lastCheckedAt).toLocaleString()}
        </p>
      )}
      {k.lastError && (
        <p className="mt-1 text-pretty text-xs text-destructive" title={k.lastError}>
          {describeError(k.lastError, c)}
        </p>
      )}
    </div>
  )
}
