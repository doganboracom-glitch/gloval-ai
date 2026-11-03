import { generateText } from 'ai'
import { attemptTimeoutMs, fallbackModelFor, logAiUsage, type AiModelSelection } from '@/lib/ai-models'
import { splitSvg, type EmblemAsset } from '@/lib/logo-studio/compose'
import { fingerprintEmblem, tooSimilar, type Fingerprint } from '@/lib/logo-studio/emblem-diversity'
import { checkEmblemSvg } from '@/lib/logo-studio/emblem-gate'
import { buildEmblemPrompt } from '@/lib/logo-studio/emblem-prompt'
import type { LogoStyleId } from '@/lib/logo-studio/rules'

/**
 * LLM emblem generation (text-free). The model (chosen by `resolveAiModel`,
 * Sonnet or Opus through the AI Gateway) writes ONLY the symbol as flat vector
 * shapes. Lettering is forbidden in the prompt and rejected by the gate,
 * because the brand name is typeset separately as real vector outlines.
 *
 * Every candidate gets at most two attempts:
 *  - a rejected or truncated first try is redrawn once on the SAME model with
 *    the rejection reason in the brief (outcome `retried`);
 *  - a first try that ERRORED or TIMED OUT on a model that has a fallback (Opus
 *    -> Sonnet, see `fallbackModelFor`) is redrawn once on the fallback model
 *    (outcome `fallback`).
 * A candidate that still fails is reported as failed and is never charged.
 */

/** No second attempt is started after this much of the round has elapsed. */
const RETRY_DEADLINE_MS = 150_000
const MAX_OUTPUT_TOKENS = 4_000
const MAX_INNER_LENGTH = 25_000

export type DrawResult = {
  text: string
  finishReason?: string
  usage?: { inputTokens?: number; outputTokens?: number }
}

export type Drawer = (args: {
  model: string
  system: string
  prompt: string
  signal: AbortSignal
  timeoutMs: number
}) => Promise<DrawResult>

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
  /** Palette hex values: one/two for legacy modes, three flat tone tokens for V2 metal mode. */
  colors: string[]
  count: number
  seed: number
  idPrefix: string
  v2?: boolean
  metallic?: boolean
  creativeDirection?: string
  motifs?: readonly string[]
  /** Sector clichés the prompt tells the model to avoid (V2). */
  avoid?: readonly string[]
  /** Test seam; production always uses the AI Gateway. */
  draw?: Drawer
  now?: () => number
}

/** `ok`: first try; `retried`: second try, same model; `fallback`: second try on the fallback model. */
export type EmblemResultKind = 'ok' | 'retried' | 'fallback'

export type EmblemOutcome =
  | { ok: true; emblem: EmblemAsset; attempts: number; model: string; kind: EmblemResultKind }
  | { ok: false; reason: string; attempts: number }

type FailureCause = 'timeout' | 'error' | 'rejected'

function failureOf(err: unknown): { reason: string; cause: FailureCause } {
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { reason: 'zaman aşımı', cause: 'timeout' }
  }
  return { reason: 'model hatası', cause: 'error' }
}

async function drawCandidate(round: EmblemRound, index: number, startedAt: number): Promise<EmblemOutcome> {
  const draw = round.draw ?? gatewayDrawer
  const now = round.now ?? Date.now
  const fallbackModel = fallbackModelFor(round.selection)
  let reason = ''
  let cause: FailureCause = 'rejected'

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2 && now() - startedAt > RETRY_DEADLINE_MS) return { ok: false, reason, attempts: 1 }

    const useFallback = attempt === 2 && cause !== 'rejected' && fallbackModel !== null
    const model = useFallback ? fallbackModel : round.selection.model
    const selection: AiModelSelection = useFallback ? { ...round.selection, model } : round.selection
    if (useFallback) {
      console.info('[logo-emblem] fallback', {
        from: round.selection.model,
        to: model,
        tier: round.selection.tier,
        plan: round.selection.plan,
        cause,
      })
    }

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
        v2: round.v2,
        metallic: round.metallic,
        creativeDirection: round.creativeDirection,
        motif: round.motifs && round.motifs.length > 0 ? round.motifs[index % round.motifs.length] : undefined,
        avoid: round.avoid,
      },
      round.count,
    )
    const label = attempt === 1 ? 'first' : 'retry'
    const kind: EmblemResultKind = attempt === 1 ? 'ok' : useFallback ? 'fallback' : 'retried'
    const timeoutMs = attemptTimeoutMs(model)
    try {
      const out = await draw({
        model,
        system: prompt.system,
        prompt: prompt.user,
        signal: AbortSignal.timeout(timeoutMs),
        timeoutMs,
      })
      if (out.finishReason === 'length') {
        reason = 'çıktı kesildi'
        cause = 'rejected'
        logAiUsage(selection, 'error', out.usage, label)
        continue
      }
      const verdict = await checkEmblemSvg(out.text, round.colors)
      if (!verdict.ok) {
        reason = verdict.reason
        cause = 'rejected'
        logAiUsage(selection, 'error', out.usage, label)
        continue
      }
      const parts = splitSvg(verdict.svg)
      if (!parts || parts.inner.length > MAX_INNER_LENGTH) {
        reason = 'boyut/viewBox'
        cause = 'rejected'
        logAiUsage(selection, 'error', out.usage, label)
        continue
      }
      logAiUsage(selection, 'ok', out.usage, label)
      return {
        ok: true,
        attempts: attempt,
        model,
        kind,
        emblem: {
          id: `${round.idPrefix}-${index}`,
          source: 'ai',
          inner: parts.inner,
          viewBox: { w: parts.w, h: parts.h },
        },
      }
    } catch (err) {
      ;({ reason, cause } = failureOf(err))
      logAiUsage(selection, 'error', undefined, label)
    }
  }
  return { ok: false, reason, attempts: 2 }
}

/** Extra draws allowed per near-duplicate before that slot is reported as failed (and so not charged). */
const MAX_REDRAWS_PER_DUPLICATE = 2

/**
 * V2 only: a delivered mark that is nearly identical to an earlier one is
 * redrawn with another concept family; if it is still a duplicate the slot
 * fails with a reason and is never charged.
 */
async function dropNearDuplicates(round: EmblemRound, outcomes: EmblemOutcome[], startedAt: number): Promise<EmblemOutcome[]> {
  const kept: Fingerprint[] = []
  const result: EmblemOutcome[] = []
  let extra = round.count
  for (const outcome of outcomes) {
    let current = outcome
    for (let tries = 0; ; tries++) {
      if (!current.ok) break
      const print = fingerprintEmblem(current.emblem.inner)
      if (!tooSimilar(print, kept)) {
        kept.push(print)
        break
      }
      if (tries >= MAX_REDRAWS_PER_DUPLICATE) {
        current = { ok: false, reason: 'çok benzer', attempts: current.attempts }
        break
      }
      current = await drawCandidate(round, extra++, startedAt)
    }
    result.push(current)
  }
  return result
}

/** Draws `count` emblems in parallel. Never throws; each slot is a success or a reasoned failure. */
export async function generateEmblemRound(round: EmblemRound): Promise<EmblemOutcome[]> {
  const startedAt = (round.now ?? Date.now)()
  const outcomes = await Promise.all(Array.from({ length: round.count }, (_, i) => drawCandidate(round, i, startedAt)))
  return round.v2 ? dropNearDuplicates(round, outcomes, startedAt) : outcomes
}
