import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTransactionalEmail } from '@/lib/notify'
import { buildContactEmail } from '@/lib/site-contact-email'
import { CONTACT_RETENTION_DAYS } from '@/lib/site-contact-form'
import { contactSecret } from '@/lib/site-contact-guard'
import type { ContactDeps, ContactEmailStatus, ContactSite } from '@/lib/site-contact-service'
import { checkRateLimit } from '@/lib/rate-limit'
import { resolveEmailLang } from '@/lib/email/lang'
import { stripSampleContent } from '@/lib/sample-content'
import { websiteSchema } from '@/lib/website-schema'

const TABLE = 'site_contact_messages'

export type ContactMessageRow = {
  id: string
  projectId: string
  siteName: string
  name: string
  email: string
  phone: string | null
  message: string
  emailStatus: ContactEmailStatus
  createdAt: string
}

/** Reads the published snapshot's contact section; unpublished or broken sites yield null. */
async function loadPublishedContactSite(admin: SupabaseClient, slug: string): Promise<ContactSite | null> {
  const { data: project } = await admin
    .from('projects')
    .select('id, name, owner_id, language, published, published_version_id')
    .eq('slug', slug)
    .maybeSingle()
  if (!project || !project.published || !project.published_version_id) return null

  const { data: version } = await admin
    .from('project_versions')
    .select('schema_data')
    .eq('id', project.published_version_id as string)
    .maybeSingle()
  const parsed = websiteSchema.safeParse(version?.schema_data)
  if (!parsed.success) return null

  // Placeholder contact values must never receive visitor messages.
  const published = stripSampleContent(parsed.data)
  const section = published.sections.find((s) => s.type === 'contact') as
    | { email?: string; recipientEmail?: string }
    | undefined
  return {
    projectId: project.id as string,
    ownerId: project.owner_id as string,
    name: project.name as string,
    lang: parsed.data.meta.language || (project.language as string) || 'tr',
    contactEmail: section?.email?.trim() || null,
    recipientEmail: section?.recipientEmail?.trim() || null,
  }
}

export function createContactDeps(admin: SupabaseClient = createAdminClient()): ContactDeps {
  return {
    now: () => Date.now(),
    secret: contactSecret,
    loadSite: (slug) => loadPublishedContactSite(admin, slug),
    ownerEmail: async (ownerId) => {
      const { data } = await admin.auth.admin.getUserById(ownerId)
      return data?.user?.email ?? null
    },
    countRecent: async (filter, sinceMs) => {
      let query = admin
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(sinceMs).toISOString())
      if (filter.projectId) query = query.eq('project_id', filter.projectId)
      if (filter.ipHash) query = query.eq('ip_hash', filter.ipHash)
      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    },
    insert: async (row) => {
      const { data, error } = await admin
        .from(TABLE)
        .insert({
          project_id: row.projectId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          message: row.message,
          ip_hash: row.ipHash,
        })
        .select('id')
        .single()
      if (error || !data) {
        // Postgres error code only (e.g. 42P01 missing table, 23514 check violation): no visitor data.
        console.log('[site-contact] E_INSERT pg=', error?.code ?? 'none')
        return null
      }
      return { id: data.id as string }
    },
    setEmailStatus: async (id, status) => {
      await admin.from(TABLE).update({ email_status: status }).eq('id', id)
    },
    sendEmail: async ({ to, replyTo, site, message }) => {
      const mail = buildContactEmail({
        siteName: site.name,
        lang: resolveEmailLang(site.lang),
        name: message.name,
        email: message.email,
        phone: message.phone,
        message: message.message,
      })
      return sendTransactionalEmail({
        to,
        replyTo,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        fromName: mail.fromName,
      })
    },
    rateLimit: checkRateLimit,
  }
}

/** The owner's messages, newest first. Ownership is re-checked on every call. */
export async function listOwnerContactMessages(
  admin: SupabaseClient,
  ownerId: string,
  limit = 200,
): Promise<ContactMessageRow[]> {
  const { data: projects } = await admin.from('projects').select('id, name').eq('owner_id', ownerId)
  const names = new Map((projects ?? []).map((p) => [p.id as string, p.name as string]))
  if (names.size === 0) return []

  const { data } = await admin
    .from(TABLE)
    .select('id, project_id, name, email, phone, message, email_status, created_at')
    .in('project_id', [...names.keys()])
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []).map((row) => ({
    id: row.id as string,
    projectId: row.project_id as string,
    siteName: names.get(row.project_id as string) ?? '',
    name: row.name as string,
    email: row.email as string,
    phone: (row.phone as string | null) ?? null,
    message: row.message as string,
    emailStatus: row.email_status as ContactEmailStatus,
    createdAt: row.created_at as string,
  }))
}

/**
 * Unread messages across the owner's own sites, for the dashboard badge.
 * Two cheap queries (owner's project ids, then a head-only count on the partial
 * index). Any failure, including the `read_at` column not existing yet, yields 0
 * so the badge simply stays hidden.
 */
export async function countOwnerUnreadContactMessages(
  admin: SupabaseClient,
  ownerId: string,
): Promise<number> {
  try {
    const { data: projects } = await admin.from('projects').select('id').eq('owner_id', ownerId)
    const ids = (projects ?? []).map((p) => p.id as string)
    if (ids.length === 0) return 0
    const { count, error } = await admin
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .in('project_id', ids)
      .is('read_at', null)
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/** Marks every unread message on the owner's sites as read (ownership re-checked). */
export async function markOwnerContactMessagesRead(
  admin: SupabaseClient,
  ownerId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  try {
    const { data: projects } = await admin.from('projects').select('id').eq('owner_id', ownerId)
    const ids = (projects ?? []).map((p) => p.id as string)
    if (ids.length === 0) return
    await admin.from(TABLE).update({ read_at: nowIso }).in('project_id', ids).is('read_at', null)
  } catch {
    // Read state is a convenience; never break the messages page over it.
  }
}

/** Deletes one message, but only when it belongs to one of the owner's projects. */
export async function deleteOwnerContactMessage(
  admin: SupabaseClient,
  ownerId: string,
  messageId: string,
): Promise<boolean> {
  const { data: projects } = await admin.from('projects').select('id').eq('owner_id', ownerId)
  const ids = (projects ?? []).map((p) => p.id as string)
  if (ids.length === 0) return false
  const { data, error } = await admin
    .from(TABLE)
    .delete()
    .eq('id', messageId)
    .in('project_id', ids)
    .select('id')
  return !error && (data?.length ?? 0) > 0
}

/** Daily retention sweep: removes messages older than the retention window. */
export async function sweepOldContactMessages(admin: SupabaseClient, nowMs: number): Promise<number> {
  const cutoff = new Date(nowMs - CONTACT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await admin.from(TABLE).delete().lt('created_at', cutoff).select('id')
  if (error) throw error
  return data?.length ?? 0
}
