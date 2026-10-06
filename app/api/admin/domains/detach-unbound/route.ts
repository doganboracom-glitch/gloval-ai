import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { getVercelClient } from '@/lib/custom-domains/vercel'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * One-off cleanup for domains bought through GLOVAL that were wrongly attached
 * to the platform's own Vercel project before the owner picked a project.
 *
 * Only rows that are provably the bug's output are eligible: registrar-bought
 * (provider = domainnameapi, has an order), not bound to any GLOVAL project,
 * and recorded as attached to hosting. Platform and production hostnames are
 * never touched. Registrar registration and the DB domain row are kept; only
 * the Vercel attachment (apex + www) is removed and the stage columns reset.
 *
 * GET  -> dry run (lists candidates, changes nothing)
 * POST -> applies, optionally limited with ?domain=example.com
 */

const PROTECTED = new Set(['gloval.ai', 'gloval.site', 'dbajans.com.tr'])

function isProtected(domain: string): boolean {
  return PROTECTED.has(domain) || domain.endsWith('.gloval.site') || domain.endsWith('.gloval.ai')
}

async function requireAdminResponse(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return null
}

interface Candidate {
  id: string
  domain: string
  vercel_status: string
  created_at: string
  provider: string
  order_id: string
  website_project_id: string | null
}

async function findCandidates(only?: string | null): Promise<Candidate[]> {
  const { data, error } = await createAdminClient()
    .from('custom_domains')
    .select('id, domain, vercel_status, created_at, provider, order_id, website_project_id')
    .eq('provider', 'domainnameapi')
    .not('order_id', 'is', null)
    .is('website_project_id', null)
    .neq('vercel_status', 'not_configured')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as Candidate[]).filter((row) => !isProtected(row.domain) && (!only || row.domain === only))
}

export async function GET() {
  const denied = await requireAdminResponse()
  if (denied) return denied
  const candidates = await findCandidates()
  return NextResponse.json({
    dryRun: true,
    hostingConfigured: getVercelClient().configured,
    candidates: candidates.map((c) => ({
      domain: c.domain,
      hosts: [c.domain, `www.${c.domain}`],
      registrarSource: c.provider,
      orderId: c.order_id,
      projectBinding: c.website_project_id ? 'bound' : 'unbound',
      hostingStatus: c.vercel_status,
      createdAt: c.created_at,
    })),
  })
}

export async function POST(request: Request) {
  const denied = await requireAdminResponse()
  if (denied) return denied

  const vercel = getVercelClient()
  if (!vercel.configured) return NextResponse.json({ error: 'hosting_not_configured' }, { status: 503 })

  const only = new URL(request.url).searchParams.get('domain')?.trim().toLowerCase() || null
  const candidates = await findCandidates(only)
  const admin = createAdminClient()
  const results: { domain: string; detached: boolean; error?: string }[] = []

  for (const row of candidates) {
    let failure: string | null = null
    for (const host of [`www.${row.domain}`, row.domain]) {
      const removed = await vercel.removeDomain(host)
      if (!removed.ok) {
        failure = `${host}:${removed.code}`
        break
      }
    }
    if (failure) {
      results.push({ domain: row.domain, detached: false, error: failure })
      continue
    }
    await admin
      .from('custom_domains')
      .update({ vercel_status: 'not_configured', dns_status: 'pending', ssl_status: 'pending', last_error: null })
      .eq('id', row.id)
      .is('website_project_id', null)
    results.push({ domain: row.domain, detached: true })
  }

  return NextResponse.json({ dryRun: false, results })
}
