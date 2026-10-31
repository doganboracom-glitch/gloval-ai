'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AlertCircle, BarChart3, RefreshCw, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ADS_DASHBOARD_PATH } from '@/lib/ads/feature-flag'
import type {
  AdsAccountSummary,
  AdsPerformanceSummary,
  GoogleAdsDateRange,
} from '@/lib/ads/providers/types'

export type GoogleAdsConnectionView = {
  id: string
  externalAccountId: string
  name: string | null
  currency: string | null
  isManager: boolean
  loginCustomerId: string | null
  status: 'pending' | 'active' | 'revoked' | 'error'
  lastError: string | null
  createdAt: string
}

type AccountListPayload = { accounts: AdsAccountSummary[] }
type ReportPayload = { report: AdsPerformanceSummary }
type ApiErrorBody = { error?: unknown }

class DashboardApiError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && typeof (payload as ApiErrorBody).error === 'string'
      ? String((payload as ApiErrorBody).error)
      : 'provider_error'
    throw new DashboardApiError(code)
  }
  return payload as T
}

function errorMessage(code: string | undefined, copy: ReturnType<typeof useLanguage>['t']['ads']) {
  switch (code) {
    case 'api_quota_exceeded':
    case 'rate_limited':
      return code === 'api_quota_exceeded' ? copy.quotaError : copy.rateLimitError
    case 'reauth_required':
    case 'not_authorized':
      return copy.reauthError
    case 'connection_busy':
      return copy.connectionBusy
    case 'flow_expired':
      return copy.flowExpired
    case 'configuration_missing':
    case 'redirect_uri_invalid':
      return copy.configurationError
    case 'scope_missing':
    case 'refresh_token_missing':
      return copy.scopeError
    case 'no_accounts':
      return copy.accountListEmpty
    case 'account_list_failed':
      return copy.accountListError
    case 'oauth_denied':
      return copy.oauthCancelled
    case 'account_not_found':
      return copy.selectionError
    default:
      return copy.genericGoogleError
  }
}

function formatNumber(value: number, locale: string, maximumFractionDigits = 0) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits }).format(value)
}

function formatSpend(valueMicros: number, currency: string | null, locale: string) {
  const amount = valueMicros / 1_000_000
  if (currency) {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount)
  }
  return formatNumber(amount, locale, 2)
}

