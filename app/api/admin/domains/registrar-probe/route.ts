import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { isProbeEnabled } from '@/lib/custom-domains/registrar/probe/policy'
import { isJsonRequest, isSameOriginRequest } from '@/lib/custom-domains/registrar/probe/request-guard'
import {
  abortProbeRun,
  getProbeRun,
  listProbeRuns,
  restoreProbeRun,
  startProbeRun,
  submitProbeChange,
  type ProbeError,
} from '@/lib/custom-domains/registrar/probe/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Admin-only registrar verification endpoint. Off by default: with
 * DOMAIN_REGISTRAR_PROBE_ENABLED unset, or outside a Vercel Production runtime, it
 * answers 404 to everyone, exactly like a route that does not exist. Non-admins
 * get the same 404.
 *
 * Guard order (every step before the next, nothing below runs if one fails):
 *   1. flag on AND VERCEL_ENV === 'production'  -> 404 (no Supabase or registrar call)
 *   2. signed-in admin                          -> 404
 *   3. POST only: same-origin                   -> 403
 *   4. POST only: application/json              -> 415
 *   5. service: domain allow-list, registrant gates, daily limits, then the registrar
 *
 * GET                 -> list runs
 * GET  ?runId=<uuid>  -> one run with its event log
 * POST { action: 'start' | 'submit' | 'restore' | 'abort', ... }
 */

type Admin = { id: string }

async function requireAdmin(): Promise<Admin | NextResponse> {
  const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 })
  if (!isProbeEnabled()) return notFound()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return notFound()
  return { id: user.id }
}

const STATUS: Partial<Record<ProbeError, number>> = {
  probe_disabled: 404,
  not_found: 404,
  domain_not_allowed: 403,
  registrant_probe_disabled: 403,
  daily_limit_reached: 429,
  invalid_state: 409,
  run_already_active: 409,
  registrar_unavailable: 503,
  backup_unavailable: 409,
  backup_expired: 409,
  submit_failed: 502,
  restore_failed: 502,
  db_error: 500,
}

function failure(result: { error: ProbeError; detail?: string }) {
  return NextResponse.json(
    { error: result.error, ...(result.detail ? { detail: result.detail } : {}) },
    { status: STATUS[result.error] ?? 400 },
  )
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const runId = new URL(request.url).searchParams.get('runId')
  if (runId) {
    const found = await getProbeRun(runId)
    return found ? NextResponse.json(found) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  return NextResponse.json({ runs: await listProbeRuns() })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'cross_origin' }, { status: 403 })
  if (!isJsonRequest(request)) return NextResponse.json({ error: 'json_required' }, { status: 415 })

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  switch (body.action) {
    case 'start': {
      const result = await startProbeRun({
        actorId: admin.id,
        domain: text(body.domain),
        contactType: body.contactType === undefined ? undefined : text(body.contactType),
        testEmail: text(body.testEmail),
        registrantConfirmed: body.registrantConfirmed === true,
        registrantApprovalNote: text(body.registrantApprovalNote),
      })
      return result.ok ? NextResponse.json({ run: result.run }, { status: 201 }) : failure(result)
    }
    case 'submit': {
      const result = await submitProbeChange({ runId: text(body.runId), actorId: admin.id, testEmail: text(body.testEmail) })
      return result.ok ? NextResponse.json({ run: result.run, applied: result.applied }) : failure(result)
    }
    case 'restore': {
      const result = await restoreProbeRun({ runId: text(body.runId), actorId: admin.id })
      return result.ok ? NextResponse.json({ run: result.run }) : failure(result)
    }
    case 'abort': {
      const result = await abortProbeRun({ runId: text(body.runId), actorId: admin.id, note: text(body.note) })
      return result.ok ? NextResponse.json({ run: result.run }) : failure(result)
    }
    default:
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
  }
}
