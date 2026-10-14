import { NoObjectGeneratedError, generateObject } from 'ai'
import type { z } from 'zod'
import {
  countCodes,
  extractJson,
  repairToSchema,
  type IssueSummary,
  type RepairOptions,
  type RepairStep,
} from '@/lib/ai-repair'
import { logAiUsage, type AiModelSelection } from '@/lib/ai-models'
import { recordAiGenerationEvent, type AiEventOutcome } from '@/lib/ai-generation-events'

/**
 * The ONE entry point for "ask a model for JSON that matches a schema".
 *
 * Every structured flow (site generation, site/section edit, plan, product
 * text) goes through it, so they all share the same ladder:
 *
 *   1. ask the model;
 *   2. if the answer fails validation, repair it deterministically
 *      (`lib/ai-repair.ts`);
 *   3. if repair is not enough, ask the SAME model ONE more time with a
 *      summary of what was wrong appended to the prompt;
 *   4. if that also fails it throws `StructuredGenerationError` and the caller
 *      uses its own fallback (e.g. `fallbackWebsite`).
 *
 * Cost: neither the repair nor the retry is ever billed to the user. Credits
 * and daily limits are charged by the callers once, after success, at a fixed
 * price. Each attempt's tokens are written to the `[ai-usage]` log (with
 * `attempt: 'retry'` for the second call), and one `[ai-repair]` line per
 * request records the outcome and repair codes so the rates can be tracked.
 * Nothing logged contains prompts, generated text or user data.
 */

export type StructuredOutcome = 'first_try' | 'repaired' | 'retried'

export type TokenUsage = { inputTokens: number; outputTokens: number }

export type StructuredResult<T> = {
  object: T
  outcome: StructuredOutcome
  attempts: 1 | 2
  repairs: RepairStep[]
  /** Tokens over every attempt, retry included (for benchmarks; never billed to users). */
  usage: TokenUsage
}

export class StructuredGenerationError extends Error {
  readonly attempts: number
  readonly cause?: unknown
  readonly usage: TokenUsage
  constructor(message: string, attempts: number, cause?: unknown, usage?: TokenUsage) {
    super(message)
    this.name = 'StructuredGenerationError'
    this.attempts = attempts
    this.cause = cause
    this.usage = usage ?? { inputTokens: 0, outputTokens: 0 }
  }
}

export type StructuredRequest<T> = {
  ai: AiModelSelection
  schema: z.ZodType<T>
  system: string
  prompt: string
  /** Remote images shown to the model alongside the prompt (product photos). */
  imageUrls?: readonly string[]
  abortSignal?: AbortSignal
  repair?: RepairOptions
  /** `false` skips the persistent outcome counter (benchmarks). Default: record. */
  recordEvent?: false
  /** Test seam: replaces the network call. */
  generate?: GenerateFn
}

export type GenerateArgs = {
  model: string
  schema: z.ZodType<unknown>
  system: string
  prompt: string
  imageUrls?: readonly string[]
  abortSignal?: AbortSignal
  repairText: (options: { text: string }) => Promise<string | null>
}

export type GenerateFn = (args: GenerateArgs) => Promise<{ object: unknown; usage?: Usage }>

type Usage = { inputTokens?: number; outputTokens?: number } | undefined

const defaultGenerate: GenerateFn = async ({ imageUrls, prompt, ...rest }) => {
  const common = {
    model: rest.model,
    schema: rest.schema,
    system: rest.system,
    abortSignal: rest.abortSignal,
    repairText: rest.repairText,
    // The schemas have optional keys; strict JSON-schema mode makes OpenAI
    // reject those with a 400, so it is relaxed for every structured call.
    providerOptions: { openai: { strictJsonSchema: false } },
  }
  const result = imageUrls?.length
    ? await generateObject({
        ...common,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              ...imageUrls.map((url) => ({ type: 'image' as const, image: new URL(url) })),
            ],
          },
        ],
      })
    : await generateObject({ ...common, prompt })
  return { object: result.object, usage: result.usage }
}

/** What the retry tells the model: field paths and rule codes only, never content. */
export function buildRetryNote(issues: ReadonlyArray<IssueSummary>): string {
  const lines = issues.length
    ? issues.map((issue) => `- ${issue.path || '(root)'}: ${issue.message}`).join('\n')
    : '- The answer was not valid JSON for the requested schema.'
  return (
    `\n\nYour previous answer was rejected by validation:\n${lines}\n` +
    `Answer again with ONE complete JSON object that fixes every point above and still follows all earlier instructions.`
  )
}

type AttemptOutcome<T> =
  | { ok: true; object: T; usage: Usage; repairs: RepairStep[] }
  | { ok: false; usage: Usage; repairs: RepairStep[]; issues: IssueSummary[]; error: unknown }

