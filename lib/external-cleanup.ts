import type { createAdminClient } from '@/lib/supabase/admin'
import { getVercelClient } from '@/lib/custom-domains/vercel'

/**
 * Cleanup of everything outside the database that a deleted site or account
 * leaves behind (storage objects, hosting domains). Shared by account deletion
 * (`lib/account.ts`) and single-site deletion (`deleteProject`) so both remove
 * exactly the same kinds of things in exactly the same way.
 *
 * Every step is independent and failure-tolerant: the rows are already gone by
 * the time these run, so a failure is logged for follow-up and never reported
 * to the user as a failed deletion.
 */

export type Admin = ReturnType<typeof createAdminClient>
export type CleanupStep = [name: string, run: () => Promise<unknown>]

export const SITE_BUCKET = 'site-images'

/** Hostnames the platform itself serves; never detached from hosting by a cleanup. */
const PROTECTED_DOMAINS = new Set(['gloval.ai', 'gloval.site', 'dbajans.com.tr'])

export function isProtectedDomain(domain: string): boolean {
  const bare = domain.toLowerCase().replace(/^www\./, '')
  return PROTECTED_DOMAINS.has(bare) || bare.endsWith('.gloval.site') || bare.endsWith('.gloval.ai')
}

/**
 * Reduces a Postgres/PostgREST/Auth/hosting error to the fields that identify WHY
 * it failed (SQLSTATE, table, column, constraint) without `details`/`hint`, which
 * embed the offending row's values and would leak personal data into logs.
 */
export function describeError(error: unknown) {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; status?: unknown; name?: unknown }
  const message = typeof e.message === 'string' ? e.message : ''
  const pick = (re: RegExp) => re.exec(message)?.[1] ?? null
  return {
    code: typeof e.code === 'string' ? e.code : null,
    status: typeof e.status === 'number' ? e.status : null,
    name: typeof e.name === 'string' ? e.name : null,
    table: pick(/(?:of relation|on table|relation) "([^"]+)"/),
    column: pick(/column "([^"]+)"/),
    constraint: pick(/constraint "([^"]+)"/),
  }
}

const MAX_STORAGE_PAGES = 50

/** Removes every object directly under `prefix`, paging past the 1000-item list limit. */
export async function removeStoragePrefix(admin: Admin, bucket: string, prefix: string) {
  for (let page = 0; page < MAX_STORAGE_PAGES; page++) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
    if (error) throw error
    const paths = (data ?? []).map((o) => `${prefix}/${o.name}`)
    if (paths.length === 0) return
    const { error: removeError } = await admin.storage.from(bucket).remove(paths)
    if (removeError) throw removeError
  }
}

/** Storage objects that belong to ONE site (product photos and AI image candidates). */
export function siteAssetSteps(admin: Admin, projectId: string): CleanupStep[] {
  return [
    [`products/${projectId}`, () => removeStoragePrefix(admin, SITE_BUCKET, `products/${projectId}`)],
    [`ai-candidates/${projectId}`, () => removeStoragePrefix(admin, SITE_BUCKET, `ai-candidates/${projectId}`)],
  ]
}

/**
 * One step per custom domain: detaches the apex and `www` host from the hosting
 * project. Both hosts are always attempted; the step fails if either failed. A
 * host that is already absent counts as success, so a retry converges.
 * `onDetached` runs only after both hosts are gone.
 */
export function hostingDetachSteps(domains: string[], onDetached?: (domain: string) => Promise<unknown>): CleanupStep[] {
  const unique = [...new Set(domains.map((d) => d.toLowerCase().replace(/^www\./, '')).filter(Boolean))]
  const detachable = unique.filter((d) => !isProtectedDomain(d))
  if (detachable.length === 0) return []

  const hosting = getVercelClient()
  return detachable.map((domain): CleanupStep => [
    'hosting-domain',
    async () => {
      let failure: unknown = null
      for (const host of [`www.${domain}`, domain]) {
        const result = await hosting.removeDomain(host)
        if (!result.ok) failure ??= { code: result.code, status: result.status, message: result.message }
      }
      if (failure) throw failure
      await onDetached?.(domain)
    },
  ])
}

/** Runs every step, logging (never throwing) failures. Returns the names of the failed steps. */
export async function runCleanupSteps(logTag: string, steps: CleanupStep[]): Promise<string[]> {
  const failed: string[] = []
  for (const [step, run] of steps) {
    try {
      await run()
    } catch (error) {
      const name = step.replace(/[0-9a-f-]{36}/gi, ':id')
      failed.push(name)
      console.error(`${logTag} cleanup step failed`, { step: name, ...describeError(error) })
    }
  }
  return failed
}
