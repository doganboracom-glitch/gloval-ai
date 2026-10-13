import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const generateImage = vi.fn()
const generateText = vi.fn()

vi.mock('ai', () => ({
  generateImage: (...args: unknown[]) => generateImage(...args),
  generateText: (...args: unknown[]) => generateText(...args),
  gateway: { imageModel: (id: string) => ({ id }) },
}))

import { generateSiteImage } from '@/lib/image-provider'
import {
  IMAGE_PROMPT_RULES,
  IMAGE_PROMPT_RULES_ANY_STYLE,
  NEGATIVE_RULE,
  NEGATIVE_RULE_ANY_STYLE,
  NO_TEXT_RULE,
  NO_TEXT_RULE_ANY_STYLE,
  hasImagePromptRules,
  imagePromptRules,
  wantsIllustrationStyle,
  withImagePromptRules,
} from '@/lib/image-prompt-rules'
import { analyzeBrief, buildHeroImagePrompt, buildRequestedImagePrompt } from '@/lib/hero-image'
import { buildItemImagePrompt } from '@/lib/section-images'
import { buildImagePrompt } from '@/lib/store-ai-image'

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])

const ENV_KEYS = ['AI_GATEWAY_API_KEY', 'IMAGE_PROVIDER', 'IMAGE_TEXT_CHECK', 'IMAGE_GENERATION_ENABLED'] as const
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k]
  process.env.AI_GATEWAY_API_KEY = 'test-key'
  process.env.IMAGE_PROVIDER = 'gateway'
  delete process.env.IMAGE_TEXT_CHECK
  delete process.env.IMAGE_GENERATION_ENABLED
  generateImage.mockReset()
  generateText.mockReset()
  generateImage.mockResolvedValue({ image: { uint8Array: PNG, mediaType: 'image/png' } })
  generateText.mockResolvedValue({ text: 'YES' })
})

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

function sentPrompt(call = 0): string {
  const arg = generateImage.mock.calls[call]?.[0] as { prompt?: unknown } | undefined
  const p = arg?.prompt
  return typeof p === 'string' ? p : JSON.stringify(p)
}

describe('logo flow is exempt from the text rules and the text guard', () => {
  it('allowText: the prompt is sent as written, with no text ban', async () => {
    const prompt = 'Minimal monogram logo with the wordmark "Nova Cafe", flat vector style.'
    await generateSiteImage({ prompt, aspectRatio: '1:1', allowText: true })
    expect(generateImage).toHaveBeenCalledTimes(1)
    const sent = sentPrompt()
    expect(sent).toContain('Nova Cafe')
    expect(sent).not.toContain(NO_TEXT_RULE)
    expect(sent).not.toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(sent).not.toMatch(/NO text/i)
    expect(hasImagePromptRules(sent)).toBe(false)
  })

  it('allowText: the guard is never called and a "text found" verdict cannot trigger a regeneration', async () => {
    generateText.mockResolvedValue({ text: 'YES' })
    await generateSiteImage({ prompt: 'Logo with the letter N', aspectRatio: '1:1', allowText: true })
    expect(generateText).not.toHaveBeenCalled()
    expect(generateImage).toHaveBeenCalledTimes(1)
  })

  it('control: a normal photo gets the ban, is checked, and is regenerated once when text is found', async () => {
    await generateSiteImage({ prompt: 'A sunlit cafe interior', aspectRatio: '16:9' })
    expect(sentPrompt()).toContain(NO_TEXT_RULE)
    expect(generateText).toHaveBeenCalled()
    expect(generateImage).toHaveBeenCalledTimes(2)
  })

  it('the logo route no longer asks an image model to draw lettering and never imports the prompt rules or guard', () => {
    const src = readFileSync(join(process.cwd(), 'app/api/logo-image/route.ts'), 'utf8')
    expect(src).not.toContain('generateSiteImage')
    expect(src).not.toContain('image-prompt-rules')
    expect(src).not.toContain('image-text-guard')
    expect(src).not.toMatch(/NO_TEXT_RULE|IMAGE_PROMPT_RULES|withImagePromptRules/)
  })
})

describe('product photo edits keep the product’s own printing', () => {
  it('interpolates the rule (no literal ${...} left in the prompt) and keeps the exception', () => {
    const prompt = buildImagePrompt('studio' as never, 'Kupa')
    expect(prompt).not.toContain('${')
    expect(prompt).toContain('ONLY exception is markings already printed on the product')
    expect(prompt).toContain('printed on it')
  })

  it('is not given the photo-style rule on top of its own', () => {
    const prompt = buildImagePrompt('studio' as never, 'Kupa')
    expect(withImagePromptRules(prompt)).toBe(prompt)
  })
})

