'use server'

import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getIyzicoSettings, type IyzicoSettingsView } from '@/lib/store-payments/iyzico-settings'
import { isOnboardingStoreReady } from '@/lib/iyzico-onboarding-store'
import { claimApplicationSlot, finalizeApplicationRequest } from '@/lib/iyzico-application-store'
import { sendTransactionalEmail } from '@/lib/notify'
import { tenantUrl } from '@/lib/domains'
import { normalizeWebsiteSchema } from '@/lib/website-schema-compat'
import { stripSampleContent } from '@/lib/sample-content'
import { cleanName } from '@/lib/iyzico-onboarding-shared'
import {
  buildApplicationEmail,
  evaluateSiteReadiness,
  validateApplicationInput,
  type ApplicationError,
  type ApplicationInput,
  type ApplicationMarker,
  type ApplicationState,
  type ReadinessItem,
  type SiteProbe,
} from '@/lib/iyzico-application-shared'

/**
 * iyzico merchant-application assistant. Nothing here calls iyzico: the owner
 * applies on iyzico's own site. The server only checks the live store, relays a
 * "contact me" request by e-mail to the platform team, and remembers two
 * owner-set progress markers. Contact details are never stored.
 */

const PROBE_TIMEOUT_MS = 8_000
const APPLICATION_KEY = 'iyzico_application'

export type ApplicationOverview = {
  items: ReadinessItem[]
  siteUrl: string | null
  state: ApplicationState
  prefill: { name: string; email: string; phone: string }
  formEnabled: boolean
  iyzico: IyzicoSettingsView
}

type ProjectRead = {
  name: string
  slug: string | null
  published: boolean
  schema: ReturnType<typeof stripSampleContent>
}

async function readProject(projectId: string): Promise<ProjectRead | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('projects')
    .select('name, slug, published, schema_data, language')
    .eq('id', projectId)
    .maybeSingle()
  if (!data) return null
  const normalized = normalizeWebsiteSchema(data.schema_data, data.language === 'en' ? 'en' : 'tr')
  if (!normalized.ok) return null
  return {
    name: data.name as string,
    slug: (data.slug as string | null) ?? null,
    published: Boolean(data.published),
    schema: stripSampleContent(normalized.value),
  }
}

async function probeSite(url: string): Promise<SiteProbe> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    await response.body?.cancel().catch(() => undefined)
    return { status: response.status, finalUrl: response.url || url }
  } catch {
    return { status: null, finalUrl: null }
  }
}

function readState(publicConfig: unknown): ApplicationState {
  const raw = (publicConfig as Record<string, Record<string, string> | undefined> | null)?.[APPLICATION_KEY]
  return {
    appliedAt: typeof raw?.applied_at === 'string' ? raw.applied_at : null,
    accountOpenedAt: typeof raw?.account_opened_at === 'string' ? raw.account_opened_at : null,
  }
}

export async function getIyzicoApplicationOverview(projectId: string): Promise<ApplicationOverview> {
  await authorizeProjectOwner(projectId)
  const project = await readProject(projectId)
  if (!project) throw new Error('NOT_FOUND')

  const live = project.published && Boolean(project.slug)
  const siteUrl = live && project.slug ? tenantUrl(project.slug) : null

  const admin = createAdminClient()
  const [probe, iyzico, stateRow, storeReady, supabase] = await Promise.all([
    siteUrl ? probeSite(siteUrl) : Promise.resolve(null),
    getIyzicoSettings(projectId),
    admin.from('ecommerce_payment_settings').select('public_config').eq('project_id', projectId).maybeSingle(),
    isOnboardingStoreReady(),
    createClient(),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>

  return {
    items: evaluateSiteReadiness({
      published: project.published,
      slug: project.slug,
      probe,
      schema: project.schema,
      siteName: project.name,
    }),
    siteUrl,
    state: readState(stateRow.data?.public_config),
    prefill: {
      name: cleanName(metadata.full_name ?? metadata.name),
      email: user?.email ?? '',
      phone: typeof user?.phone === 'string' ? user.phone : typeof metadata.phone === 'string' ? metadata.phone : '',
    },
    formEnabled: storeReady && Boolean(process.env.ADMIN_NOTIFICATION_EMAIL?.trim()),
    iyzico,
  }
}

export type ApplicationRequestResult = { ok: true } | { ok: false; error: ApplicationError }

export async function submitIyzicoApplicationRequest(
  projectId: string,
  input: ApplicationInput,
  consent: boolean,
): Promise<ApplicationRequestResult> {
  const { actorId } = await authorizeProjectOwner(projectId)
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL?.trim()
  if (!adminEmail) return { ok: false, error: 'unavailable' }
  if (consent !== true) return { ok: false, error: 'consent_required' }

  const validation = validateApplicationInput(input)
  if (!validation.ok) return { ok: false, error: validation.error }

  const project = await readProject(projectId)
  if (!project) return { ok: false, error: 'unavailable' }
  if (!project.published || !project.slug) return { ok: false, error: 'site_not_published' }

  const claim = await claimApplicationSlot(projectId, actorId)
  if (claim.kind === 'unavailable') return { ok: false, error: 'unavailable' }
  if (claim.kind === 'blocked') return { ok: false, error: 'rate_limited' }

  const mail = buildApplicationEmail({
    ...validation.value,
    siteName: project.name,
    siteUrl: tenantUrl(project.slug),
    projectId,
  })
  const sent = await sendTransactionalEmail({
    to: adminEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    replyTo: validation.value.email,
  })
  await finalizeApplicationRequest(claim.id, sent)
  return sent ? { ok: true } : { ok: false, error: 'unavailable' }
}

export async function setIyzicoApplicationMarker(
  projectId: string,
  marker: ApplicationMarker,
  value: boolean,
): Promise<{ ok: boolean; state: ApplicationState | null }> {
  const { ownerId } = await authorizeProjectOwner(projectId)
  if (marker !== 'applied' && marker !== 'account_opened') return { ok: false, state: null }

  const admin = createAdminClient()
  const { data: row, error: readError } = await admin
    .from('ecommerce_payment_settings')
    .select('public_config')
    .eq('project_id', projectId)
    .maybeSingle()
  if (readError) return { ok: false, state: null }

  const current = readState(row?.public_config)
  const now = new Date().toISOString()
  const next: ApplicationState = {
    appliedAt: marker === 'applied' ? (value ? now : null) : current.appliedAt,
    accountOpenedAt: marker === 'account_opened' ? (value ? now : null) : current.accountOpenedAt,
  }
  const stored: Record<string, string> = {}
  if (next.appliedAt) stored.applied_at = next.appliedAt
  if (next.accountOpenedAt) stored.account_opened_at = next.accountOpenedAt

  const publicConfig = {
    ...((row?.public_config as Record<string, Record<string, string>> | null) ?? {}),
    [APPLICATION_KEY]: stored,
  }

  if (row) {
    const { error } = await admin
      .from('ecommerce_payment_settings')
      .update({ public_config: publicConfig, updated_at: now })
      .eq('project_id', projectId)
    return error ? { ok: false, state: null } : { ok: true, state: next }
  }
  const { error } = await admin.from('ecommerce_payment_settings').insert({
    project_id: projectId,
    owner_id: ownerId,
    provider: 'mock',
    enabled: false,
    enabled_providers: [],
    public_config: publicConfig,
    secret_encrypted: null,
    updated_at: now,
  })
  return error ? { ok: false, state: null } : { ok: true, state: next }
}
