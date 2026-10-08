import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CREDIT_NOTICE_MAX_AGE_DAYS,
  CREDIT_NOTICE_SEEN_COOKIE,
  CREDIT_NOTICE_TYPES,
  CREDIT_NOTICE_TYPE_FIRST,
  parseCreditNoticeAmount,
  type CreditNoticeView,
} from '@/lib/credit-notice'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/** Latest plan-credit notice of the signed-in user that was not dismissed yet. */
export async function GET() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ notice: null }, { status: 401, headers: NO_STORE })

  const since = new Date(Date.now() - CREDIT_NOTICE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await createAdminClient()
    .from('notification_logs')
    .select('id, type, body')
    .eq('user_id', userId)
    .in('type', [...CREDIT_NOTICE_TYPES])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return NextResponse.json({ notice: null }, { headers: NO_STORE })

  const seen = (await cookies()).get(CREDIT_NOTICE_SEEN_COOKIE)?.value
  const amount = parseCreditNoticeAmount(data.body)
  if (!amount || seen === String(data.id)) return NextResponse.json({ notice: null }, { headers: NO_STORE })

  const notice: CreditNoticeView = {
    id: String(data.id),
    amount,
    firstPeriod: data.type === CREDIT_NOTICE_TYPE_FIRST,
  }
  return NextResponse.json({ notice }, { headers: NO_STORE })
}

/** Remembers that the user has seen (or dismissed) a notice. */
export async function POST(request: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ ok: false }, { status: 401, headers: NO_STORE })

  const body = (await request.json().catch(() => null)) as { id?: unknown } | null
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!/^[\w-]{1,64}$/.test(id)) return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE })

  const response = NextResponse.json({ ok: true }, { headers: NO_STORE })
  response.cookies.set(CREDIT_NOTICE_SEEN_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CREDIT_NOTICE_MAX_AGE_DAYS * 24 * 60 * 60,
  })
  return response
}
