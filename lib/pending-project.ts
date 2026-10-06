import type { WebsiteSchema } from '@/lib/website-schema'

/**
 * Client-side handoff for a generated site that needs to survive the auth gate.
 * When a logged-out visitor generates a site and clicks "Save & edit", we stash
 * it here, send them through login, then the dashboard consumes it and creates
 * the real project. This is NOT persistence — it is a one-shot transfer.
 *
 * The stashed payload is only cleared AFTER the project is successfully written
 * to the database, so a failed insert (or an auth-readiness race) never loses
 * the visitor's site — they can retry. Each stash carries a stable idempotency
 * `token` so a double-mount / Strict Mode re-run cannot create duplicates.
 */
const KEY = 'gloval:pending-project'

export type PendingProject = {
  /** Stable idempotency key generated when the site is first stashed. */
  token: string
  name: string
  sector?: string | null
  language: string
  prompt?: string | null
  schema: WebsiteSchema
  /**
   * Set when the visitor was routed through login/sign-up specifically because
   * they clicked Publish while logged out. Once the dashboard finishes
   * creating the real project from this stash, it sends them straight into
   * the editor with `?autopublish=1` so the publish they originally asked for
   * actually completes, instead of just landing back on a draft.
   */
  publishIntent?: boolean
}

function newToken(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // fall through to timestamp-based fallback
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Stashes a pending site. If the payload already carries a token (e.g. it is
 * being re-stashed after a failed create) that token is preserved so retries
 * stay idempotent; otherwise a fresh token is minted.
 */
export function stashPendingProject(p: Omit<PendingProject, 'token'> & { token?: string }) {
  try {
    const withToken: PendingProject = { ...p, token: p.token ?? newToken() }
    sessionStorage.setItem(KEY, JSON.stringify(withToken))
  } catch {
    // sessionStorage unavailable (private mode, etc.) — non-fatal.
  }
}

/**
 * Reads the pending site WITHOUT removing it. The caller must call
 * `clearPendingProject()` only after the DB write succeeds.
 */
export function peekPendingProject(): PendingProject | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingProject
  } catch {
    return null
  }
}

/** Clears the pending site. Call this only after a successful DB write. */
export function clearPendingProject() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // non-fatal
  }
}
