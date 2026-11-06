import { describe, expect, it } from 'vitest'
import {
  ADS_ADMIN_URL,
  ADS_DASHBOARD_URL,
  buildAdsAdminCapEmail,
  buildAdsAdminPublishFailureEmail,
  buildAdsAdminReconcilingEmail,
  buildAdsAdminRiskyBudgetEmail,
  buildAdsCampaignActionEmail,
  buildAdsPublishFailedEmail,
  buildAdsPublishSucceededEmail,
  buildAdsValidationFailedEmail,
  buildAdsValidationPassedEmail,
} from './ads-mail'

const TECHNICAL_REASONS = [
  'publish_reservation_result_unknown',
  'google_publish_result_unknown',
  'reservation_failed',
  'publish_not_started',
  'provider_error',
  'insufficient_credits',
  'api_quota_exceeded',
  'something_unmapped_internal',
]

const JARGON = /(_[a-z]+_[a-z]+|reservation|reconcil|request_id|plan_id|uuid|rpc|exception|stack|undefined|null)/i
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

function userMails() {
  const mails = [
    buildAdsValidationPassedEmail(),
    buildAdsPublishSucceededEmail({ creditsCharged: 12 }),
    buildAdsPublishSucceededEmail(),
    ...TECHNICAL_REASONS.flatMap((reason) => [
      buildAdsValidationFailedEmail({ reason }),
      buildAdsPublishFailedEmail({ reason }),
    ]),
    buildAdsValidationFailedEmail({}),
    buildAdsPublishFailedEmail({}),
    ...(['pause', 'enable', 'budget', 'archive'] as const).flatMap((action) => [
      buildAdsCampaignActionEmail({
        action,
        dailyBudget: '₺300,00',
        previousDailyBudget: '₺150,00',
        monthlyEstimate: '₺9.125,00',
        stateVerified: true,
      }),
      buildAdsCampaignActionEmail({
        action,
        dailyBudget: '₺300,00',
        monthlyEstimate: '₺9.125,00',
        stateVerified: false,
      }),
    ]),
  ]
  return mails
}

describe('kullanıcı Ads e-postaları', () => {
  it('jargon, hata kodu veya kimlik içermez', () => {
    for (const mail of userMails()) {
      for (const field of [mail.subject, mail.text]) {
        expect(field).not.toMatch(JARGON)
        expect(field).not.toMatch(UUID)
      }
      const visible = mail.html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
      expect(visible).not.toMatch(JARGON)
      expect(visible).not.toMatch(UUID)
    }
  })

  it('Ads paneli düğmesini ve markayı içerir', () => {
    for (const mail of userMails()) {
      expect(mail.html).toContain(`href="${ADS_DASHBOARD_URL}"`)
      expect(mail.html).toContain('Ads panelini aç')
      expect(mail.html).toContain('Ne yapmalısınız?')
      expect(mail.html.toLowerCase()).toContain('gloval')
      expect(mail.text).toContain(ADS_DASHBOARD_URL)
      expect(mail.html).not.toContain(ADS_ADMIN_URL)
    }
  })

  it('başarısız yayın e-postası kredinin düşmediğini söyler', () => {
    const mail = buildAdsPublishFailedEmail({ reason: 'publish_reservation_result_unknown' })
    expect(mail.subject).toBe('Yayın tamamlanamadı, krediniz düşmedi')
    expect(mail.text).toContain('krediniz düşülmedi')
  })

  it('başarılı yayın duraklatılmış oluşturulduğunu belirtir ve kredi tutarını yalnızca varsa yazar', () => {
    expect(buildAdsPublishSucceededEmail({ creditsCharged: 12 }).text).toContain('12 kredi')
    expect(buildAdsPublishSucceededEmail({ creditsCharged: null }).text).not.toMatch(/kredi kullanıldı/)
    expect(buildAdsPublishSucceededEmail().subject).toContain('duraklatılmış')
  })
})

