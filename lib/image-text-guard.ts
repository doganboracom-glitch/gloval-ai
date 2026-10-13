/**
 * Post-generation text guard
 * --------------------------
 * After an image is generated, a tiny vision model answers one question: does
 * the picture contain overlaid or prominent readable text (captions, headlines,
 * watermarks, camera/EXIF strings)? If so the image is regenerated ONCE; if the
 * retry is also flagged, the best available result is used (never blocks the
 * flow, never throws). Only counters are logged — no prompts, images or user data.
 *
 * Cost: one ~1k-token vision call per image (gemini-2.5-flash-lite, $0.10/M
 * input) is roughly $0.0001, i.e. ~1% of one image generation. A retry costs one
 * more generation only when text was actually detected.
 *
 * Kill switch: `IMAGE_TEXT_CHECK=off`. Model override: `IMAGE_TEXT_CHECK_MODEL`.
 */

export type TextVerdict = 'text' | 'clean' | 'unknown'

export const TEXT_GUARD_MAX_ATTEMPTS = 2
/** No retry when the first attempt (generation + check) already used this much. */
export const TEXT_GUARD_RETRY_BUDGET_MS = 20_000
const CHECK_TIMEOUT_MS = 8_000

export const textGuardCounters = {
  checked: 0,
  clean: 0,
  textFound: 0,
  retried: 0,
  exhausted: 0,
  skipped: 0,
}

const CHECK_PROMPT =
  'Does this image contain overlaid or prominent readable text, such as a caption, headline, watermark, logo lettering, or camera/exposure information (for example "f/5.6, 1/160s, ISO 400")? Tiny incidental lettering on distant objects does not count. Answer with exactly one word: YES or NO.'

export function parseVerdict(answer: string): TextVerdict {
  const a = answer.trim().toLowerCase()
  if (a.startsWith('yes')) return 'text'
  if (a.startsWith('no')) return 'clean'
  return 'unknown'
}

/** Never throws; any failure resolves to 'unknown' (the image is then accepted). */
export async function detectTextInImage(src: string): Promise<TextVerdict> {
  if (/^(0|false|no|off)$/i.test((process.env.IMAGE_TEXT_CHECK || '').trim())) return 'unknown'
  try {
    const { generateText } = await import('ai')
    const { text } = await generateText({
      model: process.env.IMAGE_TEXT_CHECK_MODEL || 'google/gemini-2.5-flash-lite',
      maxOutputTokens: 5,
      temperature: 0,
      abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: CHECK_PROMPT },
            { type: 'image', image: src },
          ],
        },
      ],
    })
    return parseVerdict(text)
  } catch {
    return 'unknown'
  }
}

type GuardDeps = {
  check?: (src: string) => Promise<TextVerdict>
  maxAttempts?: number
  retryBudgetMs?: number
  now?: () => number
}

export async function generateWithTextGuard<T extends { src: string }>(
  generate: () => Promise<T | null>,
  {
    check = detectTextInImage,
    maxAttempts = TEXT_GUARD_MAX_ATTEMPTS,
    retryBudgetMs = TEXT_GUARD_RETRY_BUDGET_MS,
    now = Date.now,
  }: GuardDeps = {},
): Promise<T | null> {
  const start = now()
  let best: T | null = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await generate()
    if (!result) return best

    const verdict = await check(result.src)
    textGuardCounters.checked++
    if (verdict === 'clean') {
      textGuardCounters.clean++
      return result
    }
    if (verdict === 'unknown') {
      textGuardCounters.skipped++
      return result
    }

    textGuardCounters.textFound++
    best = result
    if (attempt === maxAttempts || now() - start > retryBudgetMs) break
    textGuardCounters.retried++
  }

  textGuardCounters.exhausted++
  console.info('[image-text-guard]', { ...textGuardCounters })
  return best
}