async function attempt<T>(request: StructuredRequest<T>, prompt: string): Promise<AttemptOutcome<T>> {
  const repairs: RepairStep[] = []
  let issues: IssueSummary[] = []
  const generate = request.generate ?? defaultGenerate

  const repairText = async ({ text }: { text: string }): Promise<string | null> => {
    let raw: unknown
    try {
      raw = extractJson(text)
      try {
        JSON.parse(text)
      } catch {
        repairs.push({ code: 'json_extracted', path: '' })
      }
    } catch {
      issues = [{ path: '', code: 'invalid_json', message: 'The answer was not parseable JSON' }]
      return null
    }
    const result = repairToSchema(raw, request.schema, request.repair)
    repairs.push(...result.steps)
    if (!result.ok) {
      issues = result.issues
      return null
    }
    return JSON.stringify(result.value)
  }

  try {
    const { object, usage } = await generate({
      model: request.ai.model,
      schema: request.schema as z.ZodType<unknown>,
      system: request.system,
      prompt,
      imageUrls: request.imageUrls,
      abortSignal: request.abortSignal,
      repairText,
    })
    return { ok: true, object: object as T, usage, repairs }
  } catch (error) {
    const usage = NoObjectGeneratedError.isInstance(error) ? (error.usage as Usage) : undefined
    return { ok: false, usage, repairs, issues, error }
  }
}

function logRepair(
  ai: AiModelSelection,
  result: 'first_try' | 'repaired' | 'retried' | 'failed',
  attempts: number,
  repairs: ReadonlyArray<RepairStep>,
  issues: ReadonlyArray<IssueSummary>,
) {
  console.info('[ai-repair]', {
    flow: ai.flow,
    tier: ai.tier,
    model: ai.model,
    plan: ai.plan,
    result,
    attempts,
    repairs: countCodes(repairs),
    unresolved: result === 'first_try' || result === 'repaired' ? [] : issues.map((i) => `${i.path}:${i.code}`).slice(0, 8),
  })
}

function sumUsage(...parts: Usage[]): TokenUsage {
  return {
    inputTokens: parts.reduce((n, u) => n + (u?.inputTokens ?? 0), 0),
    outputTokens: parts.reduce((n, u) => n + (u?.outputTokens ?? 0), 0),
  }
}

/**
 * Persists the outcome counter (no user data, see `lib/ai-generation-events.ts`).
 * A request the caller cancelled says nothing about the model, so it is skipped.
 */
async function recordOutcome(request: StructuredRequest<unknown>, outcome: AiEventOutcome): Promise<void> {
  if (request.recordEvent === false || request.abortSignal?.aborted) return
  await recordAiGenerationEvent(request.ai, outcome)
}

export async function generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
  const first = await attempt(request, request.prompt)
  if (first.ok) {
    logAiUsage(request.ai, 'ok', first.usage, 'first')
    const outcome: StructuredOutcome = first.repairs.length ? 'repaired' : 'first_try'
    logRepair(request.ai, outcome, 1, first.repairs, [])
    await recordOutcome(request, outcome === 'first_try' ? 'ok' : 'repaired')
    return { object: first.object, outcome, attempts: 1, repairs: first.repairs, usage: sumUsage(first.usage) }
  }

  logAiUsage(request.ai, 'error', first.usage, 'first')

  // Only a model answer that failed validation is worth a second ask. API
  // errors (the SDK already retried those), timeouts and cancellations are not.
  const retryable = NoObjectGeneratedError.isInstance(first.error) && !request.abortSignal?.aborted
  if (!retryable) {
    logRepair(request.ai, 'failed', 1, first.repairs, first.issues)
    await recordOutcome(request, 'fallback')
    throw new StructuredGenerationError('structured generation failed', 1, first.error, sumUsage(first.usage))
  }

  const second = await attempt(request, request.prompt + buildRetryNote(first.issues))
  const repairs = [...first.repairs, ...second.repairs]
  if (second.ok) {
    logAiUsage(request.ai, 'ok', second.usage, 'retry')
    logRepair(request.ai, 'retried', 2, repairs, first.issues)
    await recordOutcome(request, 'retried')
    return {
      object: second.object,
      outcome: 'retried',
      attempts: 2,
      repairs,
      usage: sumUsage(first.usage, second.usage),
    }
  }

  logAiUsage(request.ai, 'error', second.usage, 'retry')
  logRepair(request.ai, 'failed', 2, repairs, second.issues)
  await recordOutcome(request, 'fallback')
  throw new StructuredGenerationError(
    'structured generation failed after retry',
    2,
    second.error,
    sumUsage(first.usage, second.usage),
  )
}
