import { escape, renderEmailLayout, renderEmailPlainText, renderSection, renderTable } from './layout'

export const ADS_DASHBOARD_URL = 'https://gloval.ai/ads/dashboard'
export const ADS_ADMIN_URL = 'https://gloval.ai/admin/ads-publishing'

type MailContent = { subject: string; html: string; text: string }

const USER_FOOTER = 'Bu e-posta GLOVAL Ads hesabınızda gerçekleşen bir işlem nedeniyle gönderildi.'
const ADMIN_FOOTER = 'Bu e-posta GLOVAL Ads yönetici bildirimidir; kullanıcıya iletilmez.'

function paragraph(text: string) {
  return `<p style="margin:0 0 12px;">${escape(text)}</p>`
}

function bulletList(items: readonly string[]) {
  return `<ul style="margin:0 0 12px;padding-left:22px;">${items
    .map((item) => `<li style="margin:0 0 6px;">${escape(item)}</li>`)
    .join('')}</ul>`
}

type UserMailInput = {
  title: string
  summary: string
  /** Optional extra sentence, e.g. a credit statement. */
  note?: string
  steps: readonly string[]
  details?: ReadonlyArray<[string, string]>
  /** Optional https links shown under the details, as [label, href]. */
  links?: ReadonlyArray<[string, string]>
}

function linkList(links: ReadonlyArray<[string, string]>) {
  return links
    .map(([label, href]) => `<p style="margin:0 0 12px;"><a href="${escape(href)}">${escape(label)}</a></p>`)
    .join('')
}

