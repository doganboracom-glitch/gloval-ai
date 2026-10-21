'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireOk, warnOnError } from '@/lib/db-guard'
import { isAdminEmail } from '@/lib/mail/admin-guard'
import { websiteSchema, isStorefront, type WebsiteSchema } from '@/lib/website-schema'
import {
  logSchemaRepair,
  normalizeWebsiteSchema,
  parseWebsiteForSave,
  pickLastValidSchema,
  type SchemaCandidate,
} from '@/lib/website-schema-compat'
import { getMyCurrentPlan, getPlanCodeForUser } from '@/lib/billing'
import { PAGE_LIMIT_ERROR, isPageGrowthBlocked, pageLimitForPlan } from '@/lib/page-limits'
import { countLimitedPages } from '@/lib/section-detail'
import { materializePages, withPageRedirects } from '@/lib/website-pages'
import { getEffectiveSiteLimit, getEffectiveProductLimit } from '@/lib/effective-limits'
import {
  SITE_LIMIT_ERROR,
  PLAN_REQUIRED_ERROR,
  SUBSCRIPTION_SUSPENDED_ERROR,
  canUseVersionHistory,
  toPlanCode,
} from '@/lib/pricing-config'
import { backupIfDue, loadBackupSchema, recordBackup } from '@/lib/project-backups'
import { BACKUP_RESTORE_LIMIT, BACKUP_RESTORE_WINDOW_MS, type BackupItem } from '@/lib/project-backups-core'
import { checkRateLimit } from '@/lib/rate-limit'
import { isSubscriptionSuspended } from '@/lib/billing-lifecycle'
import { syncStoreFromSchema } from '@/lib/store-sync'
import { enqueueLiveBlog, enqueueSitePages } from '@/lib/indexnow-server'
import { scheduleStarterBlog } from '@/lib/starter-blog-server'
import { starterSiteFromSchema } from '@/lib/starter-blog'
import { enforceTrackingPlan, sanitizeTracking } from '@/lib/site-tracking'
import { slugifyProjectName } from '@/lib/slug'
import { commerceModeForNewProject, type CommerceMode } from '@/lib/commerce-mode'
import { isMissingColumnError } from '@/lib/store-schema-compat'
import { RESERVED_TENANT_SUBDOMAINS } from '@/lib/domains'
import {
  CONTACT_ATTESTATION_VERSION,
  SAMPLE_CONTENT_ERROR,
  approveSampleFindings,
  collectBlockingSampleFindings,
  collectSampleFindings,
  resolveDetectedPlaceholders,
  stripSampleContent,
  type SampleItemFinding,
  type SampleSectionFinding,
} from '@/lib/sample-content'
import { loadAttestedDigests, recordAttestations, selectApproved } from '@/lib/content-attestations'
import { getDomainProvider } from '@/lib/custom-domains/provider'

/** Hosts connected to the project; e-mail on them is the owner's own. Fails to none (stricter). */
async function connectedHosts(projectId: string): Promise<string[]> {
  try {
    return (await getDomainProvider().listActiveForProject(projectId)).map((domain) => domain.domain)
  } catch (err) {
    console.log('[v0] connected domain lookup failed, treating as none:', err instanceof Error ? err.message : err)
    return []
  }
}

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
  // A failed read must not look like "not owned": that would send an admin down
  // the elevated path (or a user to a misleading 404) on a transient error.
  const { data: owned } = requireOk(
    'projects.ownership',
    await supabase.from('projects').select('id').eq('id', projectId).maybeSingle(),
  )
  if (owned) return { db: supabase, userId, elevated: false }

  // Not reachable under RLS. Only a verified admin gets elevated; everyone else
  // stays on the session client so the existing 404 / no-op behavior holds.
  if (isAdminEmail(email)) return { db: createAdminClient(), userId, elevated: true }

  return { db: supabase, userId, elevated: false }
}

const HISTORY_PLAN_REQUIRED_ERROR = 'HISTORY_PLAN_REQUIRED'
const DRAFT_CONFLICT_ERROR = 'DRAFT_CONFLICT'

/**
 * Shared server gate for version history and backups: the caller must own the
 * project (or be an allowlisted admin) AND the OWNER's plan must include
 * version history. Throws NOT_FOUND / HISTORY_PLAN_REQUIRED otherwise.
 */
