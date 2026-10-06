import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Server-only admin gate for the mail management area.
 *
 * Admin status comes from an `ADMIN_EMAILS` allowlist rather than a database
 * column, because no role column was confirmed to exist on `profiles` and this
 * module is explicitly not allowed to run schema discovery or migrations.
 * Swapping to a DB-backed role later means changing only `isAdminEmail`.
 *
 * `ADMIN_EMAILS` is deliberately NOT `NEXT_PUBLIC_*`: the allowlist must never
 * reach the browser bundle.
 */

/** Strip surrounding quotes/whitespace that dashboard-pasted values often carry. */
function normalizeEmail(value: string): string {
  return value
    .trim()
    .replace(/^["']+|["']+$/g, '') // strip wrapping quotes
    .trim()
    .toLowerCase()
}

function allowlist(): string[] {
  // Accept comma, semicolon, or whitespace/newline separated lists, and tolerate
  // a value that was pasted with wrapping quotes (e.g. "a@b.com,c@d.com").
  const raw = (process.env.ADMIN_EMAILS ?? '').replace(/^["']+|["']+$/g, '')
  return raw
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const list = allowlist()
  // An empty allowlist grants nobody access. Failing closed is the only safe
  // default for an unconfigured admin area.
  if (list.length === 0) return false
  return list.includes(normalizeEmail(email))
}

/**
 * Resolve the caller and assert they are an admin.
 *
 * Non-admins (including signed-out visitors) get a 404 rather than a redirect
 * or a 403, so the existence of the admin area is not disclosed to people who
 * may not have it.
 */
export async function requireAdmin(): Promise<{ userId: string; email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user || !isAdminEmail(user.email)) notFound()

  return { userId: user.id, email: user.email ?? '' }
}

/** Non-throwing variant, for conditionally rendering an admin entry point. */
export async function checkIsAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return isAdminEmail(user?.email)
}
