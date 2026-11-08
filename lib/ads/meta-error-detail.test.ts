import { describe, expect, it } from 'vitest'
import {
  META_ERROR_MESSAGE_LIMIT,
  classifyMetaError,
  extractMetaErrorDetail,
  formatMetaErrorCode,
  formatMetaErrorDiagnostic,
  redactMetaErrorMessage,
  sanitizeMetaErrorDetail,
} from '@/lib/ads/meta-error-detail'

describe('Meta hata ayrıntısı maskeleme', () => {
  it('erişim belirteçlerini, Bearer başlıklarını ve EA... anahtarlarını gizler', () => {
    const message = redactMetaErrorMessage(
      'Invalid OAuth access token: EAAGm0PX4ZCpsBAKZCtoken123456789 sent with Bearer abc.def.ghi and access_token=secretvalue',
    )
    expect(message).not.toContain('EAAGm0PX4ZCpsBAK')
    expect(message).not.toContain('abc.def.ghi')
    expect(message).not.toContain('secretvalue')
    expect(message).toContain('[redacted]')
  })

  it('uygulama sırrını, signed_request değerini ve JWT benzeri verileri gizler', () => {
    const message = redactMetaErrorMessage(
      'client_secret=topsecret app 1234567890|abcdefghijKLMNOP signed_request: aaa.bbb eyJhbGciOi.eyJzdWIiOi.sigpart123',
    )
    expect(message).not.toContain('topsecret')
    expect(message).not.toContain('abcdefghijKLMNOP')
    expect(message).not.toContain('eyJhbGciOi')
    expect(message).not.toContain('aaa.bbb')
  })

  it('e-posta, URL ve uzun sayısal kimlikleri maskeler', () => {
    const message = redactMetaErrorMessage('User jane@example.com opened https://graph.facebook.com/v24.0/me?access_token=x for act 1234567890123')
    expect(message).toContain('[email]')
    expect(message).toContain('[url]')
    expect(message).toContain('[phone]')
    expect(message).not.toContain('jane@example.com')
    expect(message).not.toContain('1234567890123')
  })

  it('kontrol karakterlerini temizler ve uzunluğu sınırlar', () => {
    expect(redactMetaErrorMessage('a\u0000b\nc')).toBe('a b c')
    expect(redactMetaErrorMessage('x'.repeat(1000))?.length).toBe(META_ERROR_MESSAGE_LIMIT)
    expect(redactMetaErrorMessage('   ')).toBeNull()
    expect(redactMetaErrorMessage(42)).toBeNull()
  })

  it('yalnızca izin verilen alanları çıkarır; trace kimliği saklanır, ham gövde atılır', () => {
    const detail = extractMetaErrorDetail({
      error: {
        message: 'Session has expired for the user',
        type: 'OAuthException',
        code: 190,
        error_subcode: 463,
        fbtrace_id: 'AbCdEfTrace',
        error_data: { secret: 'x' },
      },
      debug: 'raw',
    })
    expect(detail).toEqual({
      code: 190,
      subcode: 463,
      type: 'OAuthException',
      message: 'Session has expired for the user',
      traceId: 'AbCdEfTrace',
    })
    expect(JSON.stringify(detail)).toContain('AbCdEfTrace')
    expect(JSON.stringify(detail)).not.toContain('raw')
  })

  it('başlık, kullanıcı metni ve trace kimliğini maskeli biçimde saklar; kodları tanıda korur', () => {
    const detail = extractMetaErrorDetail({
      error: {
        code: 200,
        error_subcode: 1815010,
        type: 'OAuthException',
        error_user_title: 'Page access for jane@example.com',
        error_user_msg: 'Grant access for +90 555 123 45 67',
        message: 'Permission denied for account 123456789012',
        fbtrace_id: 'AbCdEfTrace123',
      },
    })

    expect(detail).toMatchObject({
      code: 200,
      subcode: 1815010,
      userTitle: 'Page access for [email]',
      userMessage: 'Grant access for [phone]',
      message: 'Permission denied for account [phone]',
      traceId: 'AbCdEfTrace123',
    })
    const diagnostic = formatMetaErrorDiagnostic(detail)
    expect(diagnostic).toContain('code=200')
    expect(diagnostic).toContain('error_subcode=1815010')
    expect(diagnostic).toContain('fbtrace_id=AbCdEfTrace123')
    expect(diagnostic).not.toContain('jane@example.com')
    expect(diagnostic).not.toContain('+90 555')
    expect(diagnostic?.length).toBeLessThanOrEqual(300)
    expect(redactMetaErrorMessage(diagnostic)).toContain('error_subcode=1815010')
  })

  it('geçersiz tür ve sayıları yok sayar, boş yükte null döner', () => {
    expect(extractMetaErrorDetail(null)).toBeNull()
    expect(extractMetaErrorDetail({})).toBeNull()
    expect(extractMetaErrorDetail({ error: { type: '<script>', code: -1, error_subcode: 'x' } })).toBeNull()
    expect(extractMetaErrorDetail({ error: { type: 'GraphMethodException', code: 100 } })).toMatchObject({ code: 100, type: 'GraphMethodException' })
  })

  it('depodan okunan ayrıntıyı yeniden doğrular', () => {
    expect(sanitizeMetaErrorDetail({ code: 4, subcode: null, type: 'bad type!', message: 'access_token=abc123' })).toEqual({
      code: 4,
      subcode: null,
      type: null,
      message: '[redacted]',
    })
    expect(sanitizeMetaErrorDetail('nope')).toBeNull()
  })

  it('günlük satırı belirteç içermez', () => {
    expect(formatMetaErrorCode({ code: 190, subcode: 463, type: 'OAuthException', message: 'EAAxxxxxxxxxxxxxxxxx' })).toBe('190/463 OAuthException')
    expect(formatMetaErrorCode(null)).toBe('unknown')
  })
})

describe('Meta hata sınıflandırma', () => {
  const detail = (code: number) => ({ code, subcode: null, type: null, message: null })

  it.each([
    [190, 400, 'reauth_required'],
    [102, 400, 'reauth_required'],
    [10, 403, 'permission_missing'],
    [200, 403, 'permission_missing'],
    [299, 403, 'permission_missing'],
    [4, 400, 'rate_limited'],
    [17, 400, 'rate_limited'],
    [32, 400, 'rate_limited'],
    [613, 400, 'rate_limited'],
    [80004, 400, 'rate_limited'],
    [1, 500, 'provider_unavailable'],
    [2, 200, 'provider_unavailable'],
    [100, 400, 'provider_error'],
  ])('kod %i (HTTP %i) -> %s', (code, status, expected) => {
    expect(classifyMetaError(status, detail(code))).toBe(expected)
  })

  it('kodsuz yanıtlar HTTP durumuna göre sınıflanır', () => {
    expect(classifyMetaError(429, null)).toBe('rate_limited')
    expect(classifyMetaError(401, null)).toBe('reauth_required')
    expect(classifyMetaError(503, null)).toBe('provider_unavailable')
    expect(classifyMetaError(400, null)).toBe('provider_error')
  })
})
