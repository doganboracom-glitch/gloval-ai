'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  META_TOKEN_WARNING_DAYS,
  metaAccountStatusLabel,
  metaTokenDaysRemaining,
  type MetaAdAccountCandidate,
  type MetaConnectionView,
  type MetaPageCandidate,
} from '@/lib/ads/meta-ads-shared'

type Props = {
  connections: MetaConnectionView[]
  pendingFlowId: string | null
  status: string | null
  missingScopes: string | null
}

const STATUS_COPY: Record<string, [string, string]> = {
  oauth_denied: ['Meta bağlantısı iptal edildi. İsterseniz yeniden deneyebilirsiniz.', 'The Meta connection was cancelled. You can try again.'],
  oauth_failed: ['Meta bağlantısı tamamlanamadı. Lütfen yeniden deneyin.', 'The Meta connection could not be completed. Please try again.'],
  state_invalid: ['Bağlantı oturumu geçersiz veya süresi dolmuş. Lütfen yeniden başlatın.', 'The connection session is invalid or expired. Please start again.'],
  flow_expired: ['Hesap seçimi süresi doldu. Lütfen Meta hesabınızı yeniden bağlayın.', 'The account selection expired. Please connect your Meta account again.'],
  permission_missing: ['Gerekli izinlerin tümü verilmedi. Raporlama için tüm izinleri onaylamanız gerekir.', 'Not all required permissions were granted. All of them are needed for reporting.'],
  config_permission_missing: ['Meta bağlantı yapılandırması eksik izin veriyor. Lütfen destek ekibiyle iletişime geçin.', 'The Meta connection configuration is missing required permissions. Please contact support.'],
  no_accounts: ['Bu Meta hesabında erişilebilir bir reklam hesabı bulunamadı.', 'No accessible ad account was found for this Meta user.'],
  rate_limited: ['Çok fazla deneme yaptınız. Birkaç dakika sonra tekrar deneyin.', 'Too many attempts. Try again in a few minutes.'],
  configuration_missing: ['Meta bağlantısı şu anda yapılandırılmamış.', 'The Meta connection is not configured right now.'],
  kill_switch_active: ['Meta bağlantısı geçici olarak durduruldu.', 'The Meta connection is temporarily paused.'],
  not_found: ['Meta bağlantısı bu hesap için açık değil.', 'The Meta connection is not enabled for this account.'],
  provider_error: ['Meta şu anda yanıt vermiyor. Lütfen biraz sonra tekrar deneyin.', 'Meta is not responding right now. Please try again shortly.'],
}

function statusMessage(code: string, isTr: boolean) {
  const entry = STATUS_COPY[code] ?? STATUS_COPY.provider_error
  return entry[isTr ? 0 : 1]
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'provider_error')
  return payload as T
}

function ConnectForm({ label, variant = 'default', manage = false }: { label: string; variant?: 'default' | 'outline'; manage?: boolean }) {
  return (
    <form method="post" action="/api/ads/meta/connect">
      {manage ? <input type="hidden" name="intent" value="manage" /> : null}
      <Button type="submit" variant={variant}>{label}</Button>
    </form>
  )
}

