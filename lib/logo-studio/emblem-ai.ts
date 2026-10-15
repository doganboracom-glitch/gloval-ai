import { generateText } from 'ai'
import { logAiUsage, type AiModelSelection } from '@/lib/ai-models'
import { splitSvg, type EmblemAsset } from '@/lib/logo-studio/compose'
import { checkEmblemSvg } from '@/lib/logo-studio/emblem-gate'
import { buildEmblemPrompt } from '@/lib/logo-studio/emblem-prompt'
import type { LogoStyleId } from '@/lib/logo-studio/rules'

/**
 * LLM emblem generation (text-free). The model (chosen by `resolveAiModel`,
 * Sonnet or Opus through the AI Gateway) writes ONLY the symbol as flat vector
 * shapes. Lettering is forbidden in the prompt and rejected by the gate,
 * because the brand name is typeset separately as real vector outlines.
 *
 * Every candidate gets at most two attempts: a rejected or failed first try is
 * redrawn once with the rejection reason in the brief. A candidate that still
 * fails is reported as failed and is never charged.
 */

const ATTEMPT_TIMEOUT_MS = 80_000
/** No second attempt is started after this much of the round has elapsed. */
const RETRY_DEADLINE_MS = 170_000
const MAX_OUTPUT_TOKENS = 4_000
const MAX_INNER_LENGTH = 25_000

export type DrawResult = {
  text: string
  finishReason?: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

export type Drawer = (args: { model: string; system: string; prompt: string; signal: AbortSignal }) => Promise<DrawResult>

const gatewayDrawer: Drawer = async ({ model, system, prompt, signal }) => {
  const result = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    maxRetries: 0,
    abortSignal: signal,
  })
  return { text: result.text, finishReason: result.finishReason, usage: result.usage }
}

export type EmblemRound = {
  selection: AiModelSelection
  brand: string
  sector?: string
  description?: string
  style: LogoStyleId
  symbol?: string
  /** Palette hex values: one for single-colour mode, two otherwise. */
  colors: string[]
  count: number
  seed: number
  idPrefix: string
  /** Test seam; production always uses the AI Gateway. */
  draw?: Drawer
  now?: () => number
}

export type EmblemOutcome =
  | { ok: true; emblem: EmblemAsset; attempts: number }
  | { ok: false; reason: string; attempts: number }

function failureReason(err: unknown): string {
  if (err instanceof Error) return err.name === 'TimeoutError' || err.name === 'AbortError' ? 'zaman aşımı' : 'model hatası'
  return 'model hatası'
}

async function drawCandidate(round: EmblemRound, index: number, startedAt: number): Promise<EmblemOutcome> {
  const draw = round.draw ?? gatewayDrawer
  const now = round.now ?? Date.now
  let reason = ''

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2 && now() - startedAt > RETRY_DEADLINE_MS) return { ok: false, reason, attempts: 1 }
    const prompt = buildEmblemPrompt(
      {
        brand: round.brand,
        sector: round.sector,
        description: round.description,
        style: round.style,
        symbol: round.symbol,
        colors: round.colors,
        index,
        seed: round.seed,
        retryReason: attempt === 2 ? reason : undefined,
      },
      round.count,
    )
    const label = attempt === 1 ? 'first' : 'retry'
    try {
      const out = await draw({
        model: round.selection.model,
        system: prompt.system,
        prompt: prompt.user,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
      if (out.finishReason === 'length') {
        reason = 'çıktı kesildi'
        logAiUsage(round.selection, 'error', out.usage, label)
        continue
      }
      const verdict = await checkEmblemSvg(out.text, round.colors)
      if (!verdict.ok) {
        reason = verdict.reason
        logAiUsage(round.selection, 'error', out.usage, label)
        continue
      }
      const parts = splitSvg(verdict.svg)
      if (!parts || parts.inner.length > MAX_INNER_LENGTH) {
        reason = 'boyut/viewBox'
        logAiUsage(round.selection, 'error', out.usage, label)
        continue
      }
      logAiUsage(round.selection, 'ok', out.usage, label)
      return {
        ok: true,
        attempts: attempt,
        emblem: {
          id: `${round.idPrefix}-${index}`,
          source: 'ai',
          inner: parts.inner,
          viewBox: { w: parts.w, h: parts.h },
        },
      }
    } catch (err) {
      reason = failureReason(err)
      logAiUsage(round.selection, 'error', undefined, label)
    }
  }
  return { ok: false, reason, attempts: 2 }
}

/** Draws `count` emblems in parallel. Never throws; each slot is a success or a reasoned failure. */
export async function generateEmblemRound(round: EmblemRound): Promise<EmblemOutcome[]> {
  const startedAt = (round.now ?? Date.now)()
  return Promise.all(Array.from({ length: round.count }, (_, i) => drawCandidate(round, i, startedAt)))
}