async function requireHistoryAccess(projectId: string) {
  const ctx = await clientForProject(projectId)
  const { data: owned, error } = await ctx.db
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!owned) throw new Error('NOT_FOUND')
  const ownerId = owned.owner_id as string
  if (!ctx.elevated && ownerId !== ctx.userId) throw new Error('NOT_FOUND')
  const plan = toPlanCode(await getPlanCodeForUser(ownerId))
  if (!canUseVersionHistory(plan)) throw new Error(HISTORY_PLAN_REQUIRED_ERROR)
  return { ...ctx, ownerId }
}

/** Best-effort opportunistic backup of the draft; never fails the surrounding save or publish. */
async function backupDraftBestEffort(projectId: string, ownerId: string, schema: WebsiteSchema): Promise<void> {
  try {
    await backupIfDue({ projectId, planCode: await getPlanCodeForUser(ownerId), schema })
  } catch (err) {
    console.log('[v0] opportunistic backup failed (non-fatal):', err instanceof Error ? err.message : err)
  }
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
  const { db } = await requireHistoryAccess(projectId)

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
  /** Only the catalog setup flow passes this (`catalog`); otherwise derived from the project type. */
  commerceMode?: CommerceMode
}): Promise<string> {
  const { supabase, userId } = await requireUser()
  const parsed = parseWebsiteForSave(input.schema)
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
  // The column defaults to `none` (063), so every insert must set it: a store
  // created without it used to read as a non-store and lost its payment,
  // shipping and orders panels.
  const row = {
    owner_id: userId,
    name: input.name || 'Untitled',
    sector: input.sector ?? null,
    // The site's own language wins over the caller's UI language, so an
    // English site created from the Turkish UI is stored (and edited) as English.
    language: parsed.meta.language ?? input.language ?? 'tr',
    prompt: input.prompt ?? null,
    schema_data: parsed,
    status: 'draft',
    project_type: projectType,
  }
  const commerce_mode = commerceModeForNewProject({ projectType, explicit: input.commerceMode })
  let { data, error } = await supabase
    .from('projects')
    .insert({ ...row, commerce_mode })
    .select('id')
    .single()
  if (isMissingColumnError(error)) {
    // Migration 063 not applied yet: getCommerceMode derives from project_type.
    ;({ data, error } = await supabase.from('projects').insert(row).select('id').single())
  }
  if (error || !data) throw error ?? new Error('PROJECT_INSERT_FAILED')
  revalidatePath('/dashboard')
  // First registration of the site: three sector posts are written in the
  // background (free, noindex). Only signed-in owners reach this point.
  scheduleStarterBlog({
    projectId: data.id as string,
    ownerId: userId,
    siteSlug: null,
  site: starterSiteFromSchema(parsed),
  lang: row.language === 'en' ? 'en' : 'tr',
  })
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
  /** When set, the write only lands if the draft's updated_at still equals it (restore uses this). */
  expectedUpdatedAt?: string
}): Promise<void> {
  const { db, elevated } = await clientForProject(input.id)
  let parsed = parseWebsiteForSave(input.schema)

  const { data: existing, error: existingErr } = await db
    .from('projects')
    .select('owner_id, schema_data')
    .eq('id', input.id)
    .maybeSingle()
  if (existingErr) throw existingErr

  // A renamed page leaves a permanent redirect behind so its old URL keeps working.
  const previousPages = (existing?.schema_data as { pages?: Array<{ slug: string; isHome?: boolean }> } | null)?.pages
  parsed = withPageRedirects(materializePages(parsed), previousPages)

  // Server-side backstop for the plan page limit: only GROWTH past the limit is
  // refused, so a site already over its limit (downgrade, limit change) can
  // still be saved and edited. Admins editing a tenant's site are exempt.
  if (!elevated) {
    if (existing) {
      const currentPages = Array.isArray(
        (existing.schema_data as { pages?: unknown } | null)?.pages,
      )
        ? countLimitedPages((existing.schema_data as { pages: Array<{ kind?: string }> }).pages)
        : 0
      const ownerPlan = await getPlanCodeForUser(existing.owner_id as string)
      const limit = pageLimitForPlan(ownerPlan)
      if (isPageGrowthBlocked(currentPages, countLimitedPages(parsed.pages), limit)) {
        throw new Error(PAGE_LIMIT_ERROR)
      }
      // Custom head/body code is a paid feature: FREE keeps whatever is stored.
      parsed = enforceTrackingPlan(
        parsed,
        existing.schema_data as Pick<WebsiteSchema, 'tracking'> | null,
        toPlanCode(ownerPlan),
      )
    }
  }

  if (parsed.tracking) {
    const { tracking: _unsafe, ...withoutTracking } = parsed
    const tracking = sanitizeTracking(parsed.tracking)
    parsed = tracking ? { ...withoutTracking, tracking } : withoutTracking
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
  let update = db.from('projects').update(patch).eq('id', input.id)
  if (input.expectedUpdatedAt) update = update.eq('updated_at', input.expectedUpdatedAt)
  const { data: written, error } = await update.select('id')
  if (error) throw error
  if (input.expectedUpdatedAt && (written?.length ?? 0) === 0) throw new Error(DRAFT_CONFLICT_ERROR)
  revalidatePath('/dashboard')
}

/** Manual save: overwrites the draft AND records an immutable version snapshot. */
export async function snapshotProject(input: {
  id: string
  schema: WebsiteSchema
  label?: string
}): Promise<void> {
  const { db } = await clientForProject(input.id)
  const parsed = parseWebsiteForSave(input.schema)
  await saveProjectSchema({ id: input.id, schema: parsed })
  const { error } = await db.from('project_versions').insert({
    project_id: input.id,
    schema_data: parsed,
    label: input.label ?? null,
  })
  if (error) throw error

  const { data: owner } = warnOnError(
    'projects.backupOwner',
    await db.from('projects').select('owner_id').eq('id', input.id).maybeSingle(),
  )
  if (owner?.owner_id) await backupDraftBestEffort(input.id, owner.owner_id as string, parsed)
}

/** Backups listed in the editor's "Yedekler" section, newest first. Owner + plan gated. */
export async function listProjectBackups(projectId: string): Promise<BackupItem[]> {
  const { db } = await requireHistoryAccess(projectId)
  const { data, error } = await db
    .from('project_backups')
    .select('id, kind, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return (data as BackupItem[]) ?? []
}

export type RestoreBackupResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'RATE_LIMITED'
        | 'BACKUP_NOT_FOUND'
        | 'INVALID_BACKUP'
        | 'PAGE_LIMIT_REACHED'
        | 'PRE_RESTORE_FAILED'
        | 'HISTORY_PLAN_REQUIRED'
        | 'DRAFT_CHANGED'
      retryAfterSeconds?: number
      limit?: number
    }

/**
 * Restores a backup into the DRAFT only (`projects.schema_data`). The published
 * site (published_version_id / project_versions) is never touched: the owner
 * must publish again to make restored content live. Before overwriting, the
 * current draft is saved as a `pre_restore` backup; if that fails, nothing is restored.
 */
export async function restoreProjectBackup(input: {
  projectId: string
  backupId: string
  /** The draft's updated_at as the editor last saw it; a newer draft aborts the restore. */
  expectedUpdatedAt?: string
}): Promise<RestoreBackupResult> {
  let access: Awaited<ReturnType<typeof requireHistoryAccess>>
  try {
    access = await requireHistoryAccess(input.projectId)
  } catch (err) {
    if (err instanceof Error && err.message === HISTORY_PLAN_REQUIRED_ERROR) {
      return { ok: false, reason: 'HISTORY_PLAN_REQUIRED' }
    }
    throw err
  }
  const { db, userId, elevated } = access

  const limited = checkRateLimit(`backup-restore:${userId}`, BACKUP_RESTORE_LIMIT, BACKUP_RESTORE_WINDOW_MS)
  if (!limited.allowed) {
    return { ok: false, reason: 'RATE_LIMITED', retryAfterSeconds: Math.ceil(limited.retryAfterMs / 1000) }
  }

  const { data: exists } = requireOk(
    'projects.restoreBackupExists',
    await db
      .from('project_backups')
      .select('id')
      .eq('id', input.backupId)
      .eq('project_id', input.projectId)
      .maybeSingle(),
  )
  if (!exists) return { ok: false, reason: 'BACKUP_NOT_FOUND' }

  const restored = await loadBackupSchema(input.projectId, input.backupId)
  if (!restored) return { ok: false, reason: 'INVALID_BACKUP' }

  const { data: current, error: currentErr } = await db
    .from('projects')
    .select('schema_data, updated_at')
    .eq('id', input.projectId)
    .maybeSingle()
  if (currentErr || !current) throw currentErr ?? new Error('NOT_FOUND')
  const draftUpdatedAt = current.updated_at as string
  if (input.expectedUpdatedAt && input.expectedUpdatedAt !== draftUpdatedAt) {
    return { ok: false, reason: 'DRAFT_CHANGED' }
  }

  // Same rule as saving: only GROWTH past the plan's page limit is refused.
  if (!elevated) {
    const currentPages = countLimitedPages((current.schema_data as { pages?: Array<{ kind?: string }> } | null)?.pages ?? [])
    const limit = pageLimitForPlan(await getPlanCodeForUser(access.ownerId))
    if (isPageGrowthBlocked(currentPages, countLimitedPages(restored.pages), limit)) {
      return { ok: false, reason: 'PAGE_LIMIT_REACHED', limit }
    }
  }

  const currentParsed = websiteSchema.safeParse(current.schema_data)
  try {
    if (currentParsed.success) {
      await recordBackup({ projectId: input.projectId, kind: 'pre_restore', schema: currentParsed.data })
    } else {
      // A draft that no longer parses cannot be restored from, so keep the raw copy out of
      // the backup and refuse rather than silently lose it.
      return { ok: false, reason: 'PRE_RESTORE_FAILED' }
    }
  } catch (err) {
    console.log('[v0] pre_restore backup failed, aborting restore:', err instanceof Error ? err.message : err)
    return { ok: false, reason: 'PRE_RESTORE_FAILED' }
  }

  try {
    await saveProjectSchema({ id: input.projectId, schema: restored, expectedUpdatedAt: draftUpdatedAt })
  } catch (err) {
    if (err instanceof Error && err.message === PAGE_LIMIT_ERROR) {
      return { ok: false, reason: 'PAGE_LIMIT_REACHED' }
    }
    if (err instanceof Error && err.message === DRAFT_CONFLICT_ERROR) {
      return { ok: false, reason: 'DRAFT_CHANGED' }
    }
    throw err
  }
  return { ok: true }
}

export type RestoreLastValidResult =
  | { ok: true }
  | { ok: false; reason: 'NO_VALID_VERSION' | 'RATE_LIMITED' }

/**
 * Recovery for a draft that can no longer be opened: replaces it with the
 * newest saved snapshot (published versions and backups) that still reads as a
 * valid site. Deliberately not plan-gated, since the owner has no other way in.
 * The unreadable draft is overwritten only after a readable replacement exists,
 * and the published site is never touched.
 */
export async function restoreLastValidVersion(projectId: string): Promise<RestoreLastValidResult> {
  const { db, userId, elevated } = await clientForProject(projectId)

  const { data: project, error: projectErr } = await db
    .from('projects')
    .select('id, owner_id, language')
    .eq('id', projectId)
    .maybeSingle()
  if (projectErr) throw projectErr
  if (!project) throw new Error('NOT_FOUND')
  if (!elevated && project.owner_id !== userId) throw new Error('NOT_FOUND')

  const limited = checkRateLimit(`last-valid-restore:${userId}`, BACKUP_RESTORE_LIMIT, BACKUP_RESTORE_WINDOW_MS)
  if (!limited.allowed) return { ok: false, reason: 'RATE_LIMITED' }

  const [versions, backups] = await Promise.all([
    db
      .from('project_versions')
      .select('schema_data, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(30),
    // Ownership was verified above, so the admin client is used only to read this project's backups.
    createAdminClient()
      .from('project_backups')
      .select('schema_data, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  if (versions.error) throw versions.error
  if (backups.error) throw backups.error

  const restored = pickLastValidSchema(
    [...(versions.data ?? []), ...(backups.data ?? [])] as SchemaCandidate[],
    project.language === 'en' ? 'en' : 'tr',
  )
  if (!restored) return { ok: false, reason: 'NO_VALID_VERSION' }

  const { error: updateErr } = await db
    .from('projects')
    .update({ schema_data: materializePages(restored), updated_at: new Date().toISOString() })
    .eq('id', projectId)
  if (updateErr) throw updateErr

  revalidatePath(`/editor/${projectId}`)
  revalidatePath('/dashboard')
  return { ok: true }
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
  | {
      /** AI-generated sample content is still unapproved; nothing was published. */
      ok: false
      reason: typeof SAMPLE_CONTENT_ERROR
      sections: SampleSectionFinding[]
      /** The owner's approval could not be stored, so nothing was published. */
      attestationFailed?: boolean
    }

/**
 * Publishes a project: records a version snapshot of the current draft and
 * points the public slug at it. Assigns a unique slug on first publish and
 * reuses it afterwards. RLS ensures only the owner can publish their project.
 *
 * Server-side sample-content gate: every publish path (editor button,
 * `?autopublish=1`, direct action calls) lands here, so a site that still
 * contains `sample: true` sections/items is refused with `SAMPLE_CONTENT`
 * unless the owner approved each item. `approvals` carries the content digests
 * (see `lib/sample-content.ts`) approved in this request; they are only honoured
 * when they match a current finding, and are stored as attestations.
 */
export async function publishProject(input: {
  id: string
  schema: WebsiteSchema
  name?: string
  approvals?: string[]
  /** Digests of detected contact values the owner confirmed are real. */
  confirmedReal?: string[]
}): Promise<PublishResult> {
  const { db, elevated, userId } = await clientForProject(input.id)
  const requested = parseWebsiteForSave(input.schema)

  // Load the row to reuse an existing slug or mint a new one. For an admin
  // editing another tenant's site, `db` is the elevated service-role client.
  const { data: project, error: loadErr } = await db
    .from('projects')
    .select('id, name, slug, published, published_at, language, owner_id')
    .eq('id', input.id)
    .maybeSingle()
  if (loadErr) throw loadErr
  if (!project) throw new Error('NOT_FOUND')
  const firstPublish = !project.published && !project.published_at

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
    // Limit dolu: hata firlatmak yerine yapilandirilmis sonuc donduruyoruz;
    // boylece sunucu action hata temizlemesi mesaji bozmadan istemciye ulasir.
    if ((count ?? 0) >= limit) {
      return { ok: false, reason: SITE_LIMIT_ERROR, used: count ?? 0, total: limit }
    }
  }

  // Sample-content gate. Runs after the billing checks (so a payment redirect
  // wins) and before anything is persisted or published.
  // Contact placeholders are listed here too, but they are never "approved as
  // real": the owner either fixes them or acknowledges that they publish empty
  // (their digest in `approvals`). They are stripped from the public site either way.
  //
  // Contact-like values are also matched by content (known fake patterns). For
  // those `detected` items an id in `approvals` means "hide it" and an id in
  // `confirmedReal` means "this is real" (stored as a contact attestation).
  const detection = { ownDomains: await connectedHosts(input.id) }
  const allFindings = collectSampleFindings(requested, detection)
  const findings = collectBlockingSampleFindings(requested, detection)
  const detectedItems = allFindings.flatMap((section) =>
    section.items.filter((item) => item.detected).map((item) => ({ sectionType: section.sectionType, item })),
  )
  let parsed = requested
  if (allFindings.length > 0) {
    const attested = findings.length > 0 ? await loadAttestedDigests(input.id) : new Set<string>()
    const contactAttested =
      detectedItems.length > 0 ? await loadAttestedDigests(input.id, CONTACT_ATTESTATION_VERSION) : new Set<string>()
    const requestedIds = new Set(input.approvals ?? [])
    const confirmedIds = new Set(input.confirmedReal ?? [])
    const isReal = (item: SampleItemFinding) =>
      item.confirmable !== false && (confirmedIds.has(item.id) || contactAttested.has(item.id))
    const unresolved = allFindings
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.detected) return !isReal(item) && !requestedIds.has(item.id)
          return section.sectionType === 'contact'
            ? !requestedIds.has(item.id)
            : !attested.has(item.id) && !requestedIds.has(item.id)
        }),
      }))
      .filter((section) => section.items.length > 0)
    if (unresolved.length > 0) return { ok: false, reason: SAMPLE_CONTENT_ERROR, sections: unresolved }

    const fresh = selectApproved(findings, requestedIds).filter(({ item }) => !attested.has(item.id))
    const freshReal = detectedItems.filter(({ item }) => item.confirmable !== false && confirmedIds.has(item.id) && !contactAttested.has(item.id))
    try {
      await recordAttestations({ projectId: input.id, userId, approvals: fresh })
      await recordAttestations({
        projectId: input.id,
        userId,
        approvals: freshReal,
        statementVersion: CONTACT_ATTESTATION_VERSION,
      })
    } catch (err) {
      // Fail closed: an approval that cannot be recorded is not an approval.
      // Nothing is saved or published; hiding the sections still works because
      // hidden sections are never findings and need no attestation.
      console.log('[v0] attestation could not be stored, refusing publish:', err instanceof Error ? err.message : err)
      return { ok: false, reason: SAMPLE_CONTENT_ERROR, sections: allFindings, attestationFailed: true }
    }
    const detectedIds = new Set(detectedItems.map(({ item }) => item.id))
    const realIds = new Set(detectedItems.filter(({ item }) => isReal(item)).map(({ item }) => item.id))
    const hideIds = new Set([...requestedIds].filter((id) => detectedIds.has(id) && !realIds.has(id)))
    const resolved = resolveDetectedPlaceholders(requested, { hide: hideIds, real: realIds }, detection)
    // Approved items are the owner's content from here on: drop their flag.
    parsed = approveSampleFindings(resolved, new Set([...attested, ...[...requestedIds].filter((id) => !detectedIds.has(id))]))
  }

  // Persist the draft first so the published snapshot matches what's on screen.
  await saveProjectSchema({ id: input.id, schema: parsed, name: input.name })

  // Record the immutable snapshot that the public page will render.
  const { data: version, error: versionErr } = await db
    .from('project_versions')
    // The draft keeps placeholder contact values for the editor; the immutable
    // public snapshot never carries them.
    .insert({ project_id: input.id, schema_data: stripSampleContent(parsed), label: 'published' })
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

  await backupDraftBestEffort(input.id, project.owner_id as string, parsed)

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
  if (slug) {
    revalidatePath(`/site/${slug}`, 'layout')
    // Queued for the next cron run; never blocks or fails a publish.
    void enqueueSitePages(input.id, slug, parsed, 'site:publish')
    void enqueueLiveBlog(input.id, slug, 'site:publish')
    // Three general starter posts, written once in the background (noindex until personalised).
    if (firstPublish) {
      scheduleStarterBlog({
        projectId: input.id,
        ownerId: project.owner_id as string,
        siteSlug: slug,
  site: starterSiteFromSchema(parsed),
  lang: project.language === 'en' ? 'en' : 'tr',
      })
    }
  }
  return { ok: true, slug: slug as string, publishedAt }
}

/** Unpublishes a project: the public page 404s but the draft is untouched. */
export async function unpublishProject(id: string): Promise<void> {
  const { db } = await clientForProject(id)
  const { data, error } = await db
    .from('projects')
    .update({ published: false, status: 'draft' })
    .eq('id', id)
    .select('slug, schema_data')
    .maybeSingle()
  if (error) throw error
  revalidatePath('/dashboard')
  if (data?.slug) {
    revalidatePath(`/site/${data.slug}`, 'layout')
    const schema = websiteSchema.safeParse(data.schema_data)
    if (schema.success) void enqueueSitePages(id, data.slug as string, schema.data, 'site:unpublish')
    void enqueueLiveBlog(id, data.slug as string, 'site:unpublish')
  }
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
  const normalized = normalizeWebsiteSchema(row.schema_data)
  if (!normalized.ok) return null
  logSchemaRepair('published', normalized.steps)
  return {
    name: row.name as string,
    // Every public render (tenant subdomain, custom domain, store pages) reads
    // through here, so unapproved sample content can never reach a visitor.
    // Sites without sample flags come back untouched (same object).
    schema: stripSampleContent(normalized.value),
    ownerPlanCode: (row.owner_plan_code as string | null) ?? null,
  }
}
