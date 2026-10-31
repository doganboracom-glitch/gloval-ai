import { describe, expect, it, vi } from 'vitest'
import { requestScan, scanStageFor } from '@/lib/ads/scan-client'
import { sampleScanResult } from '@/lib/ads/testing/scan-result-fixture'

const input = { address: 'ornek.com', requestId: 'req-12345678' }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const noSleep = async () => {}

describe('requestScan', () => {
  it('returns the result and sends one POST with the same requestId', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ result: sampleScanResult }))
    const outcome = await requestScan(input, { fetchImpl, sleep: noSleep })
    expect(outcome).toEqual({ ok: true, result: sampleScanResult })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/ads/scan')
    expect(JSON.parse(String(init.body))).toEqual(input)
  })

  it('keeps typed extras from an error body and ignores anything else', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 'credits_required', balance: 1, message: 'ignored', stack: 'x' } }, 402),
    )
    const outcome = await requestScan(input, { fetchImpl, sleep: noSleep })
    expect(outcome).toEqual({ ok: false, error: { code: 'credits_required', balance: 1 } })
  })

  it('preserves the safe adult message variant and drops raw policy evidence', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            code: 'policy_blocked',
            consumed: false,
            messageKey: 'errPolicyBlockedAdultNotConsumed',
            blockedCategories: ['adult'],
            evidenceQuote: 'Seks Shop',
          },
        },
        422,
      ),
    )
    const outcome = await requestScan(input, { fetchImpl, sleep: noSleep })
    expect(outcome).toEqual({
      ok: false,
      error: {
        code: 'policy_blocked',
        consumed: false,
        messageKey: 'errPolicyBlockedAdultNotConsumed',
      },
    })
  })

  it('maps an unknown code or a non-JSON body to service_unavailable', async () => {
    const unknown = vi.fn(async () => jsonResponse({ error: { code: 'weird' } }, 500))
    expect(await requestScan(input, { fetchImpl: unknown, sleep: noSleep })).toEqual({
      ok: false,
      error: { code: 'service_unavailable' },
    })
    const html = vi.fn(async () => new Response('<html>', { status: 502 }))
    expect(await requestScan(input, { fetchImpl: html, sleep: noSleep })).toEqual({
      ok: false,
      error: { code: 'service_unavailable' },
    })
  })

  it('fixes a missing cookie once through the session route, waits, then retries', async () => {
    const sleep = vi.fn(async () => {})
    const calls: string[] = []
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url)
      if (url === '/api/ads/session') return jsonResponse({ ok: true })
      return calls.filter((c) => c === '/api/ads/scan').length === 1
        ? jsonResponse({ error: { code: 'session_required' } }, 428)
        : jsonResponse({ result: sampleScanResult })
    })
    const outcome = await requestScan(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleep })
    expect(outcome.ok).toBe(true)
    expect(calls).toEqual(['/api/ads/scan', '/api/ads/session', '/api/ads/scan'])
    expect(sleep).toHaveBeenCalledWith(2100)
  })

  it('gives up after one session fix when the cookie is still refused', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url === '/api/ads/session' ? jsonResponse({ ok: true }) : jsonResponse({ error: { code: 'session_required' } }, 428),
    )
    const outcome = await requestScan(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })
    expect(outcome).toEqual({ ok: false, error: { code: 'session_required' } })
    expect(fetchImpl.mock.calls.filter(([u]) => u === '/api/ads/session')).toHaveLength(1)
  })

  it('retries a lost response once with the same requestId', async () => {
    let n = 0
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) => {
      n += 1
      if (n === 1) throw new TypeError('network')
      return jsonResponse({ result: sampleScanResult })
    })
    const outcome = await requestScan(input, { fetchImpl: fetchImpl as unknown as typeof fetch, sleep: noSleep })
    expect(outcome.ok).toBe(true)
    const ids = fetchImpl.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).requestId)
    expect(ids).toEqual([input.requestId, input.requestId])
  })

  it('reports duplicate_lost when the retry finds the request already processed', async () => {
    let n = 0
    const fetchImpl = vi.fn(async () => {
      n += 1
      if (n === 1) throw new TypeError('network')
      return jsonResponse({ error: { code: 'duplicate' } }, 409)
    })
    expect(await requestScan(input, { fetchImpl, sleep: noSleep })).toEqual({
      ok: false,
      error: { code: 'duplicate_lost' },
    })
  })

  it('keeps a plain duplicate as duplicate when nothing was lost', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { code: 'duplicate' } }, 409))
    expect(await requestScan(input, { fetchImpl, sleep: noSleep })).toEqual({
      ok: false,
      error: { code: 'duplicate' },
    })
  })

  it('returns network after two lost responses', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network')
    })
    expect(await requestScan(input, { fetchImpl, sleep: noSleep })).toEqual({ ok: false, error: { code: 'network' } })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('scanStageFor', () => {
  it.each([
    [0, 'reading'],
    [7, 'reading'],
    [8, 'planning'],
    [34, 'planning'],
    [35, 'writing'],
    [89, 'writing'],
    [90, 'slow'],
  ])('%is -> %s', (seconds, stage) => {
    expect(scanStageFor(seconds)).toBe(stage)
  })
})
