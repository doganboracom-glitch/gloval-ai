import { describe, expect, it, vi } from 'vitest'
import {
  generateWithTextGuard,
  parseVerdict,
  textGuardCounters,
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