describe('yönetici Ads e-postaları', () => {
  it('mutabakat e-postası kimlikleri, hata kodunu ve yönetici bağlantısını içerir', () => {
    const planId = '11111111-1111-4111-8111-111111111111'
    const requestId = '22222222-2222-4222-8222-222222222222'
    const mail = buildAdsAdminReconcilingEmail({
      planId,
      requestId,
      reason: 'publish_reservation_result_unknown',
    })
    expect(mail.subject).toMatch(/^GLOVAL Ads:/)
    for (const field of [mail.html, mail.text]) {
      expect(field).toContain(planId)
      expect(field).toContain(requestId)
      expect(field).toContain('publish_reservation_result_unknown')
    }
    expect(mail.html).toContain(`href="${ADS_ADMIN_URL}"`)
    expect(mail.text).toContain(ADS_ADMIN_URL)
  })

  it('yayın hatası e-postası doğrulama aşamasını ayırt eder', () => {
    const base = { planId: 'plan-1', requestId: 'req-1', reason: 'provider_error' }
    const validating = buildAdsAdminPublishFailureEmail({ ...base, stage: 'validate_only' })
    const publishing = buildAdsAdminPublishFailureEmail({ ...base, stage: 'publish', googleSummary: 'AUTHORIZATION_ERROR' })
    expect(validating.html).toContain('Doğrulama')
    expect(publishing.html).toContain('Yayın')
    expect(publishing.html).toContain('AUTHORIZATION_ERROR')
    expect(publishing.html).toContain(`href="${ADS_ADMIN_URL}"`)
  })

  it('kota ve riskli bütçe e-postaları bağlantı ve özet taşır', () => {
    const mails = [
      buildAdsAdminCapEmail('anon_half', { cap: 100 }),
      buildAdsAdminCapEmail('anon_full', { cap: 100 }),
      buildAdsAdminCapEmail('policy_block', { cap: 50, used: 50 }),
      buildAdsAdminRiskyBudgetEmail({
        userEmail: 'kullanici@example.com',
        actionLabel: 'devam ettirildi',
        dailyBudget: '₺900,00',
        monthlyEstimate: '₺27.375,00',
        riskReasons: ['above_recommendation', 'unknown_reason'],
        actionId: 'action-1',
      }),
    ]
    for (const mail of mails) {
      expect(mail.subject).toMatch(/^GLOVAL Ads:/)
      expect(mail.html).toContain(`href="${ADS_ADMIN_URL}"`)
      expect(mail.text).toContain(ADS_ADMIN_URL)
    }
  })
})

describe('HTML kaçışı', () => {
  it('yönetici e-postasındaki kullanıcı girdisi kaçışlanır', () => {
    const mail = buildAdsAdminRiskyBudgetEmail({
      userEmail: '<script>alert(1)</script>"x"@example.com',
      actionLabel: '<img src=x onerror=alert(1)>',
      dailyBudget: '₺1',
      monthlyEstimate: '₺30',
      riskReasons: ['<b>kötü</b>'],
      actionId: '"><svg onload=alert(1)>',
    })
    expect(mail.html).not.toContain('<script>alert(1)</script>')
    expect(mail.html).not.toContain('<img src=x')
    expect(mail.html).not.toContain('<svg onload')
    expect(mail.html).not.toContain('<b>kötü</b>')
    expect(mail.html).toContain('&lt;script&gt;')
  })

  it('hata kodu ve kimlikler kaçışlanır', () => {
    const mail = buildAdsAdminReconcilingEmail({
      planId: '<i>plan</i>',
      requestId: '"><script>x</script>',
      reason: '<u>neden</u>',
    })
    expect(mail.html).not.toContain('<i>plan</i>')
    expect(mail.html).not.toContain('<script>x</script>')
    expect(mail.html).not.toContain('<u>neden</u>')
  })
})
