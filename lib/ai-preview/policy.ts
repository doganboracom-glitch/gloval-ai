/**
 * Credit and UI rules of the AI image preview flow. Pure and client-safe, so
 * the server enforces exactly what the panel shows.
 *
 *  a) Every ACCOUNT has one free preview; it is consumed the moment the first
 *     preview is produced (closing it unused never gives it back).
 *  b) Free session: the preview is free, "Kullan" costs 2, closing is free.
 *  c) After the free preview, every NEW preview costs 2 when it is produced;
 *     "Kullan" in that session costs nothing more.
 *  d) "Yeniden üret" costs 1 per successful press, in both kinds of session.
 *  e) A failed or rejected generation never charges and never uses the free preview.
 */
export const PREVIEW_COSTS = { newPreview: 2, regenerate: 1, useFree: 2 } as const

/** How long a preview can be recovered after a page refresh. */
export const PREVIEW_TTL_MS = 30 * 60 * 1000

export type PreviewKind = 'free' | 'paid'
export type PreviewStatus =
  | 'generating'
  | 'open'
  | 'regenerating'
  | 'used'
  | 'discarded'
  | 'expired'

/** Credits that "Kullan" still has to charge for a session of this kind. */
export function useCost(kind: PreviewKind): number {
  return kind === 'free' ? PREVIEW_COSTS.useFree : 0
}

export type ActionState = { cost: number; enabled: boolean; reason?: 'no-credits' }

export type PanelState = {
  /** Cost of the next "AI ile üret" press (0 while the free preview is unused). */
  start: ActionState & { free: boolean }
  /** Present only while a preview is open. */
  regenerate?: ActionState
  use?: ActionState
}

export function describePanel(input: {
  freeAvailable: boolean
  balance: number
  preview?: { kind: PreviewKind } | null
}): PanelState {
  const { freeAvailable, balance, preview } = input
  const startCost = freeAvailable ? 0 : PREVIEW_COSTS.newPreview
  const state: PanelState = {
    start: {
      cost: startCost,
      free: freeAvailable,
      enabled: balance >= startCost,
      ...(balance >= startCost ? {} : { reason: 'no-credits' as const }),
    },
  }
  if (preview) {
    const useCredits = useCost(preview.kind)
    state.regenerate = {
      cost: PREVIEW_COSTS.regenerate,
      enabled: balance >= PREVIEW_COSTS.regenerate,
      ...(balance >= PREVIEW_COSTS.regenerate ? {} : { reason: 'no-credits' as const }),
    }
    state.use = {
      cost: useCredits,
      enabled: balance >= useCredits,
      ...(balance >= useCredits ? {} : { reason: 'no-credits' as const }),
    }
  }
  return state
}
