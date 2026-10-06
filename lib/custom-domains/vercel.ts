/**
 * Thin Vercel Projects-Domains API client.
 *
 * Configuration (all read at call time, never at import, so middleware and
 * tests stay side-effect free):
 *   VERCEL_API_TOKEN  - access token allowed to manage the project's domains
 *   VERCEL_PROJECT_ID - project (id or name) that serves customer domains
 *   VERCEL_TEAM_ID    - optional, when the project belongs to a team
 *
 * When the token or project id is missing, `configured` is false and the rest
 * of the pipeline reports `not_configured` instead of pretending to connect.
 */

export type VercelVerificationChallenge = {
  type: string
  domain: string
  value: string
  reason?: string
}

export type VercelAddResult =
  | {
      ok: true
      verified: boolean
      verification: VercelVerificationChallenge[]
      /** Apex a redirect domain points at, when Vercel reports one. */
      redirect?: string | null
      /** True when the domain was already attached to the project (not created by this call). */
      existing?: boolean
    }
  | {
      ok: false
      code: string
      message: string
      /** HTTP status (0 = no response: timeout or network failure). */
      status?: number
      /**
       * The failure says nothing about the domain itself (timeout, 429, 5xx, or
       * our own credentials being rejected), so callers must not treat it as proof
       * that a previously working domain broke.
       */
      inconclusive?: boolean
    }

export type VercelRemoveResult =
  | { ok: true; alreadyAbsent: boolean }
  | { ok: false; code: string; message: string; status?: number }

export type VercelDomainConfig = {
  misconfigured: boolean
  recommendedIPv4: string[]
  recommendedCNAME: string[]
}

export interface VercelClient {
  readonly configured: boolean
  addDomain(domain: string, options?: { redirectTo?: string }): Promise<VercelAddResult>
  verifyDomain(domain: string): Promise<VercelAddResult>
  getConfig(domain: string): Promise<VercelDomainConfig | null>
  /** Points an already-attached domain's redirect at `redirectTo` (308). */
  setRedirect(domain: string, redirectTo: string): Promise<VercelAddResult>
  /** A 404 counts as success (already detached) so a retried delete converges. */
  removeDomain(domain: string): Promise<VercelRemoveResult>
}

/** Statuses that describe our request/credentials or Vercel's health, not the domain. */
export function isInconclusiveStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status === 401 || status === 403 || status >= 500
}

/**
 * Documented Vercel defaults. Used ONLY to judge whether DNS already points at
 * Vercel when the config API is unavailable. Never shown to customers as
 * records to publish: displayed targets come from `getConfig` exclusively.
 */
export const VERCEL_DEFAULT_A = '76.76.21.21'
export const VERCEL_DEFAULT_CNAME = 'cname.vercel-dns.com'

type ApiError = { error?: { code?: string; message?: string } }

function parseChallenges(body: unknown): VercelVerificationChallenge[] {
  const list = (body as { verification?: unknown })?.verification
  if (!Array.isArray(list)) return []
  return list
    .filter((c): c is VercelVerificationChallenge => !!c && typeof (c as { value?: unknown }).value === 'string')
    .map((c) => ({ type: String(c.type), domain: String(c.domain), value: c.value, reason: c.reason }))
}

function firstValues(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const sorted = [...list].sort(
    (a, b) => ((a as { rank?: number }).rank ?? 99) - ((b as { rank?: number }).rank ?? 99),
  )
  const values: string[] = []
  for (const entry of sorted) {
    const value = (entry as { value?: unknown }).value
    if (typeof value === 'string') values.push(value)
    else if (Array.isArray(value)) values.push(...value.filter((v): v is string => typeof v === 'string'))
  }
  return values
}

export class HttpVercelClient implements VercelClient {
  private get token() {
    return process.env.VERCEL_API_TOKEN
  }
  private get project() {
    return process.env.VERCEL_PROJECT_ID
  }
  private get team() {
    return process.env.VERCEL_TEAM_ID
  }

  get configured(): boolean {
    return Boolean(this.token && this.project)
  }

  private url(path: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams(extra)
    if (this.team) params.set('teamId', this.team)
    const qs = params.toString()
    return `https://api.vercel.com${path}${qs ? `?${qs}` : ''}`
  }