function MetaAccountChooser({ flowId, isTr }: { flowId: string; isTr: boolean }) {
  const router = useRouter()
  const { data, error, isLoading } = useSWR<{ accounts: MetaAdAccountCandidate[]; pages: MetaPageCandidate[] }>(
    `/api/ads/meta/select?flowId=${encodeURIComponent(flowId)}`,
    fetchJson,
    { revalidateOnFocus: false },
  )
  const [accountId, setAccountId] = useState('')
  const [pageId, setPageId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit() {
    if (!accountId) return
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/ads/meta/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flowId, accountId, pageId: pageId || undefined }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(statusMessage(typeof payload?.error === 'string' ? payload.error : 'provider_error', isTr))
        return
      }
      router.replace('/ads/dashboard#settings')
      router.refresh()
    } catch {
      setMessage(statusMessage('provider_error', isTr))
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />
  if (error || !data) {
    return (
      <Alert variant="destructive">
        <AlertCircle aria-hidden="true" />
        <AlertDescription>{statusMessage(error instanceof Error ? error.message : 'flow_expired', isTr)}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isTr ? 'Reklam hesabınızı seçin' : 'Choose your ad account'}</CardTitle>
        <CardDescription>
          {isTr ? 'Raporlanacak Meta reklam hesabını ve isterseniz ilişkili sayfayı seçin.' : 'Pick the Meta ad account to report on and, optionally, a related page.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{isTr ? 'Reklam hesabı' : 'Ad account'}</legend>
          {data.accounts.map((account) => {
            const state = metaAccountStatusLabel(account.accountStatus, isTr)
            return (
              <label key={account.externalAccountId} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-[:checked]:border-brand">
                <input
                  type="radio"
                  name="meta-account"
                  value={account.externalAccountId}
                  checked={accountId === account.externalAccountId}
                  onChange={() => setAccountId(account.externalAccountId)}
                />
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{account.name ?? account.externalAccountId}</span>
                  <span className="text-xs text-muted-foreground">{account.externalAccountId}{account.currency ? ` · ${account.currency}` : ''}</span>
                </span>
                <Badge variant={state.healthy ? 'secondary' : 'outline'}>{state.label}</Badge>
              </label>
            )
          })}
        </fieldset>
        {data.pages.length > 0 ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="meta-page" className="text-sm font-medium">{isTr ? 'Sayfa (isteğe bağlı)' : 'Page (optional)'}</label>
            <select
              id="meta-page"
              value={pageId}
              onChange={(event) => setPageId(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{isTr ? 'Sayfa seçme' : 'No page'}</option>
              {data.pages.map((page) => (
                <option key={page.pageId} value={page.pageId}>
                  {page.pageName ?? page.pageId}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}
        <Button type="button" className="self-start" disabled={!accountId || saving} onClick={submit}>
          {saving ? (isTr ? 'Kaydediliyor…' : 'Saving…') : (isTr ? 'Hesabı bağla' : 'Connect account')}
        </Button>
      </CardContent>
    </Card>
  )
}

function ConnectionCard({ connection, isTr }: { connection: MetaConnectionView; isTr: boolean }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const days = metaTokenDaysRemaining(connection.tokenExpiresAt)
  const needsReconnect = connection.status === 'error' || (days !== null && days < 0)
  const expiringSoon = !needsReconnect && days !== null && days <= META_TOKEN_WARNING_DAYS
  const needsEngagementScope = connection.missingOptionalScopes.includes('pages_read_engagement')
  const state = metaAccountStatusLabel(connection.accountStatus, isTr)

  async function disconnect() {
    setBusy(true)
    setMessage(null)
    try {
      const response = await fetch('/api/ads/meta/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connection.id }),
      })
      if (!response.ok) {
        setMessage(statusMessage('provider_error', isTr))
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setMessage(statusMessage('provider_error', isTr))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="font-medium">{connection.name ?? connection.externalAccountId}</span>
          <span className="text-xs text-muted-foreground">
            {connection.externalAccountId}{connection.currency ? ` · ${connection.currency}` : ''}
            {connection.pageName ? ` · ${connection.pageName}` : ''}
            {connection.instagramAccountName ? ` · @${connection.instagramAccountName}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={state.healthy ? 'secondary' : 'outline'}>{state.label}</Badge>
          {needsReconnect ? <Badge variant="destructive">{isTr ? 'Yeniden bağlanmalı' : 'Reconnect needed'}</Badge> : null}
        </div>
      </div>

      {needsReconnect ? (
        <p className="text-sm text-muted-foreground">
          {isTr ? 'Erişim süresi doldu; raporlar güncellenmiyor. Hesabı yeniden bağlayın.' : 'Access has expired and reports are not updating. Reconnect the account.'}
        </p>
      ) : expiringSoon ? (
        <p className="text-sm text-muted-foreground">
          {isTr ? `Erişim ${Math.max(days ?? 0, 0)} gün içinde sona erecek. Şimdi yenileyebilirsiniz.` : `Access ends in ${Math.max(days ?? 0, 0)} days. You can renew it now.`}
        </p>
      ) : null}

      {!needsReconnect && needsEngagementScope ? (
        <p className="text-sm text-muted-foreground">
          {isTr
            ? 'Sayfa etkileşim verileri için izin gerekli. Hesabı yeniden bağlayıp “pages_read_engagement” iznini verebilirsiniz; reklam raporları bundan etkilenmez.'
            : 'Permission needed for page engagement data. Reconnect and grant “pages_read_engagement”; ad reports are not affected.'}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {needsReconnect || expiringSoon || needsEngagementScope ? (
          <ConnectForm variant="outline" label={needsReconnect ? (isTr ? 'Yeniden bağla' : 'Reconnect') : expiringSoon ? (isTr ? 'Yenile' : 'Renew') : (isTr ? 'İzin ver' : 'Grant permission')} />
        ) : null}
        {!needsReconnect && connection.missingPublishScopes.length > 0 ? (
          <ConnectForm manage variant="outline" label={isTr ? 'Yönetim izni ver (duraklatılmış kampanya)' : 'Grant management permission (paused campaigns)'} />
        ) : null}
        <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
          {isTr ? 'Bağlantıyı kes' : 'Disconnect'}
        </Button>
      </div>
      {message ? <p role="alert" className="text-sm text-destructive">{message}</p> : null}

      <ConfirmDialog
        open={confirming}
        title={isTr ? 'Meta bağlantısı kesilsin mi?' : 'Disconnect Meta?'}
        description={isTr
          ? 'Erişim izni Meta tarafında iptal edilir ve kayıtlı erişim anahtarı silinir. Meta hesabınızdaki reklamlar etkilenmez.'
          : 'Access is revoked on Meta and the stored access token is deleted. Ads in your Meta account are not affected.'}
        confirmLabel={busy ? (isTr ? 'Kesiliyor…' : 'Disconnecting…') : (isTr ? 'Bağlantıyı kes' : 'Disconnect')}
        cancelLabel={isTr ? 'Vazgeç' : 'Cancel'}
        destructive
        confirmDisabled={busy}
        onConfirm={() => void disconnect()}
        onCancel={() => setConfirming(false)}
      />
    </li>
  )
}

export function MetaAdsSettings({ connections, pendingFlowId, status, missingScopes }: Props) {
  const { lang } = useLanguage()
  const isTr = lang === 'tr'
  const visible = connections.filter((connection) => connection.status !== 'revoked')

  return (
    <section className="flex flex-col gap-4" aria-labelledby="meta-ads-title">
      <div className="flex flex-col gap-1">
        <h2 id="meta-ads-title" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {isTr ? 'Meta (Facebook ve Instagram)' : 'Meta (Facebook and Instagram)'}
          <Badge variant="outline">{isTr ? 'Salt okunur' : 'Read-only'}</Badge>
        </h2>
        <p className="text-sm text-muted-foreground">
          {isTr
            ? 'Reklam performansınızı görüntülemek için Meta reklam hesabınızı bağlayın. GLOVAL Ads Meta hesabınızda kampanya oluşturmaz, değiştirmez ve harcama yapmaz.'
            : 'Connect your Meta ad account to view ad performance. GLOVAL Ads does not create or change campaigns, and never spends money in your Meta account.'}
        </p>
      </div>

      {status ? (
        <Alert variant={status === 'connected' ? 'default' : 'destructive'}>
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{isTr ? 'Meta bağlantısı' : 'Meta connection'}</AlertTitle>
          <AlertDescription>
            {statusMessage(status, isTr)}
            {status === 'permission_missing' && missingScopes ? ` (${missingScopes.split(',').slice(0, 6).join(', ')})` : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {pendingFlowId ? <MetaAccountChooser flowId={pendingFlowId} isTr={isTr} /> : null}

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {visible.map((connection) => <ConnectionCard key={connection.id} connection={connection} isTr={isTr} />)}
        </ul>
      ) : !pendingFlowId ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-4 pt-6">
            <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{isTr ? 'Yalnızca okuma izinleri istenir.' : 'Only read permissions are requested.'}</li>
              <li className="flex items-start gap-2"><RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{isTr ? 'Erişim yaklaşık 60 gün sürer; bitmeden e-posta ile hatırlatırız.' : 'Access lasts about 60 days; we email you before it ends.'}</li>
            </ul>
            <ConnectForm label={isTr ? 'Meta hesabını bağla' : 'Connect Meta account'} />
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
