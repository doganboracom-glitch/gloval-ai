'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { useLanguage } from '@/components/language-provider'

type GoogleAdsConnection = {
  id: string
  externalAccountId: string
  name: string | null
  loginCustomerId: string | null
  currency: string | null
  isManager: boolean
  status: string
}

type GoogleAdsAccountCandidate = {
  externalAccountId: string
  name: string | null
  loginCustomerId: string | null
  currency: string | null
  isManager?: boolean
}

type DashboardResponse = { connections: GoogleAdsConnection[] }
type SelectionResponse = { accounts: GoogleAdsAccountCandidate[] }

type Props = {
  connectLabel: string
  flowId?: string
  status?: string
}

const DASHBOARD_KEY = '/api/ads/google/dashboard'

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error('request_failed')
  return response.json() as Promise<T>
}

export function GoogleAdsConnectionPanel({ connectLabel, flowId, status }: Props) {
  const { lang } = useLanguage()
  const router = useRouter()
  const [working, setWorking] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const text = lang === 'tr'
    ? {
        manager: 'Yönetici hesabı',
        select: 'Bu hesabı bağla',
        disconnect: 'Bağlantıyı kaldır',
        empty: 'Henüz bağlı Google Ads hesabı yok.',
        loading: 'Google Ads hesapları yükleniyor…',
        selecting: 'Bağlanıyor…',
        disconnecting: 'Kaldırılıyor…',
        connected: 'Google Ads hesabı bağlandı.',
        cancelled: 'Google hesap bağlantısı iptal edildi.',
        failed: 'Bağlantı tamamlanamadı. Lütfen tekrar deneyin.',
        noAccounts: 'Bu Google hesabında erişilebilir Ads hesabı bulunamadı.',
        revokePending: 'Google erişiminin temizlenmesi sıraya alındı; kısa süre sonra tekrar deneyin.',
        quota: 'Google Ads istek sınırına ulaşıldı. Daha sonra tekrar deneyin.',
        chooseAccount: 'Bağlanacak Google Ads hesabını seçin.',
        genericError: 'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
        statusActive: 'Bağlı',
        statusError: 'Yeniden bağlanma gerekli',
        dashboardUnavailable: 'Hesaplar şu anda yüklenemiyor.',
      }
    : {
        manager: 'Manager account',
        select: 'Connect this account',
        disconnect: 'Disconnect',
        empty: 'No Google Ads accounts are connected yet.',
        loading: 'Loading Google Ads accounts…',
        selecting: 'Connecting…',
        disconnecting: 'Disconnecting…',
        connected: 'Google Ads account connected.',
        cancelled: 'Google account connection was cancelled.',
        failed: 'Connection could not be completed. Please try again.',
        noAccounts: 'This Google account has no accessible Ads accounts.',
        revokePending: 'Google access cleanup is queued. Please try again shortly.',
        quota: 'The Google Ads request limit was reached. Try again later.',
        chooseAccount: 'Choose the Google Ads account to connect.',
        genericError: 'The request could not be completed. Please try again.',
        statusActive: 'Connected',
        statusError: 'Reconnect required',
        dashboardUnavailable: 'Accounts are unavailable right now.',
      }

  const { data, error, isLoading, mutate } = useSWR<DashboardResponse>(DASHBOARD_KEY, fetcher)
  const selectionKey = flowId
    ? `/api/ads/google/select?flow_id=${encodeURIComponent(flowId)}`
    : null
  const { data: selection, error: selectionError, isLoading: selectionLoading } = useSWR<SelectionResponse>(selectionKey, fetcher)

  const resultNotice = status === 'connected'
    ? text.connected
    : status === 'cancelled'
      ? text.cancelled
      : status === 'no_accounts'
        ? text.noAccounts
        : status === 'revoke_pending'
          ? text.revokePending
          : status === 'quota'
            ? text.quota
            : status === 'failed'
              ? text.failed
              : null

  async function selectAccount(externalAccountId: string) {
    if (!flowId) return
    setWorking(`select:${externalAccountId}`)
    setActionError(null)
    setActionNotice(null)
    try {
      const response = await fetch('/api/ads/google/select', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ flowId, externalAccountId }),
      })
      if (!response.ok) throw new Error('selection_failed')
      await mutate()
      router.replace('/ads/dashboard?googleAds=connected')
    } catch {
      setActionError(text.genericError)
    } finally {
      setWorking(null)
    }
  }

  async function disconnect(connectionId: string) {
    setWorking(`disconnect:${connectionId}`)
    setActionError(null)
    setActionNotice(null)
    try {
      const response = await fetch(`/api/ads/google/disconnect?connection_id=${encodeURIComponent(connectionId)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error('disconnect_failed')
      await mutate()
      setActionNotice(lang === 'tr' ? 'Google Ads bağlantısı kaldırıldı.' : 'Google Ads connection removed.')
    } catch {
      setActionError(text.genericError)
    } finally {
      setWorking(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <a
        href="/api/ads/google/connect"
        className="inline-flex h-10 w-fit items-center rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        {connectLabel}
      </a>

      {resultNotice ? <p role="status" className="text-sm text-muted-foreground">{resultNotice}</p> : null}
      {actionNotice ? <p role="status" className="text-sm text-muted-foreground">{actionNotice}</p> : null}
      {actionError || error || selectionError ? (
        <p role="alert" className="text-sm text-destructive">{actionError ?? text.genericError}</p>
      ) : null}

      {flowId ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
          <p className="text-sm font-medium">{text.chooseAccount}</p>
          {selectionLoading ? <p className="text-sm text-muted-foreground">{text.loading}</p> : null}
          {selection?.accounts.map((account) => {
            const isWorking = working === `select:${account.externalAccountId}`
            return (
              <div key={account.externalAccountId} className="flex flex-col justify-between gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name || account.externalAccountId}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {account.externalAccountId}
                    {account.currency ? ` · ${account.currency}` : ''}
                    {account.isManager ? ` · ${text.manager}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={working !== null}
                  onClick={() => void selectAccount(account.externalAccountId)}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorking ? text.selecting : text.select}
                </button>
              </div>
            )
          })}
          {!selectionLoading && selection && selection.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{text.noAccounts}</p>
          ) : null}
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">{text.loading}</p> : null}
      {error ? <p className="text-sm text-muted-foreground">{text.dashboardUnavailable}</p> : null}
      {!isLoading && !error && data?.connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">{text.empty}</p>
      ) : null}

      {data?.connections.map((connection) => {
        const isWorking = working === `disconnect:${connection.id}`
        return (
          <div key={connection.id} className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{connection.name || connection.externalAccountId}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {connection.externalAccountId}
                {connection.currency ? ` · ${connection.currency}` : ''}
                {connection.isManager ? ` · ${text.manager}` : ''}
                {connection.status === 'active' ? ` · ${text.statusActive}` : ` · ${text.statusError}`}
              </p>
            </div>
            <button
              type="button"
              disabled={working !== null}
              onClick={() => void disconnect(connection.id)}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isWorking ? text.disconnecting : text.disconnect}
            </button>
          </div>
        )
      })}
    </div>
  )
}
