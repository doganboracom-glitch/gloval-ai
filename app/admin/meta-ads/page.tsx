import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  META_MAX_ACTIVE_CONNECTIONS,
  resolveMetaAdsAccessMode,
  resolveMetaAdsKillSwitch,
  resolveMetaGraphApiVersion,
  resolveMetaLoginConfigId,
  resolveMetaReadDailyLimits,
} from '@/lib/ads/env'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000
const EXPIRY_WARNING_DAYS = 7

type OperationRow = { outcome: string; safe_error_code: string | null; created_at: string }
type ConnectionRow = { status: string; token_expires_at: string | null }

function safeCode(value: string | null) {
  return value && /^[a-z0-9_]{1,64}$/.test(value) ? value : null
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default async function AdminMetaAdsPage() {
  const admin = createAdminClient()
  const now = Date.now()
  const since = new Date(now - DAY_MS).toISOString()
  const [operationsResult, connectionsResult, callsResult] = await Promise.all([
    admin
      .from('ads_meta_api_operations')
      .select('outcome,safe_error_code,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5_000),
    admin.from('ads_connections').select('status,token_expires_at').eq('platform', 'meta').limit(5_000),
    admin.rpc('ads_meta_api_calls_15d'),
  ])

  const queryFailed = Boolean(operationsResult.error || connectionsResult.error)
  const operations = (operationsResult.data ?? []) as OperationRow[]
  const connections = (connectionsResult.data ?? []) as ConnectionRow[]

  const successCount = operations.filter((row) => row.outcome === 'success').length
  const errorOperations = operations.filter((row) => row.outcome === 'error')
  const errorCounts = new Map<string, number>()
  for (const row of errorOperations) {
    const code = safeCode(row.safe_error_code)
    if (code) errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1)
  }

  const statusCounts = new Map<string, number>()
  let expiringSoon = 0
  const warnBefore = now + EXPIRY_WARNING_DAYS * DAY_MS
  for (const row of connections) {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1)
    if (row.status === 'active' && row.token_expires_at && Date.parse(row.token_expires_at) <= warnBefore) expiringSoon += 1
  }
  const activeCount = statusCounts.get('active') ?? 0

  const calls15d = typeof callsResult.data === 'number' ? callsResult.data : Number(callsResult.data ?? 0)
  const limits = resolveMetaReadDailyLimits()
  const accessMode = resolveMetaAdsAccessMode()
  const killSwitchEnabled = resolveMetaAdsKillSwitch()
  const loginConfigId = resolveMetaLoginConfigId()
  const appConfigured = Boolean(process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim())
  const recentErrors = errorOperations.slice(0, 20)

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Meta Ads salt-okunur kontrolleri</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bağlantı durumu, kullanım ve güvenli hata kodları; hesap bilgileri, e-postalar veya reklam içerikleri gösterilmez.
          </p>
        </div>
        <Badge variant={killSwitchEnabled ? 'destructive' : appConfigured ? 'default' : 'secondary'}>
          {killSwitchEnabled ? 'Acil durdurma etkin' : appConfigured ? 'Meta uygulaması yapılandırıldı' : 'Meta uygulaması eksik'}
        </Badge>
      </header>

      {queryFailed ? (
        <Alert variant="destructive">
          <AlertTitle>Meta Ads verileri yüklenemedi</AlertTitle>
          <AlertDescription>Bir veya daha fazla sorgu başarısız oldu. Aşağıdaki değerlere güvenmeyin.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Meta ölçümleri" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Son 24 saatteki Graph API çağrıları"
          value={queryFailed ? '—' : operations.length}
          detail={queryFailed ? 'Veri alınamadı' : `${successCount} başarılı · ${errorOperations.length} başarısız`}
        />
        <MetricCard
          label="Son 15 günde başarılı çağrılar"
          value={callsResult.error ? '—' : calls15d}
          detail="App Review kullanım eşiği için sayılır"
        />
        <MetricCard
          label="Etkin bağlantılar"
          value={queryFailed ? '—' : activeCount}
          detail={queryFailed ? 'Veri alınamadı' : `Kullanıcı başına en fazla ${META_MAX_ACTIVE_CONNECTIONS}`}
        />
        <MetricCard
          label={`${EXPIRY_WARNING_DAYS} gün içinde süresi dolacak`}
          value={queryFailed ? '—' : expiringSoon}
          detail="Süre dolmadan kullanıcıya e-posta gönderilir"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Erişim ve giriş ayarları</CardTitle>
            <CardDescription>Ayarlar ortamdan okunur; hiçbir değer değiştirilmez.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <ConfigLine label="Erişim modu" value={accessMode} />
            <ConfigLine label="Acil durdurma" value={killSwitchEnabled ? 'Etkin' : 'Devre dışı'} />
            <ConfigLine label="Giriş modu" value={loginConfigId ? 'Facebook Login for Business (config_id)' : 'Klasik (scope)'} />
            <ConfigLine label="Graph API sürümü" value={resolveMetaGraphApiVersion()} />
            <ConfigLine label="Kullanıcı başına okuma / 24 saat" value={limits.perUser} />
            <ConfigLine label="Genel okuma / 24 saat" value={limits.global} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hata kodları (24 saat)</CardTitle>
            <CardDescription>Yalnızca güvenli kodlar; sağlayıcı mesajı veya müşteri verisi içermez.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {queryFailed ? (
              <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için dağılım gösterilmiyor.</p>
            ) : errorCounts.size ? (
              [...errorCounts.entries()].map(([code, count]) => (
                <Badge key={code} variant="outline" className="font-mono">{code}: {count}</Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Son 24 saatte hata yok.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Bağlantı durumları</CardTitle>
            <CardDescription>Tüm Meta bağlantılarının durum dağılımı.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {queryFailed ? (
              <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için dağılım gösterilmiyor.</p>
            ) : statusCounts.size ? (
              [...statusCounts.entries()].map(([status, count]) => (
                <Badge key={status} variant="outline" className="font-mono">{status}: {count}</Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Henüz Meta bağlantısı yok.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Son hatalar</CardTitle>
            <CardDescription>Yalnızca güvenli hata kodu ve zaman gösterilir.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {queryFailed ? (
              <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için hatalar gösterilmiyor.</p>
            ) : (
              recentErrors.map((row, index) => (
                <div key={index} className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-mono">{safeCode(row.safe_error_code) ?? 'unknown'}</span>
                  <span className="text-muted-foreground">{timeLabel(row.created_at)}</span>
                </div>
              ))
            )}
            {!queryFailed && recentErrors.length === 0 ? <p className="text-sm text-muted-foreground">Gösterilecek hata yok.</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{detail}</CardContent>
    </Card>
  )
}

function ConfigLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}
