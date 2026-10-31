'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'
import type { PublicScanResult } from '@/lib/ads/scan-orchestrator'
import {
  ADS_SESSION_PATH,
  requestScan,
  scanStageFor,
  type ClientScanError,
  type ClientScanOutcome,
  type ScanStage,
} from '@/lib/ads/scan-client'

export type AdsScanState =
  | { phase: 'idle' }
  | { phase: 'busy'; stage: ScanStage }
  | { phase: 'done'; result: PublicScanResult }
  | { phase: 'error'; error: ClientScanError }

async function ensureSession(url: string) {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  return response.ok
}

type ScanRunner = (input: { address: string; requestId: string }) => Promise<ClientScanOutcome>

/**
 * Drives one scan at a time. The anonymous cookie is requested as soon as the
 * page mounts so the first submission is never rejected for cookie age. Each
 * attempt gets its own requestId, held in a ref so a double click reuses it.
 */
export function useAdsScan(runner: ScanRunner = requestScan) {
  useSWR(ADS_SESSION_PATH, ensureSession, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
  })

  const [state, setState] = useState<AdsScanState>({ phase: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const requestIdRef = useRef<string | null>(null)
  const busy = state.phase === 'busy'

  useEffect(() => {
    if (!busy) return
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [busy])

  const start = useCallback(
    async (address: string) => {
      if (requestIdRef.current) return
      const requestId = crypto.randomUUID()
      requestIdRef.current = requestId
      setElapsed(0)
      setState({ phase: 'busy', stage: 'reading' })
      try {
        const outcome = await runner({ address, requestId })
        setState(outcome.ok ? { phase: 'done', result: outcome.result } : { phase: 'error', error: outcome.error })
      } catch {
        setState({ phase: 'error', error: { code: 'network' } })
      } finally {
        requestIdRef.current = null
      }
    },
    [runner],
  )

  const reset = useCallback(() => setState({ phase: 'idle' }), [])

  const view: AdsScanState = state.phase === 'busy' ? { phase: 'busy', stage: scanStageFor(elapsed) } : state
  return { state: view, start, reset }
}
