import { describe, expect, it, vi } from 'vitest'
import {
  confirmAndCreate,
  describeMetaApiError,
  describePlanObjects,
  describeStoredFailure,
  metaFlowStepIndex,
  orderFieldErrors,
  shortenMetaDetail,
  toFieldErrors,
  type MetaApiError,
} from '@/lib/ads/meta-publish-ux'

const noObjects = { campaignId: null, adSetId: null, imageHash: null, creativeId: null, adId: null }

describe('Meta yayın hata metinleri', () => {
  it('alan hatası varsa form mesajı verir, Meta ayrıntısı göstermez', () => {
    const result = describeMetaApiError({ ok: false, error: 'plan_invalid', fieldErrors: { name: 'Gerekli' }, metaReason: 'secret' })
    expect(result.message).toBe('Formda düzeltilmesi gereken alanlar var.')
    expect(result.detail).toBeNull()
  })

  it('bilinen kodu Türkçe açıklar ve Meta tanısını ayrıntıya koyar', () => {
    const result = describeMetaApiError({ ok: false, error: 'page_required', metaReason: 'Some raw Meta text' })
    expect(result.message).toContain('Facebook Sayfası')
    expect(result.detail).toBe('Some raw Meta text')
  })

  it('reklamveren doğrulaması için Meta Business Support Home yolunu gösterir', () => {
    const result = describeMetaApiError({
      ok: false,
      error: 'advertiser_verification_required',
      metaReason: 'code=200 | error_subcode=1815010 | fbtrace_id=AbCdEfTrace123',
    })
    expect(result.message).toContain('Hesap Kalitesi')
    expect(result.detail).toContain('error_subcode=1815010')
    expect(result.detail).toContain('fbtrace_id=AbCdEfTrace123')
  })

  it('uygulama canlı değilse özel mesajı kullanır', () => {
    const result = describeMetaApiError({ ok: false, error: 'app_not_live' })
    expect(result.message.length).toBeGreaterThan(20)
  })

  it('adım etiketini mesajın önüne ekler', () => {
    const result = describeMetaApiError({ ok: false, error: 'provider_error', stepLabel: 'Reklam seti' })
    expect(result.message.startsWith('Reklam seti: ')).toBe(true)
  })

  it('engellenen ifadeleri listeler', () => {
    const result = describeMetaApiError({ ok: false, error: 'policy_blocked', blocked: ['bedava', 'garanti'] })
    expect(result.message).toContain('bedava, garanti')
  })

  it('bilinmeyen kodda genel mesaj verir', () => {
    expect(describeMetaApiError({ ok: false, error: 'zzz' }).message).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.')
  })

  it('ayrıntıyı maskeler, kodları kaldırır ve kısaltır', () => {
    const long = shortenMetaDetail('a'.repeat(500))
    expect(long?.length).toBeLessThanOrEqual(140)
    expect(shortenMetaDetail('(#100) Error code: 1870189 - age range invalid')).not.toMatch(/#100|1870189/i)
    expect(shortenMetaDetail('   ')).toBeNull()
    expect(shortenMetaDetail(null)).toBeNull()
  })

  it('Advantage+ yaş hatasında eşlenen mesajı ham API mesajına tercih eder ve Meta metnini maskeli teknik ayrıntıda tutar', () => {
    const result = describeMetaApiError({ ok: false, error: 'age_range_not_allowed', message: 'Instead, do something else.', metaReason: '(#100) age_max rejected 1870189', fieldErrors: { ageMax: 'Invalid maximum age' } })
    expect(result.message).toBe('Meta Advantage+ kitle, en çok yaşın 65 olmasını ister. Yaş aralığını 18-65 yapın.')
    expect(result.detail).toContain('age_max rejected')
    expect(result.detail).not.toMatch(/#100|1870189/i)
  })
})

describe('Form alanı sırası', () => {
  it('bilinen alanları ekrandaki sırayla döndürür, bilinmeyenleri atar', () => {
    const entries = orderFieldErrors({ imagePath: 'c', unknown: 'x', name: 'a', headline: 'b' })
    expect(entries.map(([name]) => name)).toEqual(['name', 'headline', 'imagePath'])
    expect(toFieldErrors({ name: 'a', nope: 'x' })).toEqual({ name: 'a' })
    expect(orderFieldErrors(null)).toEqual([])
  })
})

describe('Adım göstergesi', () => {
  const base = { status: 'draft', version: 2, validatedVersion: null, approvedVersion: null }
  it('plan yokken taslakta', () => expect(metaFlowStepIndex(null)).toBe(0))
  it('doğrulanmamış planda doğrulama adımı', () => expect(metaFlowStepIndex(base)).toBe(1))
  it('eski sürümde doğrulanmışsa yeniden doğrulama ister', () => {
    expect(metaFlowStepIndex({ ...base, validatedVersion: 1 })).toBe(1)
  })
  it('doğrulanmış ama onaysızsa onay adımı', () => {
    expect(metaFlowStepIndex({ ...base, validatedVersion: 2 })).toBe(2)
  })
  it('onaylıysa oluşturma adımı', () => {
    expect(metaFlowStepIndex({ ...base, validatedVersion: 2, approvedVersion: 2 })).toBe(3)
  })
  it('yayınlandıysa tüm adımlar tamam', () => {
    expect(metaFlowStepIndex({ ...base, status: 'published' })).toBe(4)
  })
})

describe('Kısmi sonuç', () => {
  it('yalnızca hata veren adımı başarısız işaretler', () => {
    const rows = describePlanObjects({ ...noObjects, campaignId: 'c1', adSetId: 'a1' }, 'image')
    expect(rows.map((row) => row.state)).toEqual(['ok', 'ok', 'failed', 'missing', 'missing'])
  })

  it('kayıtlı Advantage+ yaş hatasını güvenli mesajla verir, maskeli metni teknik ayrıntıda tutar', () => {
    const age = describeStoredFailure({
      failureStep: 'adset',
      failureCode: 'age_range_not_allowed',
      failureReason: '(#100) You can add a lower maximum age as a suggestion. 1870189',
    })
    expect(age?.message).toBe('Meta Advantage+ kitle, en çok yaşın 65 olmasını ister. Yaş aralığını 18-65 yapın.')
    expect(age?.detail).toContain('lower maximum age')
    expect(age?.detail).not.toMatch(/#100|1870189/i)
    const known = describeStoredFailure({ failureStep: 'adset', failureCode: 'payment_method_missing', failureReason: 'raw' })
    expect(known?.detail).toBeNull()
    const unknown = describeStoredFailure({ failureStep: 'adset', failureCode: 'weird', failureReason: 'raw reason' })
    expect(unknown?.message).toContain('adımı tamamlanamadı')
    expect(unknown?.detail).toBe('raw reason')
    expect(describeStoredFailure({ failureStep: null, failureCode: null, failureReason: null })).toBeNull()
  })
})

describe('Onayla ve oluştur akışı', () => {
  const input = { planId: 'p1', version: 3, termsAccepted: true, requestId: 'r1' }

  it('onaysız planda önce onaylar, sonra yayınlar', async () => {
    const post = vi.fn(async (_url: string, _body: unknown) => ({ ok: true }) as never)
    const result = await confirmAndCreate({ ...input, post, alreadyApproved: false })
    expect(result).toEqual({ ok: true, approvalSkipped: false })
    expect(post.mock.calls.map((call) => call[0])).toEqual(['/api/ads/meta/plans/approval', '/api/ads/meta/plans/publish'])
  })

  it('onaylı planda onayı atlar', async () => {
    const post = vi.fn(async () => ({ ok: true }) as never)
    const result = await confirmAndCreate({ ...input, post, alreadyApproved: true })
    expect(result).toEqual({ ok: true, approvalSkipped: true })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('onay başarısızsa yayınlamaz', async () => {
    const failure: MetaApiError = { ok: false, error: 'plan_changed' }
    const post = vi.fn(async () => failure as never)
    const result = await confirmAndCreate({ ...input, post, alreadyApproved: false })
    expect(result).toMatchObject({ ok: false, phase: 'approval' })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('yayın başarısızsa onay korunur ve hata yayın aşamasında döner', async () => {
    const onApproved = vi.fn()
    const failure: MetaApiError = { ok: false, error: 'app_not_live' }
    const post = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce(failure)
    const result = await confirmAndCreate({ ...input, post: post as never, alreadyApproved: false, onApproved })
    expect(result).toMatchObject({ ok: false, phase: 'publish' })
    expect(onApproved).toHaveBeenCalledTimes(1)
  })
})
