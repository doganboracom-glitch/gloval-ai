import dns from 'node:dns/promises'
import { NextResponse } from 'next/server'
import { requireAdminResponse } from '@/lib/mail/admin-guard'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

const REQUEST_TIMEOUT_MS = 1800
const TOTAL_TIMEOUT_MS = 7000

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const error = new Error('operation timed out')
      error.name = 'AbortError'
      reject(error)
    }, timeoutMs)
    operation.then(resolve, reject).finally(() => clearTimeout(timeout))
  })
}

type DiagnosticStatus = 'PASS' | 'FAIL' | 'NOT REACHED'

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function errorKind(error: unknown) {
  if (!(error instanceof Error)) return 'unknown'
  if (error.name === 'AbortError') return 'timeout'
  const directCode = (error as Error & { code?: string }).code
  const cause = error.cause as { code?: string } | undefined
  const code = directCode ?? cause?.code
  if (code === 'ECONNREFUSED') return 'connection_refused'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return code.toLowerCase()
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') return 'tls_error'
  return 'connection_error'
}

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await withTimeout(
      fetch(url, { ...init, cache: 'no-store', signal: controller.signal }),
      timeoutMs,
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  const denied = await withTimeout(requireAdminResponse(), REQUEST_TIMEOUT_MS).catch(() =>
    json({ success: false, error: 'DIAGNOSTIC_AUTHORIZATION_FAILED' }, 401),
  )
  if (denied) return denied

  const rawUrl = process.env.MAILCOW_API_URL?.trim().replace(/\/$/, '')
  const apiKey = (process.env.MAILCOW_API_KEY || process.env.API_KEY)?.trim()
  const checkedAt = new Date().toISOString()
  const deadline = Date.now() + TOTAL_TIMEOUT_MS

  const remainingTimeout = () => Math.max(250, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()))

  if (!rawUrl) {
    return json({
      success: false,
      configured: false,
      checkedAt,
      target: null,
      dns: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      httpsConnection: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      httpResponse: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      mailcow: { reached: false, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_API_URL_MISSING',
    }, 200)
  }

  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return json({
      success: false,
      configured: Boolean(apiKey),
      checkedAt,
      target: rawUrl,
      dns: { status: 'FAIL' satisfies DiagnosticStatus, error: 'invalid_url' },
      httpsConnection: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      httpResponse: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      mailcow: { reached: false, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_API_URL_INVALID',
    }, 200)
  }

  let resolved: { address: string; family: number }
  try {
    resolved = await withTimeout(dns.lookup(target.hostname), REQUEST_TIMEOUT_MS)
  } catch (error) {
    return json({
      success: false,
      configured: Boolean(apiKey),
      checkedAt,
      target: rawUrl,
      dns: { status: 'FAIL' satisfies DiagnosticStatus, error: errorKind(error) },
      httpsConnection: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      httpResponse: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      mailcow: { reached: false, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_DNS_FAILED',
    }, 200)
  }

  const apiPath = '/api/v1/get/domain/all'
  const probeUrl = `${rawUrl}${apiPath}`
  let probeResponse: Response
  try {
    probeResponse = await fetchWithTimeout(probeUrl, remainingTimeout(), { headers: { Accept: 'application/json' } })
  } catch (error) {
    const kind = errorKind(error)
    return json({
      success: false,
      configured: Boolean(apiKey),
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, hostname: target.hostname, address: resolved.address, family: resolved.family },
      httpsConnection: { status: 'FAIL' satisfies DiagnosticStatus, error: kind },
      httpResponse: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      mailcow: { reached: false, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_CONNECTION_FAILED',
    }, 200)
  }

  if (!apiKey) {
    return json({
      success: false,
      configured: false,
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, hostname: target.hostname, address: resolved.address, family: resolved.family },
      httpsConnection: { status: 'PASS' satisfies DiagnosticStatus },
      httpResponse: { status: 'PASS' satisfies DiagnosticStatus, statusCode: probeResponse.status },
      mailcow: { reached: true, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_API_KEY_MISSING',
    }, 200)
  }

  let authResponse: Response
  try {
    authResponse = await fetchWithTimeout(probeUrl, remainingTimeout(), {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
    })
  } catch (error) {
    return json({
      success: false,
      configured: true,
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, hostname: target.hostname, address: resolved.address, family: resolved.family },
      httpsConnection: { status: 'PASS' satisfies DiagnosticStatus },
      httpResponse: { status: 'PASS' satisfies DiagnosticStatus, statusCode: probeResponse.status },
      mailcow: { reached: true, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: `MAILCOW_AUTH_REQUEST_${errorKind(error).toUpperCase()}`,
    }, 200)
  }

  const authentication: DiagnosticStatus = authResponse.ok
    ? 'PASS'
    : authResponse.status === 401 || authResponse.status === 403
      ? 'FAIL'
      : 'NOT REACHED'

  return json({
    success: authentication === 'PASS',
    configured: true,
    checkedAt,
    target: rawUrl,
    dns: { status: 'PASS' satisfies DiagnosticStatus, hostname: target.hostname, address: resolved.address, family: resolved.family },
    httpsConnection: { status: 'PASS' satisfies DiagnosticStatus },
    httpResponse: { status: 'PASS' satisfies DiagnosticStatus, statusCode: authResponse.status },
    mailcow: {
      reached: true,
      authentication,
      ...(authentication === 'FAIL' ? { authenticationStatusCode: authResponse.status } : {}),
    },
    error: authentication === 'PASS' ? null : 'MAILCOW_AUTHENTICATION_FAILED',
  }, authentication === 'PASS' ? 200 : 502)
}