describe('visual STYLE restriction is optional, the text ban never is', () => {
  it('default rules keep both halves', () => {
    expect(IMAGE_PROMPT_RULES).toContain(NO_TEXT_RULE)
    expect(IMAGE_PROMPT_RULES).toContain(NEGATIVE_RULE)
    expect(IMAGE_PROMPT_RULES).toMatch(/illustration, CGI, 3D render/)
    expect(imagePromptRules()).toBe(IMAGE_PROMPT_RULES)
  })

  it('any-style rules drop the style restriction but still ban text and EXIF', () => {
    expect(imagePromptRules(true)).toBe(IMAGE_PROMPT_RULES_ANY_STYLE)
    expect(IMAGE_PROMPT_RULES_ANY_STYLE).not.toMatch(/illustration|CGI|3D render|photograph/i)
    expect(IMAGE_PROMPT_RULES_ANY_STYLE).toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(NO_TEXT_RULE_ANY_STYLE).toMatch(/NO text/i)
    expect(NO_TEXT_RULE_ANY_STYLE).toMatch(/EXIF/)
    expect(NO_TEXT_RULE_ANY_STYLE).toMatch(/ISO/)
    expect(NEGATIVE_RULE_ANY_STYLE).toMatch(/text overlay, watermark/)
  })

  it('withImagePromptRules is idempotent for both variants', () => {
    const photo = withImagePromptRules('A cafe')
    const art = withImagePromptRules('A storybook scene', true)
    expect(art).toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(art).not.toContain(NO_TEXT_RULE)
    expect(withImagePromptRules(photo, true)).toBe(photo)
    expect(withImagePromptRules(art)).toBe(art)
  })

  it('detects explicit illustration requests only', () => {
    expect(wantsIllustrationStyle('Çocuk kitabı yayınevi için site yap')).toBe(true)
    expect(wantsIllustrationStyle('illüstrasyon stüdyosu')).toBe(true)
    expect(wantsIllustrationStyle('illustrasyon stüdyosu')).toBe(true)
    expect(wantsIllustrationStyle("a children's book publisher")).toBe(true)
    expect(wantsIllustrationStyle('çizgi film tarzı görseller')).toBe(true)
    expect(wantsIllustrationStyle('Mimarlık ofisi, çizim ve proje hizmetleri')).toBe(false)
    expect(wantsIllustrationStyle('Kreş ve anaokulu için site oluştur')).toBe(false)
    expect(wantsIllustrationStyle('Oyuncak mağazası')).toBe(false)
  })

  it('hero prompt for an illustrated brief is not forced to be a photograph, text ban intact', () => {
    const brief = analyzeBrief('Çocuk kitabı yayınevi için site oluştur')
    expect(brief.illustrative).toBe(true)
    const prompt = buildHeroImagePrompt(brief)
    expect(prompt).toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(prompt).not.toMatch(/photorealistic|documentary photography|illustration, CGI/i)
    expect(hasImagePromptRules(prompt)).toBe(true)
  })

  it('requested hero prompts follow the same switch', () => {
    const prompt = buildRequestedImagePrompt('masal kitabı tarzı renkli bir görsel')
    expect(prompt).toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(prompt).not.toMatch(/illustration, CGI/)
  })

  it('section prompts follow the same switch', () => {
    const site = {
      meta: { name: 'Masal Kitabevi', tagline: 'Çocuk kitabı yayınevi', tone: '', audience: '' },
      theme: { mode: 'light' },
      sections: [],
    } as never
    const target = { section: { type: 'gallery' }, item: { title: 'Orman' } } as never
    const prompt = buildItemImagePrompt(site, target)
    expect(prompt).toContain(NO_TEXT_RULE_ANY_STYLE)
    expect(prompt).not.toMatch(/Photorealistic photograph|illustration, CGI/)
  })

  it('non-illustrated briefs (including kreş and oyuncak) stay photographic with the full rules', () => {
    for (const text of ['Kreş ve anaokulu için site oluştur', 'Oyuncak mağazası sitesi', 'Diş kliniği']) {
      const brief = analyzeBrief(text)
      expect(brief.illustrative).toBe(false)
      const prompt = buildHeroImagePrompt(brief)
      expect(prompt).toContain(NO_TEXT_RULE)
      expect(prompt).toContain('Photorealistic hero banner photograph')
      expect(prompt).toContain(NEGATIVE_RULE)
    }
  })
})
