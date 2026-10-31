'use client'

import Link from 'next/link'
import { useLanguage } from '@/components/language-provider'
import { AdsNewScanButton } from '@/components/ads/sections/ads-new-scan-button'
import type { ClientScanError } from '@/lib/ads/scan-client'
import { describeScanError } from '@/lib/ads/scan-messages'

const LOGIN_PATH = '/auth/login'
const BILLING_PATH = '/billing'

const ACTION_CLASS =
  'inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

export function AdsScanError({ error, onAction }: { error: ClientScanError; onAction: () => void }) {
  const { t } = useLanguage()
  const copy = t.ads
  const view = describeScanError(error, copy)

  return (
    <div role="alert" className="flex w-full flex-col gap-3 rounded-2xl border border-destructive/50 bg-card p-5 text-start">
      <p className="text-sm leading-relaxed text-foreground">{view.message}</p>
      {view.action === 'login' ? (
        <Link href={LOGIN_PATH} className={ACTION_CLASS}>
          {copy.actionLogin}
        </Link>
      ) : null}
      {view.action === 'credits' ? (
        <Link href={BILLING_PATH} className={ACTION_CLASS}>
          {copy.actionBuyCredits}
        </Link>
      ) : null}
      {view.action === 'retry' ? (
        <button type="button" onClick={onAction} className={ACTION_CLASS}>
          {copy.actionRetry}
        </button>
      ) : null}
      {view.action === 'newScan' ? <AdsNewScanButton onClick={onAction}>{copy.actionNewScan}</AdsNewScanButton> : null}
    </div>
  )
}
