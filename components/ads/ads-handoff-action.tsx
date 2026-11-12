'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useLanguage } from '@/components/language-provider'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

export const HANDOFF_ACCESS_PATH = '/api/ads/google/handoff-access'
export const HANDOFF_CREATE_PATH = '/api/ads/google/plans/from-scan'
export const ADS_WORKSPACE_PATH = '/ads/dashboard'

export const GOOGLE_CONNECT_PATH = '/api/ads/google/connect'
const LOGIN_PATH = '/auth/login'

export type HandoffAccessState = 'signed_out' | 'needs_connect' | 'ready' | 'unavailable' | 'error'
type HandoffAccess = { state: HandoffAccessState; connectionId?: string }

async function fetchAccess(url: string): Promise<HandoffAccess> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) return { state: 'error' }
  const body = (await response.json().catch(() => null)) as
    | { state?: string; eligible?: boolean; connectionId?: string }
    | null
  if (body?.state === 'ready' && body.eligible === true && typeof body.connectionId === 'string') {
    return { state: 'ready', connectionId: body.connectionId }
  }
  if (body?.state === 'signed_out' || body?.state === 'needs_connect' || body?.state === 'unavailable') {
    return { state: body.state }
  }
  return { state: 'error' }
}

/** Where the user lands after signing in: the workspace, with this scan's address prefilled. */
export function buildHandoffLoginHref(host: string): string {
  const next = `${ADS_WORKSPACE_PATH}?url=${encodeURIComponent(host)}`
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
}

const ACTION_CLASS =
  'inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60'

function handoffErrorText(code: string, isTr: boolean): string {
  const tr: Record<string, string> = {
    ad_copy_insufficient: 'Plandaki reklam metni Google Ads kurallarını karşılamıyor. Çalışma alanında yeniden oluşturun.',
    connection_not_found: 'Bağlı Google Ads hesabı bulunamadı. Hesabı kontrol edin.',
  }
  const en: Record<string, string> = {
    ad_copy_insufficient: 'The ad copy in this plan does not meet Google Ads rules. Regenerate it in the workspace.',
    connection_not_found: 'The connected Google Ads account was not found. Check the account.',
  }
  return (isTr ? tr : en)[code] ?? (isTr ? 'Plan çalışma alanına aktarılamadı. Lütfen tekrar deneyin.' : 'The plan could not be transferred. Please try again.')
}

/**
 * Bottom action of the public preview. The server reports the caller's state:
 * signed out goes to login, signed in without a Google account starts the
 * Google connect flow, and a ready account transfers the plan already shown.
 */
export function AdsHandoffAction({ result }: { result: PublicScanResult }) {
  const { t, lang } = useLanguage()
  const copy = t.ads
  const isTr = lang === 'tr'
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const { data } = useSWR<HandoffAccess>(HANDOFF_ACCESS_PATH, fetchAccess, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  async function transfer(connectionId: string) {
    if (pending) return
    setPending(true)
    setErrorCode(null)
    try {
      const response = await fetch(HANDOFF_CREATE_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId, result }),
      })
      const body = (await response.json().catch(() => null)) as { planId?: string; error?: string } | null
      if (!response.ok || !body?.planId) {
        setErrorCode(body?.error ?? 'provider_error')
        return
      }
      router.push(`${ADS_WORKSPACE_PATH}?plan=${encodeURIComponent(body.planId)}`)
    } catch {
      setErrorCode('provider_error')
    } finally {
      setPending(false)
    }
  }

  if (data?.state === 'signed_out') {
    return (
      <Link href={buildHandoffLoginHref(result.host)} className={ACTION_CLASS}>
        {copy.actionLogin}
      </Link>
    )
  }

  if (data?.state === 'needs_connect') {
    return (
      <form method="post" action={GOOGLE_CONNECT_PATH}>
        <button type="submit" className={ACTION_CLASS}>
          {copy.publishAction}
        </button>
      </form>
    )
  }

  if (data?.state === 'ready' && data.connectionId) {
    const connectionId = data.connectionId
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void transfer(connectionId)}
          disabled={pending}
          className={ACTION_CLASS}
        >
          {pending
            ? isTr ? 'Taslak hazırlanıyor…' : 'Preparing draft…'
            : isTr ? 'Bu planı Google Ads’e hazırla' : 'Prepare this plan for Google Ads'}
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isTr
            ? 'Plan yeniden taranmadan çalışma alanına taslak olarak aktarılır. Google Ads’te değişiklik yapılmaz.'
            : 'The plan is moved to the workspace as a draft without scanning again. Nothing changes in Google Ads.'}
        </p>
        {errorCode ? <p role="alert" className="text-sm text-destructive">{handoffErrorText(errorCode, isTr)}</p> : null}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled
        aria-busy={!data}
        className="inline-flex h-10 cursor-not-allowed items-center rounded-xl bg-secondary px-4 text-sm font-medium text-muted-foreground"
      >
        {copy.publishAction}
      </button>
      {data?.state === 'unavailable' ? (
        <p className="text-xs leading-relaxed text-muted-foreground">{copy.publishUnavailable}</p>
      ) : null}
    </div>
  )
}