  private async request(method: string, url: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const response = await fetch(url, {
      method,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
      headers: {
        authorization: `Bearer ${this.token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await response.json().catch(() => ({}))
    return { status: response.status, json }
  }

  private toResult(status: number, json: unknown): VercelAddResult {
    if (status >= 200 && status < 300) {
      const redirect = (json as { redirect?: unknown }).redirect
      return {
        ok: true,
        verified: (json as { verified?: boolean }).verified === true,
        verification: parseChallenges(json),
        redirect: typeof redirect === 'string' ? redirect : null,
      }
    }
    const err = (json as ApiError).error
    return {
      ok: false,
      code: err?.code ?? `http_${status}`,
      message: err?.message ?? `Vercel API ${status}`,
      status,
      inconclusive: isInconclusiveStatus(status),
    }
  }

  /** Network/timeout failures become a result instead of an exception. */
  private networkFailure(error: unknown): { ok: false; code: string; message: string; status: 0; inconclusive: true } {
    const message = error instanceof Error ? error.message : 'network error'
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    return { ok: false, code: timedOut ? 'timeout' : 'network_error', message, status: 0, inconclusive: true }
  }

  async addDomain(domain: string, options?: { redirectTo?: string }): Promise<VercelAddResult> {
    const payload: Record<string, unknown> = { name: domain }
    if (options?.redirectTo) {
      payload.redirect = options.redirectTo
      payload.redirectStatusCode = 308
    }
    try {
      const created = await this.request('POST', this.url(`/v10/projects/${encodeURIComponent(this.project!)}/domains`), payload)
      const result = this.toResult(created.status, created.json)
      if (result.ok) return result
      // 5xx/429/auth says nothing about whether it is already attached: do not probe further.
      if (result.inconclusive) return result

      // Already attached to THIS project is success; attached elsewhere is not.
      const existing = await this.request(
        'GET',
        this.url(`/v9/projects/${encodeURIComponent(this.project!)}/domains/${encodeURIComponent(domain)}`),
      )
      if (existing.status === 200) {
        const found = this.toResult(existing.status, existing.json)
        return found.ok ? { ...found, existing: true } : found
      }
      return result
    } catch (error) {
      return this.networkFailure(error)
    }
  }

  async verifyDomain(domain: string): Promise<VercelAddResult> {
    try {
      const res = await this.request(
        'POST',
        this.url(`/v9/projects/${encodeURIComponent(this.project!)}/domains/${encodeURIComponent(domain)}/verify`),
      )
      return this.toResult(res.status, res.json)
    } catch (error) {
      return this.networkFailure(error)
    }
  }

  async setRedirect(domain: string, redirectTo: string): Promise<VercelAddResult> {
    try {
      const res = await this.request(
        'PATCH',
        this.url(`/v9/projects/${encodeURIComponent(this.project!)}/domains/${encodeURIComponent(domain)}`),
        { redirect: redirectTo, redirectStatusCode: 308 },
      )
      return this.toResult(res.status, res.json)
    } catch (error) {
      return this.networkFailure(error)
    }
  }

  async getConfig(domain: string): Promise<VercelDomainConfig | null> {
    const res = await this.request(
      'GET',
      this.url(`/v6/domains/${encodeURIComponent(domain)}/config`, { projectIdOrName: this.project! }),
    )
    if (res.status !== 200) return null
    const json = res.json as { misconfigured?: boolean; recommendedIPv4?: unknown; recommendedCNAME?: unknown }
    return {
      misconfigured: json.misconfigured !== false,
      recommendedIPv4: firstValues(json.recommendedIPv4),
      // Vercel returns FQDNs with a trailing dot; registrars and DoH answers do not use it.
      recommendedCNAME: firstValues(json.recommendedCNAME).map((v) => v.replace(/\.$/, '')),
    }
  }

  async removeDomain(domain: string): Promise<VercelRemoveResult> {
    try {
      const res = await this.request(
        'DELETE',
        this.url(`/v9/projects/${encodeURIComponent(this.project!)}/domains/${encodeURIComponent(domain)}`),
      )
      if (res.status >= 200 && res.status < 300) return { ok: true, alreadyAbsent: false }
      if (res.status === 404) return { ok: true, alreadyAbsent: true }
      const err = (res.json as ApiError).error
      return { ok: false, code: err?.code ?? `http_${res.status}`, message: err?.message ?? `Vercel API ${res.status}`, status: res.status }
    } catch (error) {
      const failure = this.networkFailure(error)
      return { ok: false, code: failure.code, message: failure.message, status: 0 }
    }
  }
}

let client: VercelClient | null = null
export function getVercelClient(): VercelClient {
  return (client ??= new HttpVercelClient())
}
