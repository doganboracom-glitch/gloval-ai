'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useLanguage } from '@/components/language-provider'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'

export const HANDOFF_ACCESS_PATH = '/api/ads/google/handoff-access'
export const HANDOFF_CREATE_PATH = '/api/ads/google/plans/from-scan'
export const ADS_WORKSPACE_PATH = '/ads/dashboard'

type HandoffAccess = { eligible: boolean; connectionId?: string }

async function fetchAccess(url: string): Promise<HandoffAccess> {
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' })
  if (!response.ok) return { eligible: false }
  const body = (await response.json().catch(() => null)) as HandoffAccess | null
  return body?.eligible === true && typeof body.connectionId === 'string'
    ? { eligible: true, connectionId: body.connectionId }
    : { eligible: false }
}

function handoffErrorText(code: string, isTr: boolean): string {
  const tr: Record<string, string> = {
    budget_sanity_ceiling_exceeded: 'Bu tutar teknik güvenlik tavanını aşıyor; destekle iletişime geçin.',
    ad_copy_insufficient: 'Plandaki reklam metni Google Ads kurallarını karşılamıyor. Çalışma alanında yeniden oluşturun.',
    connection_not_found: 'Bağlı Google Ads hesabı bulunamadı. Hesabı kontrol edin.',
  }
  const en: Record<string, string> = {
    budget_sanity_ceiling_exceeded: 'This amount exceeds the technical safety ceiling. Contact support.',
    ad_copy_insufficient: 'The ad copy in this plan does not meet Google Ads rules. Regenerate it in the workspace.',
    connection_not_found: 'The connected Google Ads account was not found. Check the account.',
  }
  return (isTr ? tr : en)[code] ?? (isTr ? 'Plan çalışma alanına aktarılamadı. Lütfen tekrar deneyin.' : 'The plan could not be transferred. Please try again.')
}

/**
 * Bottom action of the public preview. Entitled users get a one-click transfer
 * of the plan they already see; everyone else keeps the disabled "soon" button.
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

  if (data?.eligible && data.connectionId) {
    const connectionId = data.connectionId
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void transfer(connectionId)}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
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
    <button
      type="button"
      disabled
      className="inline-flex h-10 cursor-not-allowed items-center rounded-xl bg-secondary px-4 text-sm font-medium text-muted-foreground"
    >
      {copy.publishSoon}
      <span className="ms-2 rounded-full bg-background px-2 py-0.5 text-xs">{copy.comingSoon}</span>
    </button>
  )
}