function buildUserMail(input: UserMailInput): MailContent {
  const body = [
    paragraph(input.summary),
    input.note ? paragraph(input.note) : '',
    input.details?.length ? renderTable(input.details.map(([label, value]) => [label, value])) : '',
    input.links?.length ? linkList(input.links) : '',
    renderSection('Ne yapmalısınız?', bulletList(input.steps)),
  ].join('')
  const detailLines = (input.details ?? []).map(([label, value]) => `${label}: ${value}`)
  const linkLines = (input.links ?? []).map(([label, href]) => `${label}: ${href}`)
  const text = [
    input.summary,
    input.note ?? '',
    ...detailLines,
    ...linkLines,
    '',
    'Ne yapmalısınız?',
    ...input.steps.map((step) => `- ${step}`),
    '',
    `Ads panelini aç: ${ADS_DASHBOARD_URL}`,
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')

  return {
    subject: input.title,
    html: renderEmailLayout({
      lang: 'tr',
      previewText: input.summary,
      title: input.title,
      body,
      cta: { label: 'Ads panelini aç', href: ADS_DASHBOARD_URL },
      footer: USER_FOOTER,
      homeUrl: ADS_DASHBOARD_URL,
    }),
    text: renderEmailPlainText(input.title, text, USER_FOOTER),
  }
}

type AdminMailInput = {
  title: string
  summary: string
  rows: ReadonlyArray<[string, string]>
  action?: string
}

function buildAdminMail(input: AdminMailInput): MailContent {
  const body = [
    paragraph(input.summary),
    renderTable(input.rows.map(([label, value]) => [label, value])),
    input.action ? renderSection('Yapılacak', paragraph(input.action)) : '',
  ].join('')
  const text = [
    input.summary,
    ...input.rows.map(([label, value]) => `${label}: ${value}`),
    input.action ? `Yapılacak: ${input.action}` : '',
    `Yönetici paneli: ${ADS_ADMIN_URL}`,
  ]
    .filter(Boolean)
    .join('\n')

  return {
    subject: `GLOVAL Ads: ${input.title}`,
    html: renderEmailLayout({
      lang: 'tr',
      previewText: input.summary,
      title: input.title,
      body,
      cta: { label: 'Yönetici panelini aç', href: ADS_ADMIN_URL },
      footer: ADMIN_FOOTER,
      homeUrl: ADS_ADMIN_URL,
    }),
    text: renderEmailPlainText(input.title, text, ADMIN_FOOTER),
  }
}

/* ------------------------------ user emails ------------------------------ */

type FailureCopy = { summary: string; steps: string[] }

const GENERIC_FAILURE: FailureCopy = {
  summary: 'Google Ads isteğiniz şu anda tamamlanamadı.',
  steps: [
    'Birkaç dakika bekleyip işlemi yeniden deneyin.',
    'Sorun sürerse destek ekibimize yazın; durumu birlikte inceleyelim.',
  ],
}

const FAILURE_COPY: Record<string, FailureCopy> = {
  insufficient_credits: {
    summary: 'Bu işlem için yeterli krediniz bulunmuyor.',
    steps: ['Kredi bakiyenizi yükleyin ya da paketinizi yükseltin.', 'Ardından işlemi yeniden başlatın.'],
  },
  reauth_required: {
    summary: 'Google Ads bağlantınızın yenilenmesi gerekiyor.',
    steps: ['Ads panelinden Google hesabınızı yeniden bağlayın.', 'Bağlantı yenilendikten sonra işlemi tekrar deneyin.'],
  },
  connection_not_found: {
    summary: 'Bağlı bir Google Ads hesabı bulunamadı.',
    steps: ['Ads panelinden Google Ads hesabınızı bağlayın.', 'Ardından işlemi tekrar deneyin.'],
  },
  manager_account: {
    summary: 'Seçtiğiniz hesap bir yönetici hesabı; reklam yayınlamak için reklam hesabı gerekir.',
    steps: ['Yönetici hesabının altındaki bir reklam hesabını bağlayın.', 'Ardından işlemi tekrar deneyin.'],
  },
  currency_mismatch: {
    summary: 'Planın para birimi Google Ads hesabınızın para birimiyle uyuşmuyor.',
    steps: ['Planı hesabınızın para birimiyle yeniden oluşturun.', 'Ardından onaylayıp tekrar deneyin.'],
  },
  api_quota_exceeded: {
    summary: 'Google günlük işlem sınırına ulaşıldı.',
    steps: ['Yarın tekrar deneyin.', 'Acil bir durum varsa destek ekibimize yazın.'],
  },
  destination_unreachable: {
    summary: 'Reklamınızın yönlendireceği web sayfası açılamadı.',
    steps: ['Web sitenizin yayında ve erişilebilir olduğundan emin olun.', 'Ardından işlemi tekrar deneyin.'],
  },
  ad_disapproved: {
    summary: 'Reklam metniniz Google politikalarına takıldı.',
    steps: ['Reklam başlıklarını ve açıklamalarını gözden geçirip düzenleyin.', 'Planı yeniden onaylayıp tekrar deneyin.'],
  },
  invalid_publish_plan: {
    summary: 'Reklam planınızda Google\'ın kabul etmediği bir alan var.',
    steps: ['Plandaki başlık, açıklama ve anahtar kelimeleri kontrol edin.', 'Düzeltip yeniden onaylayın.'],
  },
  invalid_budget: {
    summary: 'Günlük bütçe değeri geçerli değil.',
    steps: ['Plandaki günlük bütçeyi düzeltin.', 'Ardından yeniden onaylayıp tekrar deneyin.'],
  },
  plan_changed: {
    summary: 'Plan onaylandıktan sonra değişmiş.',
    steps: ['Planı gözden geçirip yeniden onaylayın.'],
  },
  user_publish_limit_reached: {
    summary: 'Bugünkü yayın hakkınızın sınırına ulaştınız.',
    steps: ['Yarın tekrar deneyin.'],
  },
  global_publish_limit_reached: {
    summary: 'Bugünkü yayın kapasitesi doldu.',
    steps: ['Yarın tekrar deneyin.'],
  },
}

function failureCopy(reason: string | undefined): FailureCopy {
  return (reason ? FAILURE_COPY[reason] : undefined) ?? GENERIC_FAILURE
}

export function buildAdsValidationPassedEmail(): MailContent {
  return buildUserMail({
    title: 'Reklam planınız doğrulandı',
    summary: 'Google Ads planınızı kontrol etti ve herhangi bir sorun bulmadı. Henüz hiçbir kampanya oluşturulmadı.',
    note: 'Bu adımda kredi düşülmedi.',
    steps: [
      'Ads panelinde planı son kez gözden geçirin.',
      'Hazırsanız yayın onayını verin; kampanya duraklatılmış olarak oluşturulur.',
    ],
  })
}

export function buildMetaConnectedEmail(input: { accountName?: string | null } = {}): MailContent {
  return buildUserMail({
    title: 'Meta reklam hesabınız bağlandı',
    summary: 'Facebook ve Instagram reklam hesabınız GLOVAL Ads\'e bağlandı. Bu aşamada yalnızca okuma izinleri verildi; GLOVAL Ads Meta hesabınızda kampanya oluşturmaz, değiştirmez ve harcama yapmaz.',
    steps: [
      'Ads panelinin Raporlar sekmesinden Meta performansınızı görüntüleyin.',
      'Bağlantıyı dilediğiniz zaman Ayarlar sekmesinden kesebilirsiniz.',
    ],
    details: input.accountName ? [['Reklam hesabı', input.accountName]] : undefined,
  })
}

export function buildMetaTokenExpiringEmail(input: { daysLeft: number; accountName?: string | null }): MailContent {
  const days = Math.max(1, Math.round(input.daysLeft))
  return buildUserMail({
    title: `Meta bağlantınız ${days} gün sonra sona erecek`,
    summary: `Meta (Facebook ve Instagram) bağlantınızın erişim süresi ${days} gün içinde doluyor. Süre dolunca Meta raporları güncellenmez.`,
    steps: [
      'Ads panelinin Ayarlar sekmesini açın.',
      'Meta kartında "Yenile" düğmesine basıp Meta hesabınızla yeniden onay verin.',
    ],
    details: input.accountName ? [['Reklam hesabı', input.accountName]] : undefined,
  })
}

export function buildMetaTokenExpiredEmail(input: { accountName?: string | null } = {}): MailContent {
  return buildUserMail({
    title: 'Meta bağlantınızın süresi doldu',
    summary: 'Meta (Facebook ve Instagram) bağlantınızın erişim süresi doldu; bu yüzden Meta raporları artık güncellenmiyor.',
    steps: [
      'Ads panelinin Ayarlar sekmesini açın.',
      'Meta kartında "Yeniden bağla" düğmesine basıp hesabınızı yeniden onaylayın.',
    ],
    details: input.accountName ? [['Reklam hesabı', input.accountName]] : undefined,
  })
}

export function buildAdsValidationFailedEmail(input: { reason?: string }): MailContent {
  const copy = failureCopy(input.reason)
  return buildUserMail({
    title: 'Reklam planınız doğrulanamadı',
    summary: copy.summary,
    note: 'Henüz kampanya oluşturulmadı ve kredi düşülmedi.',
    steps: copy.steps,
  })
}

export function buildAdsPublishSucceededEmail(input: { creditsCharged?: number | null } = {}): MailContent {
  const charged = typeof input.creditsCharged === 'number' && input.creditsCharged > 0
  return buildUserMail({
    title: 'Kampanyanız duraklatılmış olarak oluşturuldu',
    summary: 'Google Ads kampanyanız hesabınızda oluşturuldu. Güvenliğiniz için kampanya duraklatılmış durumda; siz başlatana kadar harcama yapılmaz.',
    note: charged ? `Bu yayın için ${input.creditsCharged} kredi kullanıldı.` : undefined,
    steps: [
      'Google Ads hesabınızda ödeme yönteminin tanımlı olduğundan emin olun.',
      'Reklamın Google incelemesinden geçmesini bekleyin.',
      'Hazır olduğunuzda Ads panelinden kampanyayı başlatın.',
    ],
  })
}

export function buildAdsPublishFailedEmail(input: { reason?: string }): MailContent {
  const copy = failureCopy(input.reason)
  return buildUserMail({
    title: 'Yayın tamamlanamadı, krediniz düşmedi',
    summary: copy.summary,
    note: 'Yayın tamamlanamadığı için krediniz düşülmedi ve Google Ads hesabınızda yeni bir kampanya oluşturulmadı.',
    steps: copy.steps,
  })
}

export type MetaPublishMailOutcome = 'published' | 'partial' | 'failed'

/** Customer-safe wording for a failed or partial Meta publish; never includes provider detail, ids or tokens. */
export function buildMetaPublishResultEmail(input: {
  outcome: MetaPublishMailOutcome
  campaignName: string
  adsManagerUrl?: string | null
}): MailContent {
  const campaignName = input.campaignName.trim().slice(0, 120) || 'Meta kampanyası'
  const link: ReadonlyArray<[string, string]> | undefined = input.adsManagerUrl
    ? [['Meta Reklam Yöneticisi', input.adsManagerUrl]]
    : undefined

  if (input.outcome === 'published') {
    return buildUserMail({
      title: 'Meta kampanyanız duraklatılmış olarak oluşturuldu',
      summary: 'Meta (Facebook ve Instagram) kampanyanız reklam hesabınızda oluşturuldu. Güvenliğiniz için kampanya duraklatılmış durumda; siz başlatana kadar harcama yapılmaz.',
      note: 'Kampanyayı etkinleştirme bir sonraki aşamada GLOVAL Ads\'e eklenecek; o zamana kadar Meta Reklam Yöneticisi\'nden başlatabilirsiniz.',
      steps: [
        'Meta reklam hesabınızda ödeme yönteminin tanımlı olduğundan emin olun.',
        'Reklamın Meta incelemesinden geçmesini bekleyin.',
        'Hazır olduğunuzda kampanyayı Meta Reklam Yöneticisi\'nden başlatın.',
      ],
      details: [
        ['Kampanya adı', campaignName],
        ['Durum', 'Duraklatıldı'],
      ],
      links: link,
    })
  }

  if (input.outcome === 'partial') {
    return buildUserMail({
      title: 'Meta kampanyanız kısmen oluşturuldu',
      summary: 'Meta kampanyanızın bazı adımları tamamlanamadı. Kampanya duraklatılmış durumda; harcama yapılmıyor.',
      note: 'Aynı planla yeniden denerseniz kaldığı yerden devam edilir ve tekrar nesne oluşturulmaz.',
      steps: [
        'Ads panelinde planı açıp yeniden deneyin.',
        'Sorun sürerse destek ekibimize yazın.',
      ],
      details: [
        ['Kampanya adı', campaignName],
        ['Durum', 'Duraklatıldı (eksik)'],
      ],
      links: link,
    })
  }

  return buildUserMail({
    title: 'Meta yayını tamamlanamadı',
    summary: 'Meta kampanyanız oluşturulamadı. Meta hesabınızda harcama yapılmadı.',
    steps: [
      'Ads panelinde planın ayrıntısındaki hata mesajını inceleyin.',
      'Gerekli düzeltmeyi yapıp yeniden deneyin.',
    ],
    details: [
      ['Kampanya adı', campaignName],
      ['Durum', 'Oluşturulmadı'],
    ],
  })
}

export type MetaManageMailAction = 'activate' | 'pause' | 'budget'

/** Customer-safe mail for a Meta activate / pause / budget change; never carries provider detail, ids or tokens. */
export function buildMetaManageEmail(input: {
  action: MetaManageMailAction
  campaignName: string
  dailyBudget: string
  previousDailyBudget?: string
  verified: boolean
  adsManagerUrl?: string | null
}): MailContent {
  const campaignName = input.campaignName.trim().slice(0, 120) || 'Meta kampanyası'
  const links: ReadonlyArray<[string, string]> | undefined = input.adsManagerUrl
    ? [['Meta Reklam Yöneticisi', input.adsManagerUrl]]
    : undefined
  const details: Array<[string, string]> = [['Kampanya adı', campaignName]]
  if (input.action === 'budget' && input.previousDailyBudget) details.push(['Önceki günlük bütçe', input.previousDailyBudget])
  details.push([input.action === 'budget' ? 'Yeni günlük bütçe' : 'Günlük bütçe', input.dailyBudget])
  const note = input.verified
    ? 'Değişiklik Meta tarafında doğrulandı.'
    : 'Değişiklik uygulandı; ancak Meta tarafındaki durum henüz doğrulanamadı.'
  const steps = [
    'Değişikliği Ads panelinden kontrol edebilirsiniz.',
    'Bu işlemi siz yapmadıysanız hemen destek ekibimize yazın.',
  ]
  if (input.action === 'activate') {
    return buildUserMail({
      title: 'Meta kampanyanız etkinleştirildi',
      summary: 'Meta (Facebook ve Instagram) kampanyanız etkinleştirildi. Reklamınız Meta incelemesinden geçtikten sonra gösterilmeye başlar; harcama ödeme yönteminizden günlük bütçeyi aşmayacak şekilde yapılır.',
      note,
      steps,
      details,
      links,
    })
  }
  if (input.action === 'pause') {
    return buildUserMail({
      title: 'Meta kampanyanız duraklatıldı',
      summary: 'Meta kampanyanız duraklatıldı. Yeniden başlatana kadar yeni harcama yapılmaz.',
      note,
      steps,
      details,
      links,
    })
  }
  return buildUserMail({
    title: 'Meta günlük bütçeniz güncellendi',
    summary: 'Meta kampanyanızın günlük bütçesi güncellendi.',
    note,
    steps,
    details,
    links,
  })
}

export type AdsCampaignAction = 'pause' | 'enable' | 'budget' | 'archive'

const ACTION_TITLE: Record<AdsCampaignAction, string> = {
  pause: 'Kampanyanız duraklatıldı',
  enable: 'Kampanyanız devam ettirildi',
  budget: 'Günlük bütçeniz güncellendi',
  archive: 'Kampanyanız arşivlendi',
}

const ACTION_SUMMARY: Record<AdsCampaignAction, string> = {
  pause: 'Google Ads kampanyanız duraklatıldı. Yeniden başlatana kadar yeni harcama yapılmaz.',
  enable: 'Google Ads kampanyanız yeniden yayına alındı. Reklamlarınız Google incelemesinden geçtikten sonra gösterilmeye devam eder.',
  budget: 'Google Ads kampanyanızın günlük bütçesi güncellendi.',
  archive: 'Google Ads kampanyanız arşivlendi ve artık yayında değil.',
}

export function buildAdsCampaignActionEmail(input: {
  action: AdsCampaignAction
  dailyBudget: string
  previousDailyBudget?: string
  monthlyEstimate: string
  stateVerified: boolean
  /** Set when the campaign has never been enabled before, so the mail announces the launch instead of a resume. */
  firstEnable?: boolean
}): MailContent {
  const launched = input.action === 'enable' && input.firstEnable === true
  const details: Array<[string, string]> = []
  if (input.action === 'budget' && input.previousDailyBudget) {
    details.push(['Önceki günlük bütçe', input.previousDailyBudget])
  }
  details.push([input.action === 'budget' ? 'Yeni günlük bütçe' : 'Günlük bütçe', input.dailyBudget])
  details.push(['Tahmini aylık harcama üst sınırı', input.monthlyEstimate])
  const steps = input.stateVerified
    ? ['Değişikliği Ads panelinden kontrol edebilirsiniz.', 'Bu işlemi siz yapmadıysanız hemen destek ekibimize yazın.']
    : [
        'Değişikliğin Google Ads hesabınızda göründüğünü Ads panelinden kontrol edin.',
        'Bu işlemi siz yapmadıysanız hemen destek ekibimize yazın.',
      ]
  return buildUserMail({
    title: launched ? 'Kampanyanız yayına alındı' : ACTION_TITLE[input.action],
    summary: launched
      ? 'Google Ads kampanyanız ilk kez yayına alındı. Reklamlarınız Google incelemesinden geçtikten sonra gösterilmeye başlar.'
      : ACTION_SUMMARY[input.action],
    note: input.stateVerified
      ? 'Değişiklik Google Ads tarafında doğrulandı.'
      : 'Değişiklik uygulandı; ancak Google Ads tarafındaki durum henüz doğrulanamadı.',
    details,
    steps,
  })
}

/* ----------------------------- admin emails ------------------------------ */

const RECONCILING_REASON_LABEL: Record<string, string> = {
  google_publish_result_unknown: 'Google yanıtı alınamadı; kampanyanın oluşup oluşmadığı belirsiz.',
  publish_result_persist_failed: 'Kampanya oluştu ancak sonuç kaydedilemedi.',
  publish_failure_persist_failed: 'Yay��n başarısız oldu ancak kredi rezervasyonu bırakılamadı.',
  publish_reservation_result_unknown: 'Kredi rezervasyonu sonucu belirsiz; plan yayın durumunda kaldı.',
  publish_stale_timeout: 'Yayın beklenenden uzun sürdü ve zaman aşımına uğradı.',
  publish_refund_failed: 'Kredi iadesi tamamlanamadı.',
}

export function buildAdsAdminReconcilingEmail(input: { planId: string; requestId: string; reason: string }): MailContent {
  return buildAdminMail({
    title: 'Yayın mutabakat bekliyor',
    summary: RECONCILING_REASON_LABEL[input.reason] ?? 'Bir Google Ads yayını mutabakat gerektiriyor.',
    rows: [
      ['Plan kimliği', input.planId],
      ['Deneme kimliği', input.requestId],
      ['Hata kodu', input.reason],
    ],
    action: 'Otomatik yeniden oluşturma yapılmadı. Google Ads hesabındaki durumu kontrol edip yönetici panelinden mutabakatı tamamlayın.',
  })
}

export function buildAdsAdminPublishFailureEmail(input: {
  planId: string
  requestId: string
  reason: string
  stage: 'validate_only' | 'publish'
  googleSummary?: string
}): MailContent {
  const validating = input.stage === 'validate_only'
  const rows: Array<[string, string]> = [
    ['Aşama', validating ? 'Doğrulama (kampanya oluşturmaz)' : 'Yayın'],
    ['Plan kimliği', input.planId],
    ['Deneme kimliği', input.requestId],
    ['Hata kodu', input.reason],
  ]
  if (input.googleSummary) rows.push(['Google hata kodu', input.googleSummary])
  return buildAdminMail({
    title: 'Google Ads işlem hatası',
    summary: validating
      ? 'Bir doğrulama isteği başarısız oldu. Bu aşama Google Ads hesabında kampanya oluşturmaz.'
      : 'Bir yayın isteği başarısız oldu; kredi rezervasyonunun bırakılması istendi.',
    rows,
    action: 'Kullanıcı yeniden denemeden önce Google Ads hesabındaki durumu kontrol edin.',
  })
}

export function buildAdsAdminCapEmail(
  kind: 'anon_half' | 'anon_full' | 'policy_block',
  input: { cap: number; used?: number },
): MailContent {
  if (kind === 'policy_block') {
    const used = input.used ?? input.cap
    return {
      ...buildAdminMail({
        title: `Günlük politika engeli sınırına ulaşıldı (${used}/${input.cap})`,
        summary: 'Günlük açık politika engeli deneme sınırına ulaşıldı. Yeni Ads AI istekleri yarına kadar bu sınır nedeniyle reddedilecek.',
        rows: [
          ['Kullanım', `${used}/${input.cap}`],
        ],
      }),
      subject: `GLOVAL Ads: günlük politika engeli sınırına ulaşıldı (${used}/${input.cap})`,
    }
  }
  const half = kind === 'anon_half'
  return {
    ...buildAdminMail({
      title: half ? 'Anonim tarama kotasının yarısına ulaşıldı' : 'Anonim tarama kotası doldu',
      summary: half
        ? 'Bugünkü anonim ücretsiz tarama sayısı tavanın yarısına ulaştı. Gerekirse sınır değerini gözden geçirin.'
        : 'Bugünkü anonim ücretsiz tarama tavanı doldu. Yeni misafir taramaları yarına kadar giriş ister.',
      rows: [['Günlük tavan', String(input.cap)]],
    }),
    subject: half
      ? `GLOVAL Ads: anonim ücretsiz tarama kotasının %50'sine ulaşıldı (${input.cap})`
      : `GLOVAL Ads: anonim ücretsiz tarama kotası doldu (${input.cap})`,
  }
}

const RISK_REASON_LABEL: Record<string, string> = {
  above_recommendation: 'ilk plan önerisinin 3 katının aşılması',
  above_recent_spend: '30 günlük ortalama günlük harcamanın 3 katının aşılması',
  fivefold_previous_budget: 'önceki bütçenin en az 5 katına çıkılması',
  absolute_threshold: 'mutlak risk eşiğinin aşılması',
}

export function buildAdsAdminRiskyBudgetEmail(input: {
  userEmail: string
  actionLabel: string
  dailyBudget: string
  monthlyEstimate: string
  riskReasons: readonly string[]
  actionId: string
}): MailContent {
  return buildAdminMail({
    title: 'Riskli bütçe işlemi onaylandı',
    summary: `Bir kullanıcı riskli sayılan kampanya işlemini onayladı ve işlem uygulandı: kampanya ${input.actionLabel}.`,
    rows: [
      ['Kullanıcı', input.userEmail],
      ['Günlük bütçe', input.dailyBudget],
      ['Tahmini aylık harcama üst sınırı', input.monthlyEstimate],
      ['Risk nedenleri', input.riskReasons.map((reason) => RISK_REASON_LABEL[reason] ?? reason).join(', ') || '-'],
      ['İşlem kimliği', input.actionId],
    ],
    action: 'Gerekirse kullanıcıyla iletişime geçip bütçeyi birlikte gözden geçirin.',
  })
}