function GoogleAccountChooser({ flowId }: { flowId: string | null }) {
  const router = useRouter()
  const { t } = useLanguage()
  const copy = t.ads
  const [accountId, setAccountId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectionError, setSelectionError] = useState<string | null>(null)
  const key = flowId ? `/api/ads/google/select?flowId=${encodeURIComponent(flowId)}` : null
  const { data, error, isLoading } = useSWR<AccountListPayload, DashboardApiError>(key, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  const accounts = data?.accounts ?? []
  const selected = accounts.find((account) => account.externalAccountId === accountId) ?? null

  async function connectSelectedAccount() {
    if (!flowId || !selected || selected.isManager || isSubmitting) return
    setSelectionError(null)
    setIsSubmitting(true)
    try {
      const response = await fetch('/api/ads/google/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId, accountId: selected.externalAccountId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const code = payload && typeof payload === 'object' && typeof (payload as ApiErrorBody).error === 'string'
          ? String((payload as ApiErrorBody).error)
          : 'provider_error'
        throw new DashboardApiError(code)
      }
      router.replace(ADS_DASHBOARD_PATH)
      router.refresh()
    } catch (caught) {
      setSelectionError(errorMessage(caught instanceof DashboardApiError ? caught.code : undefined, copy))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!flowId) return null

  return (
    <Card className="border-brand/30">
      <CardHeader>
        <CardTitle>{copy.accountSelectionTitle}</CardTitle>
        <CardDescription>{copy.accountSelectionHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex flex-col gap-3" aria-label={copy.accountListLoading}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{copy.accountListError}</AlertTitle>
            <AlertDescription>{errorMessage(error.code, copy)}</AlertDescription>
          </Alert>
        ) : accounts.length === 0 ? (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{copy.accountListEmpty}</AlertTitle>
            <AlertDescription>{copy.accountSelectionHint}</AlertDescription>
          </Alert>
        ) : (
          <>
            <label htmlFor="google-ads-account" className="flex flex-col gap-2 text-sm font-medium">
              {copy.accountSelectionTitle}
              <select
                id="google-ads-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{copy.accountSelectionHint}</option>
                {accounts.map((account) => (
                  <option key={account.externalAccountId} value={account.externalAccountId}>
                    {account.isManager ? `${copy.managerAccount} · ` : ''}
                    {account.name || account.externalAccountId} · {account.externalAccountId}
                  </option>
                ))}
              </select>
            </label>
            {selected?.isManager ? (
              <p className="text-sm text-muted-foreground">{copy.accountManagerNote}</p>
            ) : null}
            {selected?.currency ? (
              <p className="text-sm text-muted-foreground">
                {copy.accountCurrency}: {selected.currency}
              </p>
            ) : null}
            {selectionError ? (
              <Alert variant="destructive">
                <AlertCircle aria-hidden="true" />
                <AlertDescription>{selectionError}</AlertDescription>
              </Alert>
            ) : null}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={connectSelectedAccount}
                  disabled={!selected || selected.isManager || isSubmitting}
                >
                  {isSubmitting ? copy.accountListLoading : copy.accountConnectSelected}
                </Button>
              </div>

          </>
        )}
      </CardContent>
    </Card>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  )
}

function CampaignTable({ report, locale, copy }: {
  report: AdsPerformanceSummary
  locale: string
  copy: ReturnType<typeof useLanguage>['t']['ads']
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <caption className="sr-only">{copy.performanceTitle}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.campaignName}</TableHead>
            <TableHead>{copy.campaignStatus}</TableHead>
            <TableHead className="text-end">{copy.impressions}</TableHead>
            <TableHead className="text-end">{copy.clicks}</TableHead>
            <TableHead className="text-end">{copy.spend}</TableHead>
            <TableHead className="text-end">{copy.conversions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.campaigns.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                {copy.campaignsEmpty}
              </TableCell>
            </TableRow>
          ) : report.campaigns.map((campaign) => (
            <TableRow key={campaign.id}>
              <TableCell className="max-w-64 truncate font-medium">{campaign.name || campaign.id}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {campaign.status === 'ENABLED'
                    ? copy.campaignActive
                    : campaign.status === 'PAUSED'
                      ? copy.campaignPaused
                      : copy.campaignUnknown}
                </Badge>
              </TableCell>
              <TableCell className="text-end tabular-nums">{formatNumber(campaign.impressions, locale)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatNumber(campaign.clicks, locale)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatSpend(campaign.costMicros, report.currency, locale)}</TableCell>
              <TableCell className="text-end tabular-nums">{formatNumber(campaign.conversions, locale, 2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function GoogleAdsPerformance({ connection, range, onRangeChange }: {
  connection: GoogleAdsConnectionView | null
  range: GoogleAdsDateRange
  onRangeChange: (range: GoogleAdsDateRange) => void
}) {
  const { t, lang } = useLanguage()
  const copy = t.ads
  const isConnected = connection?.status === 'active' && !connection.isManager
  const reportUrl = isConnected && connection
    ? `/api/ads/google/dashboard?connectionId=${encodeURIComponent(connection.id)}&range=${range}`
    : null
  const { data, error, isLoading, isValidating, mutate } = useSWR<ReportPayload, DashboardApiError>(reportUrl, fetchJson, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const report = data?.report
  const locale = lang === 'tr' ? 'tr-TR' : 'en-US'
  const needsReconnect = error?.code === 'reauth_required' || error?.code === 'not_authorized'

  if (!connection) return null
  if (!isConnected || needsReconnect) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{copy.performanceTitle}</CardTitle>
          <CardDescription>{copy.readOnlyNote}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert variant={needsReconnect || connection.status === 'error' ? 'destructive' : 'default'}>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>
              {needsReconnect || connection.status === 'error' ? copy.accountStatusError : copy.accountStatusRevoked}
            </AlertTitle>
            <AlertDescription>
              {needsReconnect || connection.status === 'error' ? copy.reauthError : copy.accountStatusRevoked}
            </AlertDescription>
          </Alert>
          <form method="post" action="/api/ads/google/connect">
            <Button type="submit" variant="outline">{copy.reconnectButton}</Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 aria-hidden="true" className="size-4 text-brand" />
            {copy.performanceTitle}
          </CardTitle>
          <CardDescription>{copy.readOnlyNote}</CardDescription>
        </div>
        <CardAction className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            aria-label={copy.performanceTitle}
            value={[range]}
            onValueChange={(value) => {
              const next = value?.[0]
              if (next === '7d' || next === '30d') onRangeChange(next)
            }}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="7d">{copy.range7}</ToggleGroupItem>
            <ToggleGroupItem value="30d">{copy.range30}</ToggleGroupItem>
          </ToggleGroup>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void mutate()}
            disabled={isValidating}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            {copy.refreshData}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{copy.performanceError}</AlertTitle>
            <AlertDescription>{errorMessage(error.code, copy)}</AlertDescription>
          </Alert>
        ) : null}
        {isLoading && !report ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={copy.performanceLoading}>
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard label={copy.impressions} value={formatNumber(report.totals.impressions, locale)} />
              <MetricCard label={copy.clicks} value={formatNumber(report.totals.clicks, locale)} />
              <MetricCard label={copy.spend} value={formatSpend(report.totals.costMicros, report.currency, locale)} />
              <MetricCard label={copy.conversions} value={formatNumber(report.totals.conversions, locale, 2)} />
            </div>
            <CampaignTable report={report} locale={locale} copy={copy} />
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function GoogleAdsDashboard({
  connections,
  pendingFlowId,
  oauthStatus,
}: {
  connections: GoogleAdsConnectionView[]
  pendingFlowId: string | null
  oauthStatus: string | null
}) {
  const { t } = useLanguage()
  const copy = t.ads
  const router = useRouter()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [range, setRange] = useState<GoogleAdsDateRange>('7d')
  const [disconnectError, setDisconnectError] = useState<string | null>(null)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === selectedId)
      ?? connections.find((connection) => connection.status === 'active' && !connection.isManager)
      ?? connections[0]
      ?? null,
    [connections, selectedId],
  )

  const oauthNotice = oauthStatus
    ? errorMessage(oauthStatus, copy)
    : null

  async function disconnectSelected() {
    if (!selectedConnection || isDisconnecting || !window.confirm(copy.disconnectConfirm)) return
    setIsDisconnecting(true)
    setDisconnectError(null)
    try {
      const response = await fetch('/api/ads/google/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: selectedConnection.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const code = payload && typeof payload === 'object' && typeof (payload as ApiErrorBody).error === 'string'
          ? String((payload as ApiErrorBody).error)
          : 'disconnect_failed'
        throw new DashboardApiError(code)
      }
      setSelectedId(null)
      router.refresh()
    } catch (caught) {
      const code = caught instanceof DashboardApiError ? caught.code : undefined
      setDisconnectError(code === 'connection_busy' ? copy.connectionBusy : copy.disconnectError)
    } finally {
      setIsDisconnecting(false)
    }
  }

  return (
    <section aria-label={copy.connectionTitle} className="flex flex-col gap-4">
      {oauthNotice ? (
        <Alert variant={oauthStatus === 'rate_limited' ? 'destructive' : 'default'}>
          <AlertCircle aria-hidden="true" />
          <AlertDescription>{oauthNotice}</AlertDescription>
        </Alert>
      ) : null}

      <GoogleAccountChooser flowId={pendingFlowId} />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{copy.connectionTitle}</CardTitle>
            <CardDescription>{copy.connectionBody}</CardDescription>
          </div>
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>{copy.readOnlyNote}</span>
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {connections.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <form method="post" action="/api/ads/google/connect">
                <Button type="submit">{copy.connectionButton}</Button>
              </form>
              <p className="text-sm text-muted-foreground">{copy.readOnlyNote}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="google-ads-connection" className="text-sm font-medium">
                  {copy.accountSelectionTitle}
                </label>
                <select
                  id="google-ads-connection"
                  value={selectedConnection?.id ?? ''}
                  onChange={(event) => setSelectedId(event.target.value)}
                  className="h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-w-72"
                >
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.name || connection.externalAccountId} · {connection.externalAccountId}
                    </option>
                  ))}
                </select>
                {selectedConnection ? (
                  <p className="text-xs text-muted-foreground">
                    {selectedConnection.currency ? `${copy.accountCurrency}: ${selectedConnection.currency} · ` : ''}
                    {selectedConnection.isManager ? copy.managerAccount : selectedConnection.externalAccountId}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={selectedConnection?.status === 'active' ? 'secondary' : 'outline'}>
                  {selectedConnection?.status === 'active'
                    ? copy.accountStatusActive
                    : selectedConnection?.status === 'revoked'
                      ? copy.accountStatusRevoked
                      : copy.accountStatusError}
                </Badge>
                {selectedConnection?.status === 'active' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={disconnectSelected}
                    disabled={isDisconnecting}
                  >
                    {isDisconnecting ? copy.performanceLoading : copy.disconnectButton}
                  </Button>
                ) : (
                  <form method="post" action="/api/ads/google/connect">
                    <Button type="submit" variant="outline" size="sm">{copy.reconnectButton}</Button>
                  </form>
                )}
              </div>
            </div>
          )}
          {disconnectError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertDescription>{disconnectError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      {selectedConnection ? (
        <GoogleAdsPerformance
          connection={selectedConnection}
          range={range}
          onRangeChange={setRange}
        />
      ) : null}
    </section>
  )
}
