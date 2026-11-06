import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { GoogleAdsReportStorageError, disableGoogleAdsReportsByTokenHash, googleAdsReportUnsubscribeTokenExists } from '@/lib/ads/google-ads-report-store'
import { isSameOriginGoogleAdsPost } from '@/lib/ads/google-route-utils'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{40,60}$/
const HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Content-Type': 'text/html; charset=utf-8',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function page(title: string, message: string, form?: { token: string }): NextResponse {
  const action = form
    ? `<form method="post" style="margin-top:24px"><input type="hidden" name="token" value="${form.token}"><button type="submit" style="border:0;border-radius:8px;padding:12px 18px;background:#7652c8;color:#fff;font-weight:700;cursor:pointer">E-posta raporlarını kapat</button></form>`
    : '<a href="https://gloval.ai/ads/dashboard" style="display:inline-block;margin-top:24px;color:#b8a0ef">GLOVAL AI paneline dön</a>'
  const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;background:#111116;color:#ededf0;font:16px/1.6 Arial,sans-serif"><main style="max-width:560px;margin:12vh auto;padding:32px 24px;border:1px solid #34343d;border-radius:16px;background:#1a1a20"><p style="margin:0 0 10px;color:#b8a0ef;font-size:13px;letter-spacing:.12em;font-weight:700">GLOVAL ADS</p><h1 style="margin:0;font-size:24px">${title}</h1><p style="color:#b7b7c0">${message}</p>${action}</main></body></html>`
  return new NextResponse(html, { headers: HEADERS })
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!TOKEN_PATTERN.test(token)) return page('Bağlantı geçersiz', 'Bu e-posta çıkış bağlantısı geçersiz veya eksik.')

  try {
    const exists = await googleAdsReportUnsubscribeTokenExists(tokenHash(token))
    if (!exists) return page('Bağlantı artık geçerli değil', 'Bu bağlantı daha önce kullanılmış veya süresi dolmuş olabilir.')
    return page('Rapor e-postaları', 'Haftalık ve aylık Google Ads rapor e-postalarını kapatmak istediğinizi onaylayın.', { token })
  } catch (error) {
    if (error instanceof GoogleAdsReportStorageError) {
      return page('Şu anda tamamlanamadı', 'Rapor tercihlerine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.')
    }
    return page('Şu anda tamamlanamadı', 'Rapor tercihlerine şu anda ulaşılamıyor. Lütfen daha sonra tekrar deneyin.')
  }
}

export async function POST(request: Request) {
  if (!isSameOriginGoogleAdsPost(request)) {
    return NextResponse.json({ ok: false, error: 'invalid_origin' }, { status: 403, headers: HEADERS })
  }

  let token = ''
  try {
    const form = await request.formData()
    const value = form.get('token')
    token = typeof value === 'string' ? value : ''
  } catch {
    return page('Bağlantı geçersiz', 'İstek doğrulanamadı.')
  }

  if (!TOKEN_PATTERN.test(token)) return page('Bağlantı geçersiz', 'Bu e-posta çıkış bağlantısı geçersiz veya eksik.')
  try {
    const disabled = await disableGoogleAdsReportsByTokenHash(tokenHash(token))
    return disabled
      ? page('Rapor e-postaları kapatıldı', 'Google Ads haftalık ve aylık rapor e-postaları artık gönderilmeyecek.')
      : page('Bağlantı artık geçerli değil', 'Bu bağlantı daha önce kullanılmış veya süresi dolmuş olabilir.')
  } catch {
    return page('Şu anda tamamlanamadı', 'Rapor tercihleri güncellenemedi. Lütfen daha sonra tekrar deneyin.')
  }
}
