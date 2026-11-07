import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCapiContext } from '@/lib/analytics/meta-capi-context'
import { EVENT_NONCE_PATTERN, metaEventIds } from '@/lib/analytics/event-ids'
import {
  runInBackground,
  sendMetaCapiEvent,
  type MetaCapiCustomData,
  type MetaCapiEventName,
  type MetaCapiUser,
} from '@/lib/analytics/meta-capi'
import { loadCapiUser } from '@/lib/analytics/meta-capi-purchase'

/**
 * Same-origin bridge for the server-side Meta events the browser reports about
 * itself (registration, site generated, site published, checkout started).
 * Purchase is NOT accepted here: it is sent only from the verified payment
 * callback. Consent is read from the request's own cookie, so without marketing
 * consent the route does nothing at all.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NEW_USER_WINDOW_MS = 15 * 60 * 1000
const MAX_VALUE = 10_000_000
const CHECKOUT_CATEGORIES = ['subscription', 'one_time']

type Prepared = {
  name: MetaCapiEventName
  eventId: string
  user?: MetaCapiUser
  custom?: MetaCapiCustomData
}

function accepted() {
  return new NextResponse(null, { status: 202 })
}

function rejected(status = 400) {
  return new NextResponse(null, { status })
}

async function sessionUser(): Promise<MetaCapiUser | undefined> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const user = data.user
    return user ? { userId: user.id, email: user.email, phone: user.phone } : undefined
  } catch {
    return undefined
  }
}

async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('owner_id', userId)
      .maybeSingle()
    return Boolean(data)
  } catch {
    return false
  }
}

async function prepare(body: Record<string, unknown>): Promise<Prepared | null> {
  switch (body.type) {
    case 'sign_up': {
      const userId = typeof body.userId === 'string' ? body.userId : ''
      if (!UUID.test(userId)) return null
      try {
        const { data, error } = await createAdminClient().auth.admin.getUserById(userId)
        if (error || !data.user) return null
        // Only a just-created account may be reported, so the endpoint cannot
        // replay registrations of old users.
        if (Date.now() - new Date(data.user.created_at).getTime() > NEW_USER_WINDOW_MS) return null
      } catch {
        return null
      }
      const user = await loadCapiUser(userId)
      return {
        name: 'CompleteRegistration',
        eventId: metaEventIds.signup(userId),
        user,
        custom: { status: true, content_name: 'email' },
      }
    }
    case 'generate_site_completed': {
      const nonce = typeof body.nonce === 'string' ? body.nonce : ''
      if (!EVENT_NONCE_PATTERN.test(nonce)) return null
      return {
        name: 'GenerateSiteCompleted',
        eventId: metaEventIds.generate(nonce),
        user: await sessionUser(),
        custom: { content_name: body.source === 'fallback' ? 'fallback' : 'ai' },
      }
    }
    case 'publish_site': {
      const siteId = typeof body.siteId === 'string' ? body.siteId : ''
      if (!UUID.test(siteId)) return null
      const user = await sessionUser()
      if (!user?.userId || !(await ownsProject(user.userId, siteId))) return null
      return { name: 'PublishSite', eventId: metaEventIds.publish(siteId), user }
    }
    case 'begin_checkout': {
      const nonce = typeof body.nonce === 'string' ? body.nonce : ''
      if (!EVENT_NONCE_PATTERN.test(nonce)) return null
      const custom: MetaCapiCustomData = {}
      if (typeof body.value === 'number' && Number.isFinite(body.value) && body.value >= 0 && body.value <= MAX_VALUE) {
        custom.value = body.value
      }
      if (typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)) custom.currency = body.currency
      if (typeof body.category === 'string' && CHECKOUT_CATEGORIES.includes(body.category)) {
        custom.content_category = body.category
      }
      return { name: 'InitiateCheckout', eventId: metaEventIds.checkout(nonce), user: await sessionUser(), custom }
    }
    default:
      return null
  }
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin && requestOrigin !== origin) return rejected(403)

  const context = buildCapiContext(request.headers, { fallbackOrigin: origin })
  // No marketing consent: nothing is read, looked up or sent.
  if (!context.marketingConsent) return accepted()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return rejected()
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return rejected()

  const prepared = await prepare(body as Record<string, unknown>)
  if (!prepared) return rejected()

  runInBackground(() => sendMetaCapiEvent({ ...prepared, context }))
  return accepted()
}
