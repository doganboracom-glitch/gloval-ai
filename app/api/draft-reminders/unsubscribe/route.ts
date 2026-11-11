import { createAdminClient } from '@/lib/supabase/admin'
import { verifyOptOutToken } from '@/lib/draft-reminders/token'

export const dynamic = 'force-dynamic'

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
}

const escapeHtml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function page(title: string, message: string, extra = ''): string {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f0d14;color:#f4f1f8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}main{max-width:440px;width:100%;background:#1a1722;border:1px solid #3a3347;border-radius:12px;padding:32px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{margin:0 0 20px;line-height:1.55;color:#cfc8da}a,button{display:inline-block;background:#A36FFA;color:#0f0d14;border:0;border-radius:8px;padding:12px 20px;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${extra}</main></body></html>`
}

const invalidPage = () =>
  new Response(
    page('Bağlantı geçersiz', 'Bu bağlantı geçersiz veya hatalı. / This link is invalid.', '<a href="https://gloval.ai">gloval.ai</a>'),
    { status: 400, headers: HEADERS },
  )

/** GET only renders a confirmation form: mail scanners that prefetch links must not opt anyone out. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') ?? ''
  if (!verifyOptOutToken(token)) return invalidPage()
  const form = `<form method="post" action="/api/draft-reminders/unsubscribe"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Hatırlatmaları durdur</button></form>`
  return new Response(
    page('Hatırlatmaları durdur', 'Taslak siteyle ilgili hatırlatma e-postalarını almayı bırakmak için onaylayın. / Confirm to stop draft site reminder emails.', form),
    { headers: HEADERS },
  )
}

export async function POST(request: Request) {
  let origin: string | null = null
  try {
    origin = new URL(request.headers.get('origin') ?? '').origin
  } catch {
    origin = null
  }
  if (origin !== new URL(request.url).origin) return invalidPage()

  const form = await request.formData().catch(() => null)
  const token = typeof form?.get('token') === 'string' ? (form.get('token') as string) : ''
  const userId = verifyOptOutToken(token)
  if (!userId) return invalidPage()

  const { error } = await createAdminClient()
    .from('profiles')
    .update({ draft_reminders_opt_out: true, draft_reminders_opt_out_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) {
    return new Response(page('Bir sorun oluştu', 'İşlem tamamlanamadı, lütfen daha sonra tekrar deneyin. / Something went wrong, please try again later.'), {
      status: 503,
      headers: HEADERS,
    })
  }

  return new Response(
    page('Hatırlatmalar durduruldu', 'Taslak siteyle ilgili hatırlatma e-postaları artık gönderilmeyecek. / Draft site reminders are stopped.', '<a href="https://gloval.ai">Ana sayfaya git</a>'),
    { headers: HEADERS },
  )
}
