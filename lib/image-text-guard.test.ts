import { describe, expect, it, vi } from 'vitest'
import {
  detectImageRelevance,
  generateWithRelevanceGuard,
  generateWithTextGuard,
  imageDataUrlToFilePart,
  parseRelevanceVerdict,
  parseVerdict,
  relevanceCounters,
  textGuardCounters,
  type RelevanceVerdict,
  type TextVerdict,
} from '@/lib/image-text-guard'
import {
  IMAGE_PROMPT_RULES,
  NO_TEXT_RULE,
  PRODUCT_EDIT_NO_TEXT_RULE,
  hasImagePromptRules,
  withImagePromptRules,
} from '@/lib/image-prompt-rules'

describe('parseVerdict', () => {
  it('maps YES / NO answers and falls back to unknown', () => {
    expect(parseVerdict('YES')).toBe('text')
    expect(parseVerdict(' yes.')).toBe('text')
    expect(parseVerdict('NO')).toBe('clean')
    expect(parseVerdict('maybe')).toBe('unknown')
    expect(parseVerdict('')).toBe('unknown')
  })
})

describe('generateWithTextGuard', () => {
  const make = (n: number) => ({ src: `img-${n}` })

  function setup(verdicts: TextVerdict[]) {
    let call = 0
    const generate = vi.fn(async () => make(++call))
    const check = vi.fn(async () => verdicts[Math.min(check.mock.calls.length - 1, verdicts.length - 1)])
    return { generate, check }
  }

  it('returns the first image when it is clean (no retry)', async () => {
    const { generate, check } = setup(['clean'])
    const out = await generateWithTextGuard(generate, { check })
    expect(out).toEqual({ src: 'img-1' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('regenerates once when text is found and returns the clean retry', async () => {
    const { generate, check } = setup(['text', 'clean'])
    const out = await generateWithTextGuard(generate, { check })
    expect(out).toEqual({ src: 'img-2' })
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('never blocks: after the retry also has text, returns the last result', async () => {
    const { generate, check } = setup(['text', 'text'])
    const out = await generateWithTextGuard(generate, { check })
    expect(out).toEqual({ src: 'img-2' })
    expect(generate).toHaveBeenCalledTimes(2)
  })

  it('accepts the image when the check cannot decide', async () => {
    const { generate, check } = setup(['unknown'])
    const out = await generateWithTextGuard(generate, { check })
    expect(out).toEqual({ src: 'img-1' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('skips the retry when the time budget is already spent', async () => {
    const { generate, check } = setup(['text', 'clean'])
    let t = 0
    const out = await generateWithTextGuard(generate, {
      check,
      retryBudgetMs: 1000,
      now: () => (t += 5000),
    })
    expect(out).toEqual({ src: 'img-1' })
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('returns null when the first generation yields nothing, and keeps the best if a retry fails', async () => {
    expect(await generateWithTextGuard(async () => null, { check: async () => 'clean' })).toBeNull()

    let call = 0
    const out = await generateWithTextGuard(async () => (++call === 1 ? make(1) : null), {
      check: async () => 'text',
    })
    expect(out).toEqual({ src: 'img-1' })
  })

  it('counts checks', async () => {
    const before = textGuardCounters.checked
    const { generate, check } = setup(['clean'])
    await generateWithTextGuard(generate, { check })
    expect(textGuardCounters.checked).toBe(before + 1)
  })
})

describe('image relevance guard', () => {
  it('parses strict YES / NO answers and fails open on uncertain output', () => {
    expect(parseRelevanceVerdict('YES')).toBe('yes')
    expect(parseRelevanceVerdict('no')).toBe('no')
    expect(parseRelevanceVerdict('uncertain')).toBe('unknown')
    expect(parseRelevanceVerdict('')).toBe('unknown')
  })

  it('converts image data URIs to AI SDK file content parts', () => {
    const part = imageDataUrlToFilePart('data:image/png;base64,SGVsbG8=')
    expect(part?.type).toBe('file')
    expect(part?.mediaType).toBe('image/png')
    expect(Array.from(part?.data ?? [])).toEqual([72, 101, 108, 108, 111])
    expect(imageDataUrlToFilePart('https://example.com/image.png')).toBeNull()
  })

  it('retries exactly once after NO and accepts a matching composition', async () => {
    const before = { ...relevanceCounters }
    const generate = vi.fn(async (attempt: 'initial' | 'retry') => ({ src: attempt }))
    const check = vi.fn(async (src: string): Promise<RelevanceVerdict> =>
      src === 'initial' ? 'no' : 'yes',
    )
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})

    const result = await generateWithRelevanceGuard(generate, 'locksmith service', { check })

    expect(result?.src).toBe('retry')
    expect(generate).toHaveBeenCalledTimes(2)
    expect(check).toHaveBeenCalledTimes(2)
    expect(relevanceCounters.checked - before.checked).toBe(2)
    expect(relevanceCounters.mismatch - before.mismatch).toBe(1)
    expect(relevanceCounters.matched - before.matched).toBe(1)
    expect(relevanceCounters.retried - before.retried).toBe(1)
    expect(log).toHaveBeenCalledWith('[image-relevance-guard]', {
      ...relevanceCounters,
    })
    log.mockRestore()
  })

  it('fails open on unknown results and keeps the higher-quality initial image after two NO verdicts', async () => {
    const generate = vi.fn(async (attempt: 'initial' | 'retry') => ({ src: attempt }))
    const unknown = await generateWithRelevanceGuard(generate, 'barbershop', {
      check: async () => 'unknown',
    })
    expect(unknown?.src).toBe('initial')
    expect(generate).toHaveBeenCalledTimes(1)

    const mismatch = await generateWithRelevanceGuard(generate, 'barbershop', {
      check: async () => 'no',
    })
    expect(mismatch?.src).toBe('initial')
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('honors the IMAGE_RELEVANCE_CHECK kill switch', async () => {
    const previous = process.env.IMAGE_RELEVANCE_CHECK
    process.env.IMAGE_RELEVANCE_CHECK = 'off'
    try {
      expect(await detectImageRelevance('data:image/png;base64,SGVsbG8=', 'locksmith')).toBe('unknown')
    } finally {
      if (previous === undefined) delete process.env.IMAGE_RELEVANCE_CHECK
      else process.env.IMAGE_RELEVANCE_CHECK = previous
    }
  })
})

describe('image prompt rules', () => {
  it('forbids text and EXIF strings explicitly', () => {
    expect(NO_TEXT_RULE).toMatch(/NO text/i)
    expect(NO_TEXT_RULE).toMatch(/EXIF/)
    expect(NO_TEXT_RULE).toMatch(/ISO/)
    expect(IMAGE_PROMPT_RULES).toContain(NO_TEXT_RULE)
  })

  it('withImagePromptRules appends once and is idempotent', () => {
    const once = withImagePromptRules('A sunlit cafe interior')
    expect(once).toContain(NO_TEXT_RULE)
    expect(withImagePromptRules(once)).toBe(once)
  })

  it('does not double-append to product edit prompts', () => {
    const prompt = `Clean studio shot. ${PRODUCT_EDIT_NO_TEXT_RULE}`
    expect(hasImagePromptRules(prompt)).toBe(true)
    expect(withImagePromptRules(prompt)).toBe(prompt)
  })
})
