'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { websiteSchema, isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import { getMyCurrentPlan, getPlanCodeForUser } from '@/lib/billing'
import { PAGE_LIMIT_ERROR, isPageGrowthBlocked, pageLimitForPlan } from '@/lib/page-limits'
import { getEffectiveSiteLimit, getEffectiveProductLimit } from '@/lib/effective-limits'
import {
  SITE_LIMIT_ERROR,
  PLAN_REQUIRED_ERROR,
  SUBSCRIPTION_SUSPENDED_ERROR,
  toPlanCode,
} from '@/lib/pricing-config'
import { isSubscriptionSuspended } from '@/lib/billing-lifecycle'
import { syncStoreFromSchema } from '@/lib/store-sync'
import { slugifyProjectName } from '@/lib/slug'
import { RESERVED_TENANT_SUBDOMAINS } from '@/lib/domains'

export type ProjectType = 'corporate' | 'ecommerce'

export type ProjectRow = {
  id: string
  owner_id: string
  name: string
  sector: string | null
  language: string
  prompt: string | null
  schema_data: WebsiteSchema
  status: string
  project_type: ProjectType
  slug: string | null
  published: boolean
  published_at: string | null
  published_version_id: string | null
  created_at: string
  updated_at: string
}

export type ProjectListItem = Pick<
  ProjectRow,
  | 'id'
  | 'name'
  | 'sector'
  | 'language'
  | 'status'
  | 'project_type'
  | 'updated_at'
  | 'created_at'
  | 'slug'
  | 'published'
>

/** A single saved version snapshot, for the editor's change-history panel. */
export type ProjectVersionItem = {
  id: string
  label: string | null
  created_at: string
}

/** Requires an authenticated user; returns the Supabase client + user id/email. */
async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('UNAUTHENTICATED')
  return { supabase, userId: user.id, email: user.email ?? null }
}

/**
 * Resolves the correct DB client for operating on a single project.
 *
 * Normal users always stay on their RLS-scoped session client, so their
 * behavior is completely unchanged: they can only ever touch rows they own.
 *
 * A verified admin (server-side `ADMIN_EMAILS` allowlist) who does NOT own the
 * project is elevated to the service-role client so the back office can edit
 * ANY tenant's site. RLS is never weakened — this elevation is gated purely by
 * the same allowlist that guards the admin panel, and only kicks in for a row
 * the caller cannot already reach. `elevated` lets callers apply admin-override
 * semantics (e.g. skip the per-plan publish limit for another user's site).
 */
async function clientForProject(projectId: string): Promise<{
  db: ReturnType<typeof createAdminClient> | Awaited<ReturnType<typeof createClient>>
  userId: string
  elevated: boolean
}> {
  const { supabase, userId, email } = await requireUser()

  // Can the caller already see this row under RLS? If so, they own it (or it's
  // otherwise permitted) — keep them on the normal client.
  const { data: owned } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (owned) return { db: supabase, userId, elevated: false }

  // Not reachable under RLS. Only a verified admin gets elevated; everyone else
  // stays on the session client so the existing 404 / no-op behavior holds.
  if (isAdminEmail(email)) return { db: createAdminClient(), userId, elevated: true }

  return { db: supabase, userId, elevated: false }
}

/** Lists the current user's projects, newest first. RLS scopes to the owner. */
export async function listProjects(): Promise<ProjectListItem[]> {
  const { supabase } = await requireUser()
  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, name, sector, language, status, project_type, updated_at, created_at, slug, published',
    )
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Loads a single project by id. Normal users are RLS-scoped to their own rows;
 * a verified admin can additionally load any tenant's project (back office).
 */
export async function getProject(id: string): Promise<ProjectRow | null> {
  const { db } = await clientForProject(id)
  const { data, error } = await db.from('projects').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as ProjectRow) ?? null
}

/**
 * Lists the saved version snapshots for a project, newest first. Ownership is
 * enforced twice: an explicit owner check here AND RLS on project_versions, so
 * a user who guesses another user's project id gets nothing.
 */
