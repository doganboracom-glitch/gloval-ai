'use client'

import { TransferOutPanel } from './transfer-out-panel'
import type { TransferOutStatus } from '@/lib/custom-domains/registrar/transfer-actions'

type PreviewState = 'locked' | 'window' | 'unlocked'

function buildStatus(state: PreviewState): TransferOutStatus {
  const now = Date.now()
  const activeWindow =
    state === 'window'
      ? {
          id: 'mock-window-id',
          openedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
          relockAt: new Date(now + 18 * 60 * 60 * 1000 + 12 * 60 * 1000).toISOString(),
          extensions: 0,
        }
      : null

  return {
    ok: true,
    supported: true,
    featureEnabled: true,
    locked: state === 'locked' ? true : false,
    expiresAt: new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString(),
    restrictedUntil: null,
    restrictionVerified: true,
    activeAndUnexpired: true,
    liveStatusReadable: true,
    transferState: 'held',
    windowAvailable: true,
    activeWindow,
  }
}

export function TransferWindowPreview({ state }: { state: PreviewState }) {
  const domain = `${state}.preview.example.com`
  let currentState = state
  const actions = {
    getStatus: async (): Promise<TransferOutStatus> => buildStatus(currentState),
    legacyCode: async () => ({ ok: true as const, authCode: 'MOCK-ONLY-CODE' }),
    windowCode: async () => {
      currentState = 'window'
      const status = buildStatus(currentState)
      if (!status.ok || !status.supported || !status.activeWindow) {
        return { ok: false as const, error: 'PROVIDER_ERROR' as const }
      }
      return {
        ok: true as const,
        authCode: 'MOCK-ONLY-TRANSFER-CODE',
        window: status.activeWindow,
        created: state === 'locked',
      }
    },
    extend: async () => {
      const status = buildStatus('window')
      if (!status.ok || !status.supported || !status.activeWindow) {
        return { ok: false as const, error: 'WINDOW_NOT_OPEN' as const }
      }
      return { ok: true as const, window: status.activeWindow }
    },
    relock: async () => {
      currentState = 'locked'
      return { ok: true as const, locked: true as const }
    },
  }

  return <TransferOutPanel domain={domain} actions={actions} />
}
