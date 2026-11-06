import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveGoogleAdsAccessMode,
  resolveGoogleAdsKillSwitch,
  resolveGoogleAdsPublishLimits,
} from '@/lib/ads/env'

const DAY_MS = 24 * 60 * 60 * 1000

type AuditRow = {
  id: string
  user_id: string
  action_type: string
  status: string
  target: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  created_at: string
}

function safeReason(row: AuditRow) {
  const value = row.after_state?.reason_code ?? row.target?.reason_code
  return typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value) ? value : 'unknown'
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export default async function AdminGoogleAdsPage() {
  const admin = createAdminClient()
  const since = new Date(Date.now() - DAY_MS).toISOString()
  const [attemptsResult, blockedResult, connectionsResult, campaignsResult, reconcilingResult, enableHoldsResult] = await Promise.all([
    admin.from('ads_actions')
      .select('id,user_id,action_type,status,target,after_state,created_at')
      .eq('action_type', 'google_ads_publish_attempt_reserved')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5_000),
    admin.from('ads_actions')
      .select('id,user_id,action_type,status,target,after_state,created_at')
      .in('action_type', ['google_ads_publish_blocked', 'google_ads_policy_blocked'])
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5_000),
    admin.from('ads_connections').select('user_id').eq('status', 'active').limit(5_000),
    admin.from('ads_plans')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .in('google_campaign_status', ['ENABLED', 'PAUSED'])
      .not('external_campaign_id', 'is', null),
    admin.from('ads_plans')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reconciling'),
    admin.from('ads_actions')
      .select('id', { count: 'exact', head: true })
      .eq('action_type', 'google_ads_campaign_enable_capacity_reserved')
      .eq('status', 'proposed'),
  ])

  const queryFailed = Boolean(
    attemptsResult.error || blockedResult.error || connectionsResult.error || campaignsResult.error || reconcilingResult.error || enableHoldsResult.error,
  )
  const attempts = (attemptsResult.data ?? []) as AuditRow[]
  const blocked = (blockedResult.data ?? []) as AuditRow[]
  const connections = connectionsResult.data ?? []
  const successCount = attempts.filter((row) => row.status === 'applied').length
  const failureCount = attempts.filter((row) => row.status === 'failed').length
  const errorCounts = new Map<string, number>()
  for (const row of [...attempts, ...blocked]) {
    const reason = safeReason(row)
    if (reason !== 'unknown') errorCounts.set(reason, (errorCounts.get(reason) ?? 0) + 1)
  }

  const perUser = new Map<string, { connections: number; attempts: number }>()
  for (const row of connections) {
    const current = perUser.get(row.user_id) ?? { connections: 0, attempts: 0 }
    current.connections += 1
    perUser.set(row.user_id, current)
  }
  for (const row of attempts) {
    const current = perUser.get(row.user_id) ?? { connections: 0, attempts: 0 }
    current.attempts += 1
    perUser.set(row.user_id, current)
  }

  const limits = resolveGoogleAdsPublishLimits()
  const accessMode = resolveGoogleAdsAccessMode()
  const killSwitchEnabled = resolveGoogleAdsKillSwitch()
  const publishEnabled = process.env.GOOGLE_ADS_PUBLISH_ENABLED?.trim() === '1'
  const recentEvents = [...blocked, ...attempts]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 20)

  return (
    <main className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Google Ads canlı kontrolleri</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kullanım, limitler ve canlı işlemler; hesap bilgileri, e-postalar veya reklam içerikleri gösterilmez.
          </p>
        </div>
        <Badge variant={killSwitchEnabled ? 'destructive' : publishEnabled ? 'default' : 'secondary'}>
          {killSwitchEnabled ? 'Acil durdurma etkin' : publishEnabled ? 'Yayınlama etkin' : 'Yayınlama kapalı'}
        </Badge>
      </header>

      {queryFailed ? (
        <Alert variant="destructive">
          <AlertTitle>Google Ads verileri yüklenemedi</AlertTitle>
          <AlertDescription>Bir veya daha fazla sorgu başarısız oldu. Aşağıdaki rapor değerlerine güvenmeyin.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="Yayınlama ölçümleri" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Son 24 saatteki denemeler" value={queryFailed ? '—' : attempts.length} detail={queryFailed ? 'Veri alınamadı' : `${successCount} başarılı · ${failureCount} başarısız`} />
        <MetricCard label="Etkin kampanyalar" value={queryFailed ? '—' : campaignsResult.count ?? 0} detail="ENABLED ve PAUSED sayılır; REMOVED sayılmaz" />
        <MetricCard label="Etkin bağlantılar" value={queryFailed ? '—' : connections.length} detail={queryFailed ? 'Veri alınamadı' : `${perUser.size} kullanıcıda bağlı hesap var`} />
        <MetricCard label="Uzlaştırma bekleyenler" value={queryFailed ? '—' : reconcilingResult.count ?? 0} detail="Google Ads ile eşleştirme gerekli" />
        <MetricCard label="Etkinleştirme rezervasyonları" value={queryFailed ? '—' : enableHoldsResult.count ?? 0} detail="Tamamlanana kadar etkin kampanya limitinde tutulur" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Erişim ve limit ayarları</CardTitle>
            <CardDescription>Ayarlar ortamdan okunur; hiçbir değer değiştirilmez.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <ConfigLine label="Erişim modu" value={accessMode} />
            <ConfigLine label="Genel yayınlama" value={publishEnabled ? 'Açık' : 'Kapalı'} />
            <ConfigLine label="Acil durdurma" value={killSwitchEnabled ? 'Etkin' : 'Devre dışı'} />
            <ConfigLine label="Kullanıcı başına en fazla kampanya" value={limits.maxActiveCampaignsPerUser} />
            <ConfigLine label="Kullanıcı başına deneme / 24 saat" value={limits.dailyAttemptsPerUser} />
            <ConfigLine label="Genel deneme / 24 saat" value={limits.dailyAttemptsGlobal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Engelleme ve hata kodları</CardTitle>
            <CardDescription>Yalnızca güvenli kodlar; sağlayıcı mesajı veya müşteri verisi içermez.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {queryFailed ? <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için dağılım gösterilmiyor.</p> : errorCounts.size ? [...errorCounts.entries()].map(([reason, count]) => (
              <Badge key={reason} variant="outline" className="font-mono">{reason}: {count}</Badge>
            )) : <p className="text-sm text-muted-foreground">Son 24 saatte olay yok.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kullanıcı başına kullanım</CardTitle>
            <CardDescription>UUID, e-posta veya ad yerine anonim sıra numarası gösterilir.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {queryFailed ? <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için kullanım dökümü gösterilmiyor.</p> : [...perUser.values()].map((value, index) => (
              <div key={index} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span>Kullanıcı {index + 1}</span>
                <span className="text-muted-foreground">{value.connections} bağlantı · {value.attempts} deneme</span>
              </div>
            ))}
            {!queryFailed && perUser.size === 0 ? <p className="text-sm text-muted-foreground">Bağlantı veya deneme yok.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Son olaylar</CardTitle>
            <CardDescription>Yalnızca engelleme nedeni ve işlem durumu gösterilir.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {queryFailed ? <p className="text-sm text-muted-foreground">Sorgu başarısız olduğu için olaylar gösterilmiyor.</p> : recentEvents.map((row) => (
              <div key={row.id} className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono">{safeReason(row)}</span>
                <span className="text-muted-foreground">{row.status} · {timeLabel(row.created_at)}</span>
              </div>
            ))}
            {!queryFailed && recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">Gösterilecek olay yok.</p> : null}
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
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}
