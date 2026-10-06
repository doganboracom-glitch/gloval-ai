import dns from 'node:dns/promises'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/mail/admin-guard'

export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 8000

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
  const cause = error.cause as { code?: string } | undefined
  const code = cause?.code
  if (code === 'ECONNREFUSED') return 'connection_refused'
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns_error'
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT') return 'tls_error'
  return 'connection_error'
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  await requireAdmin()

  const rawUrl = process.env.MAILCOW_API_URL?.trim().replace(/\/$/, '')
  const apiKey = (process.env.MAILCOW_API_KEY || process.env.API_KEY)?.trim()
  const checkedAt = new Date().toISOString()

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
    }, 503)
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
    }, 503)
  }

  let resolvedAddress: string
  try {
    const result = await dns.lookup(target.hostname)
    resolvedAddress = result.address
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
    }, 502)
  }

  const apiPath = '/api/v1/get/domain/all'
  const probeUrl = `${rawUrl}${apiPath}`
  let probeResponse: Response
  try {
    probeResponse = await fetchWithTimeout(probeUrl, { headers: { Accept: 'application/json' } })
  } catch (error) {
    const kind = errorKind(error)
    return json({
      success: false,
      configured: Boolean(apiKey),
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, address: resolvedAddress },
      httpsConnection: { status: 'FAIL' satisfies DiagnosticStatus, error: kind },
      httpResponse: { status: 'NOT REACHED' satisfies DiagnosticStatus },
      mailcow: { reached: false, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_CONNECTION_FAILED',
    }, 502)
  }

  if (!apiKey) {
    return json({
      success: false,
      configured: false,
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, address: resolvedAddress },
      httpsConnection: { status: 'PASS' satisfies DiagnosticStatus },
      httpResponse: { status: 'PASS' satisfies DiagnosticStatus, statusCode: probeResponse.status },
      mailcow: { reached: true, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: 'MAILCOW_API_KEY_MISSING',
    }, 503)
  }

  let authResponse: Response
  try {
    authResponse = await fetchWithTimeout(probeUrl, {
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
    })
  } catch (error) {
    return json({
      success: false,
      configured: true,
      checkedAt,
      target: rawUrl,
      dns: { status: 'PASS' satisfies DiagnosticStatus, address: resolvedAddress },
      httpsConnection: { status: 'PASS' satisfies DiagnosticStatus },
      httpResponse: { status: 'PASS' satisfies DiagnosticStatus, statusCode: probeResponse.status },
      mailcow: { reached: true, authentication: 'NOT REACHED' satisfies DiagnosticStatus },
      error: `MAILCOW_AUTH_REQUEST_${errorKind(error).toUpperCase()}`,
    }, 502)
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
    dns: { status: 'PASS' satisfies DiagnosticStatus, address: resolvedAddress },
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
