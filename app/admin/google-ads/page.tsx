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
  const [attemptsResult, blockedResult, connectionsResult, campaignsResult, reconcilingResult] = await Promise.all([
    admin.from('ads_actions')
      .select('id,user_id,action_type,status,target,after_state,created_at')
      .eq('action_type', 'google_ads_publish_attempt_reserved')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500),
    admin.from('ads_actions')
      .select('id,user_id,action_type,status,target,after_state,created_at')
      .eq('action_type', 'google_ads_publish_blocked')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.from('ads_connections').select('user_id').eq('status', 'active').limit(1000),
    admin.from('ads_plans')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published')
      .in('google_campaign_status', ['ENABLED', 'PAUSED'])
      .not('external_campaign_id', 'is', null),
    admin.from('ads_plans')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reconciling'),
  ])

  const queryFailed = Boolean(
    attemptsResult.error || blockedResult.error || connectionsResult.error || campaignsResult.error || reconcilingResult.error,
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
          <h2 className="text-2xl font-semibold tracking-tight">Google Ads live controls</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            שימוש, מכסות, אירועי חסימה ופעולות live — ללא פרטי חשבון, אימיילים או תוכן מודעות.
          </p>
        </div>
        <Badge variant={killSwitchEnabled ? 'destructive' : publishEnabled ? 'default' : 'secondary'}>
          {killSwitchEnabled ? 'מתג עצירה פעיל' : publishEnabled ? 'פרסום מופעל' : 'פרסום כבוי'}
        </Badge>
      </header>

      {queryFailed ? (
        <Alert variant="destructive">
          <AlertTitle>לא ניתן לטעון את נתוני Google Ads</AlertTitle>
          <AlertDescription>הנתונים לא הוצגו כדי למנוע הצגת מצב חלקי או מטעה.</AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="מדדי פרסום" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="ניסיונות ב-24 שעות" value={attempts.length} detail={`${successCount} הצליחו · ${failureCount} נכשלו`} />
        <MetricCard label="קמפיינים פעילים" value={campaignsResult.count ?? 0} detail="ENABLED או PAUSED; REMOVED לא נספרים" />
        <MetricCard label="חיבורים פעילים" value={connections.length} detail={`${perUser.size} משתמשים עם חשבון מחובר`} />
        <MetricCard label="ממתינים ל-reconciliation" value={reconcilingResult.count ?? 0} detail="נדרשת התאמה מול Google Ads" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>מצב גישה ומכסות</CardTitle>
            <CardDescription>הגדרות נקראות מהסביבה; שום ערך לא שונה.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <ConfigLine label="מצב גישה" value={accessMode} />
            <ConfigLine label="פרסום גלובלי" value={publishEnabled ? 'מופעל' : 'כבוי'} />
            <ConfigLine label="מתג עצירה" value={killSwitchEnabled ? 'פעיל' : 'לא פעיל'} />
            <ConfigLine label="מקסימום קמפיינים למשתמש" value={limits.maxActiveCampaignsPerUser} />
            <ConfigLine label="ניסיונות למשתמש / 24 שעות" value={limits.dailyAttemptsPerUser} />
            <ConfigLine label="ניסיונות גלובליים / 24 שעות" value={limits.dailyAttemptsGlobal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>התפלגות קודי חסימה ושגיאה</CardTitle>
            <CardDescription>קודים בטוחים בלבד; ללא הודעות ספק או נתוני לקוח.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {errorCounts.size ? [...errorCounts.entries()].map(([reason, count]) => (
              <Badge key={reason} variant="outline" className="font-mono">{reason}: {count}</Badge>
            )) : <p className="text-sm text-muted-foreground">אין אירועים ב-24 השעות האחרונות.</p>}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>מכסות לפי משתמש</CardTitle>
            <CardDescription>מוצג מזהה סדרתי בלבד — לא UUID, אימייל או שם.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {[...perUser.values()].map((value, index) => (
              <div key={index} className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span>משתמש {index + 1}</span>
                <span className="text-muted-foreground">{value.connections} חיבורים · {value.attempts} ניסיונות</span>
              </div>
            ))}
            {perUser.size === 0 ? <p className="text-sm text-muted-foreground">אין חיבורים או ניסיונות.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>אירועים אחרונים</CardTitle>
            <CardDescription>סיבת חסימה ומצב פעולה בלבד.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {recentEvents.map((row) => (
              <div key={row.id} className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-mono">{safeReason(row)}</span>
                <span className="text-muted-foreground">{row.status} · {timeLabel(row.created_at)}</span>
              </div>
            ))}
            {recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">אין אירועים להצגה.</p> : null}
          </CardContent>
        </Card>
      </section>
    </main>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
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