export async function listProjectVersions(projectId: string): Promise<ProjectVersionItem[]> {
  const { db, userId, elevated } = await clientForProject(projectId)

  // Explicit server-side ownership check (never trust the client with the id).
  // Admins operating on another tenant's project are elevated and skip this —
  // the service-role client scopes the version list by project_id below.
  if (!elevated) {
    const { data: owned, error: ownErr } = await db
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('owner_id', userId)
      .maybeSingle()
    if (ownErr) throw ownErr
    if (!owned) throw new Error('NOT_FOUND')
  }

  const { data, error } = await db
    .from('project_versions')
    .select('id, label, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data as ProjectVersionItem[]) ?? []
}

/** Creates a new project from a generated schema and returns its id. */
export async function createProject(input: {
  name: string
  sector?: string | null
  language?: string
  prompt?: string | null
  schema: WebsiteSchema
  projectType?: ProjectType
}): Promise<string> {
  const { supabase, userId } = await requireUser()
  const parsed = websiteSchema.parse(input.schema)
  // The project type MUST reflect the actual generated content. A brief like
  // "…e-ticaret sitesi oluştur" yields a schema with products/categories
  // sections, but the create payload from the landing hero never carried a
  // `projectType`, so every generated store used to be stored as `corporate`.
  // That mismatch is what made `/ecommerce/[id]` (and its orders/payment pages)
  // 404 and hid the store tools on the dashboard. Derive it from the schema so
  // any storefront is always typed `ecommerce`, and still honor an explicit
  // caller override when one is passed.
  const projectType: ProjectType =
    input.projectType ?? (isStorefront(parsed) ? 'ecommerce' : 'corporate')
  const { data, error } = await supabase
    .from('projects')
    .insert({
      owner_id: userId,
      name: input.name || 'Untitled',
      sector: input.sector ?? null,
      language: input.language ?? 'tr',
      prompt: input.prompt ?? null,
      schema_data: parsed,
      status: 'draft',
      project_type: projectType,
    })
    .select('id')
    .single()
  if (error) throw error
  revalidatePath('/dashboard')
  return data.id as string
}

/**
 * Autosave: overwrites the live working draft. Optionally renames the project.
 * Validates the schema before persisting so a bad payload can never be stored.
 */
export async function saveProjectSchema(input: {
  id: string
  schema: WebsiteSchema
  name?: string
}): Promise<void> {
  const { db, elevated } = await clientForProject(input.id)
  const parsed = websiteSchema.parse(input.schema)

  // Server-side backstop for the plan page limit: only GROWTH past the limit is
  // refused, so a site already over its limit (downgrade, limit change) can
  // still be saved and edited. Admins editing a tenant's site are exempt.
  if (!elevated) {
    const { data: existing, error: existingErr } = await db
      .from('projects')
      .select('owner_id, schema_data')
      .eq('id', input.id)
      .maybeSingle()
    if (existingErr) throw existingErr
    if (existing) {
      const currentPages = Array.isArray(
        (existing.schema_data as { pages?: unknown } | null)?.pages,
      )
        ? ((existing.schema_data as { pages: unknown[] }).pages.length)
        : 0
      const limit = pageLimitForPlan(await getPlanCodeForUser(existing.owner_id as string))
      if (isPageGrowthBlocked(currentPages, parsed.pages.length, limit)) {
        throw new Error(PAGE_LIMIT_ERROR)
      }
    }
  }

  const patch: Record<string, unknown> = {
    schema_data: parsed,
    updated_at: new Date().toISOString(),
  }
  if (input.name) patch.name = input.name
  // Keep the type in sync with the content. Only ever PROMOTE to `ecommerce`
  // (when the schema has product/category sections) — never demote — so an AI
  // edit that adds a store, or a legacy store that was mis-typed `corporate`,
  // becomes a real e-commerce project on its next save without ever stripping
  // the type (and its catalog/orders) from a site whose sections were
  // momentarily removed.
  if (isStorefront(parsed)) patch.project_type = 'ecommerce'
  const { error } = await db.from('projects').update(patch).eq('id', input.id)
  if (error) throw error
  revalidatePath('/dashboard')
}

/** Manual save: overwrites the draft AND records an immutable version snapshot. */
export async function snapshotProject(input: {
  id: string
  schema: WebsiteSchema
  label?: string
}): Promise<void> {
  const { db } = await clientForProject(input.id)
  const parsed = websiteSchema.parse(input.schema)
  await saveProjectSchema({ id: input.id, schema: parsed })
  const { error } = await db.from('project_versions').insert({
    project_id: input.id,
    schema_data: parsed,
    label: input.label ?? null,
  })
  if (error) throw error
}

/** Deletes a project (cascades to its versions). */
export async function deleteProject(id: string): Promise<void> {
  const { db } = await clientForProject(id)
  const { error } = await db.from('projects').delete().eq('id', id)
  if (error) throw error
  revalidatePath('/dashboard')
}

export type PublishResult =
  | { ok: true; slug: string; publishedAt: string }
  | {
      ok: false
      reason:
        | typeof SITE_LIMIT_ERROR
        | typeof PLAN_REQUIRED_ERROR
        | typeof SUBSCRIPTION_SUSPENDED_ERROR
      used?: number
      total?: number
    }

/**
 * Publishes a project: records a version snapshot of the current draft and
 * points the public slug at it. Assigns a unique slug on first publish and
 * reuses it afterwards. RLS ensures only the owner can publish their project.
 */
export async function publishProject(input: {
  id: string
  schema: WebsiteSchema
  name?: string
}): Promise<PublishResult> {
  const { db, elevated } = await clientForProject(input.id)
  const parsed = websiteSchema.parse(input.schema)

  // Load the row to reuse an existing slug or mint a new one. For an admin
  // editing another tenant's site, `db` is the elevated service-role client.
  const { data: project, error: loadErr } = await db
    .from('projects')
    .select('id, name, slug, published, owner_id')
    .eq('id', input.id)
    .maybeSingle()
  if (loadErr) throw loadErr
  if (!project) throw new Error('NOT_FOUND')

  // Yayınlanabilir site limitini uygula. Zaten yayında olan bir siteyi yeniden
  // yayınlamak limiti tüketmez; bu yüzden yalnızca BAŞKA yayında siteler sayılır.
  // FREE/STARTER için limit 1 olduğundan, bir site zaten yayındayken ikinci
  // siteyi yayına almak engellenir (oluşturma ve düzenleme serbest kalır).
  // The per-plan publish limit applies to the OWNER publishing their own site.
  // An admin publishing another tenant's site (elevated) overrides the limit —
  // it's a back-office action, not the admin consuming their own quota.
  // Giriş yapmak tek başına yayın izni vermez: sunucuda doğrulanmış aktif bir
  // abonelik (FREE dahil, açıkça seçilmiş) olmalı. Sorgu başarısız olursa
  // varsayılan olarak yayına İZİN VERİLMEZ (UNAUTHENTICATED hariç, o yukarı taşınır).
  let currentPlanCode: string | undefined
  if (!elevated) {
    let currentPlan: Awaited<ReturnType<typeof getMyCurrentPlan>> = null
    try {
      currentPlan = await getMyCurrentPlan()
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHENTICATED') throw err
      console.log('[v0] plan lookup failed, denying publish:', err)
    }
    if (!currentPlan) return { ok: false, reason: PLAN_REQUIRED_ERROR }
    if (await isSubscriptionSuspended(project.owner_id as string)) {
      return { ok: false, reason: SUBSCRIPTION_SUSPENDED_ERROR }
    }
    currentPlanCode = currentPlan.code
  }

  if (!project.published && !elevated) {
    const planCode = toPlanCode(currentPlanCode)
    // Admin-granted per-user exception (user_limit_overrides) wins over the plan
    // default while unexpired; active "Ek Site" add-ons are added on top. The
    // plan definition itself is never modified.
    const limit = await getEffectiveSiteLimit(project.owner_id as string, planCode)
    const { count, error: countErr } = await db
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('published', true)
      .neq('id', input.id)
    if (countErr) throw countErr
    // Limit dolu: hata fırlatmak yerine yapılandırılmış sonuç döndürüyoruz;
    // böylece sunucu action hata temizlemesi mesajı bozmadan istemciye ulaşır.
    if ((count ?? 0) >= limit) {
      return { ok: false, reason: SITE_LIMIT_ERROR, used: count ?? 0, total: limit }
    }
  }

  // Persist the draft first so the published snapshot matches what's on screen.
  await saveProjectSchema({ id: input.id, schema: parsed, name: input.name })

  // Record the immutable snapshot that the public page will render.
  const { data: version, error: versionErr } = await db
    .from('project_versions')
    .insert({ project_id: input.id, schema_data: parsed, label: 'published' })
    .select('id')
    .single()
  if (versionErr) throw versionErr

  // Resolve a unique slug (only needed the first time).
  let slug = project.slug as string | null
  if (!slug) {
    const base = slugifyProjectName(input.name || project.name || 'site')
    // Reserved platform subdomains (admin, api, mail, …) may never be handed
    // out as a tenant slug — `<slug>.gloval.site` would otherwise shadow a
    // real platform subdomain. Skip straight to a suffixed candidate instead
    // of trying the bare reserved word first.
    const baseIsReserved = RESERVED_TENANT_SUBDOMAINS.has(base)
    slug = base
    for (let attempt = 0; attempt < 6; attempt++) {
      const candidate =
        attempt === 0 && !baseIsReserved ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
      const { error: updErr } = await db
        .from('projects')
        .update({ slug: candidate })
        .eq('id', input.id)
      if (!updErr) {
        slug = candidate
        break
      }
      // 23505 = unique_violation → try another suffix. Anything else is fatal.
      if ((updErr as { code?: string }).code !== '23505') throw updErr
      if (attempt === 5) throw updErr
    }
  }

  const publishedAt = new Date().toISOString()
  const { error: pubErr } = await db
    .from('projects')
    .update({
      published: true,
      published_at: publishedAt,
      published_version_id: version.id,
      status: 'published',
    })
    .eq('id', input.id)
  if (pubErr) throw pubErr

  // Bridge the generated storefront into the real catalog: any product/
  // category sections in the schema become purchasable `ecommerce_*` rows, so
  // the published site's product cards can open a real detail page, add to the
  // cart and check out. Best-effort — a sync failure must never fail a publish.
  try {
    // Elevated (admin) publishes are not plan-limited; owners are capped at
    // their effective product limit (plan + active "Ek Ürün" add-ons).
    const productLimit = elevated
      ? null
      : await getEffectiveProductLimit(project.owner_id as string, currentPlanCode)
    await syncStoreFromSchema(input.id, project.owner_id as string, parsed, { productLimit })
  } catch (err) {
    console.log('[v0] store sync on publish failed (non-fatal):', err)
  }

  revalidatePath('/dashboard')
  if (slug) revalidatePath(`/site/${slug}`)
  return { ok: true, slug: slug as string, publishedAt }
}

/** Unpublishes a project: the public page 404s but the draft is untouched. */
export async function unpublishProject(id: string): Promise<void> {
  const { db } = await clientForProject(id)
  const { data, error } = await db
    .from('projects')
    .update({ published: false, status: 'draft' })
    .eq('id', id)
    .select('slug')
    .maybeSingle()
  if (error) throw error
  revalidatePath('/dashboard')
  if (data?.slug) revalidatePath(`/site/${data.slug}`)
}

export type PublishedSite = {
  name: string
  schema: WebsiteSchema
  /** Owner's current plan code — used to gate paid features on the public page. */
  ownerPlanCode: string | null
}

/**
 * Public read: fetches a published site by slug via a SECURITY DEFINER RPC.
 * No auth required; the RPC only ever returns published content, never drafts.
 * It also returns the owner's plan code so the public page can gate paid
 * features (e.g. the phone/WhatsApp buttons are hidden on FREE).
 */
export async function getPublishedSite(slug: string): Promise<PublishedSite | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_published_site', { p_slug: slug })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  const parsed = websiteSchema.safeParse(row.schema_data)
  if (!parsed.success) return null
  return {
    name: row.name as string,
    schema: parsed.data,
    ownerPlanCode: (row.owner_plan_code as string | null) ?? null,
  }
}
