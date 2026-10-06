import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/mail/admin-guard'

export const dynamic = 'force-dynamic'

const REQUEST_TIMEOUT_MS = 8000

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  await requireAdmin()

  const apiUrl = process.env.MAILCOW_API_URL?.trim().replace(/\/$/, '')
  const apiKey = (process.env.MAILCOW_API_KEY || process.env.API_KEY)?.trim()
  if (!apiUrl || !apiKey) {
    return json({ success: false, configured: false, checkedAt: new Date().toISOString(), error: 'MAILCOW_CONFIGURATION_MISSING' }, 503)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    console.log('[v0] Mailcow health: request started')
    const response = await fetch(`${apiUrl}/api/v1/get/domain/all`, {
      method: 'GET',
      headers: { Accept: 'application/json', 'X-API-Key': apiKey },
      cache: 'no-store',
      signal: controller.signal,
    })
    console.log('[v0] Mailcow health: response status:', response.status)

    if (response.status === 401) {
      return json({
        success: false,
        configured: true,
        mailcow: { connected: true, authenticated: false },
        error: 'MAILCOW_AUTHENTICATION_FAILED',
      }, 502)
    }

    if (response.status === 403) {
      return json({
        success: false,
        configured: true,
        mailcow: { connected: true, authenticated: true },
        error: 'MAILCOW_ACCESS_DENIED',
      }, 502)
    }


    if (!response.ok) {
      return json({
        success: false,
        configured: true,
        mailcow: { connected: true, authenticated: false },
        error: 'MAILCOW_API_FAILED',
      }, 502)
    }

    return json({
      success: true,
      configured: true,
      mailcow: { connected: true, authenticated: true },
    })
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError'
    console.log('[v0] Mailcow health: request failed:', timedOut ? 'timeout' : 'connection error')
    return json({
      success: false,
      configured: true,
      mailcow: { connected: false, authenticated: false },
      error: 'MAILCOW_CONNECTION_FAILED',
    }, 502)
  } finally {
    clearTimeout(timeout)
  }
}
