import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { GoogleAdsCampaignManager } from '@/components/ads/google-ads-campaign-manager'
import type { GoogleAdsManagementAction, GoogleAdsManagementSnapshot } from '@/lib/ads/google-ads-management'

const states = ['no-connection', 'draft', 'paused', 'enabled', 'activity'] as const
type State = typeof states[number]

const labels: Record<State, string> = {
  'no-connection': 'Bağlantı yok',
  draft: 'Taslak',
  paused: 'Duraklatıldı',
  enabled: 'Etkin',
  activity: 'İşlem geçmişi',
}

const campaignSnapshot: GoogleAdsManagementSnapshot = {
  campaignId: '9876543210',
  campaignStatus: 'PAUSED',
  dailyBudgetMicros: '150000000',
  headlines: ['Local Search Studio', 'Yakınınızdaki uzman ekip', 'Bugün danışın'],
  descriptions: ['Yerel hizmetler için güvenilir destek.', 'Ekibimizle projenizi bugün planlayın.'],
  keywords: [
    { resourceName: 'customers/1234567890/adGroupCriteria/456~1', text: 'yerel hizmet', matchType: 'PHRASE', negative: false },
    { resourceName: 'customers/1234567890/adGroupCriteria/456~2', text: 'ücretsiz danışmanlık', matchType: 'EXACT', negative: true },
  ],
  stateHash: 'f'.repeat(64),
  reviewStatus: 'approved',
  billingVerified: true,
  paymentMethodWarning: false,
  performance: {
    range: 'last_7_days',
    impressions: 12840,
    clicks: 71,
    conversions: 0,
    costMicros: '4600000000',
    ctr: 71 / 12840,
  },
}

const enabledSnapshot: GoogleAdsManagementSnapshot = {
  ...campaignSnapshot,
  campaignStatus: 'ENABLED',
  stateHash: 'e'.repeat(64),
}

function makeActivity(): GoogleAdsManagementAction[] {
  const now = Date.now()
  const createdAt = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
  const budgetState = { ...campaignSnapshot, dailyBudgetMicros: '180000000' }
  const keywordState = {
    ...campaignSnapshot,
    keywords: [...campaignSnapshot.keywords, { resourceName: 'customers/1234567890/adGroupCriteria/456~3', text: 'yakınımdaki servis', matchType: 'PHRASE' as const, negative: false }],
  }

  return [
    {
      id: '00000000-0000-4000-8000-000000000005',
      action_type: 'google_ads_ad_copy_update',
      target: { headlines: ['Başlık bir', 'Başlık iki', 'Başlık üç'], descriptions: ['Açıklama bir', 'Açıklama iki'] },
      before_state: campaignSnapshot,
      after_state: null,
      reversible: true,
      status: 'failed',
      undone_of: null,
      failure_reason: 'provider_error',
      created_at: createdAt(3),
      applied_at: null,
    },
    {
      id: '00000000-0000-4000-8000-000000000004',
      action_type: 'google_ads_campaign_status_update',
      target: { status: 'PAUSED' },
      before_state: enabledSnapshot,
      after_state: campaignSnapshot,
      reversible: true,
      status: 'applied',
      undone_of: '00000000-0000-4000-8000-000000000003',
      failure_reason: null,
      created_at: createdAt(18),
      applied_at: createdAt(18),
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      action_type: 'google_ads_campaign_status_update',
      target: { status: 'ENABLED' },
      before_state: campaignSnapshot,
      after_state: enabledSnapshot,
      reversible: true,
      status: 'applied',
      undone_of: null,
      failure_reason: null,
      created_at: createdAt(22),
      applied_at: createdAt(22),
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      action_type: 'google_ads_keyword_update',
      target: { keywordText: 'yakınımdaki servis', keywordOperation: 'add', keywordMatchType: 'PHRASE', keywordNegative: false },
      before_state: campaignSnapshot,
      after_state: keywordState,
      reversible: true,
      status: 'applied',
      undone_of: null,
      failure_reason: null,
      created_at: createdAt(43),
      applied_at: createdAt(43),
    },
    {
      id: '00000000-0000-4000-8000-000000000001',
      action_type: 'google_ads_budget_update',
      target: { dailyBudgetMinor: 18000, dailyBudgetMicros: '180000000' },
      before_state: campaignSnapshot,
      after_state: budgetState,
      reversible: true,
      status: 'applied',
      undone_of: null,
      failure_reason: null,
      created_at: createdAt(66),
      applied_at: createdAt(66),
    },
  ]
}

export default async function GoogleAdsLifecyclePreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>
}) {
  if (process.env.NODE_ENV === 'production') notFound()

  const query = await searchParams
  const requestedState = Array.isArray(query.state) ? query.state[0] : query.state
  const state: State = states.includes(requestedState as State) ? requestedState as State : 'no-connection'
  const published = state === 'paused' || state === 'enabled' || state === 'activity'
  const isTr = true
  const snapshot = state === 'enabled' ? enabledSnapshot : campaignSnapshot
  const data = published
    ? {
        ok: true,
        snapshot,
        actions: state === 'activity' ? makeActivity() : [],
        budgetIncreaseAvailableAt: null,
        stateVerified: true,
      }
    : undefined

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Gloval Ads · Görsel kontrol</p>
          <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">Kampanya yaşam döngüsü</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">Bağlantı, taslak ve yayınlanmış kampanya durumları için geliştirme önizlemesi.</p>
        </div>
        <Alert>
          <AlertTitle>Yalnızca sentetik test verisi</AlertTitle>
          <AlertDescription>Bu sayfa geliştirme ortamıyla sınırlıdır. Gerçek Google Ads verisi kullanmaz ve hiçbir işlem Google Ads’e gönderilmez.</AlertDescription>
        </Alert>
        <nav aria-label="Önizleme durumları" className="flex flex-wrap gap-2">
          {states.map((item) => (
            <Link
              key={item}
              href={`/ads/dev-lifecycle-preview?state=${item}`}
              aria-current={state === item ? 'page' : undefined}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${state === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}
            >
              {labels[item]}
            </Link>
          ))}
        </nav>
      </header>

      <GoogleAdsCampaignManager
        plan={published ? { id: `fixture-${state}`, status: 'published', version: 1 } : state === 'draft' ? { id: 'fixture-draft', status: 'draft', version: 1 } : null}
        hasConnection={state !== 'no-connection'}
        currency="USD"
        isTr={isTr}
        previewData={data}
        previewLabel={labels[state]}
        previewMode
      />
    </main>
  )
}
