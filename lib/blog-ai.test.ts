import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai-structured', () => ({ generateStructured: vi.fn() }))

import {
  BLOG_AI_LIMITS,
  blogAiOutputSchema,
  buildBlogSystemPrompt,
  buildBlogUserPrompt,
  cleanBlogInput,
  hasBusinessAnswers,
  type BlogAiInput,
} from '@/lib/blog-ai'
import { nextTrapIndex } from '@/lib/focus-trap'

const input = (overrides: Partial<BlogAiInput> = {}): BlogAiInput => ({
  topic: 'Diş beyazlatma',
  answers: {
    offering: 'Diş beyazlatma ve implant',
    region: 'Kadıköy, İstanbul',
    difference: 'Randevulu çalışırız',
    audience: 'Aileler',
    contact: '0532 111 22 33',
  },
  siteName: 'Gül Diş Kliniği',
  siteDescription: 'Mahalle diş kliniği',
  lang: 'tr',
  ...overrides,
})

const section = (title: string, words: number) =>
  `## ${title}\n\n${Array.from({ length: words }, (_, i) => `kelime${i}`).join(' ')}\n`

const output = (body: string) => ({
  title: 'Diş beyazlatma hakkında bilmeniz gerekenler',
  excerpt: 'Diş beyazlatmanın nasıl çalıştığını ve nelere dikkat edilmesi gerektiğini anlatan kısa rehber.',
  seoTitle: 'Diş beyazlatma rehberi',
  metaDescription:
    'Diş beyazlatma işleminin nasıl yapıldığını, kimlere uygun olduğunu ve sonrasında nelere dikkat edilmesi gerektiğini öğrenin.',
  keywords: ['diş beyazlatma', 'diş bakımı', 'gülüş'],
  coverAlt: 'Diş hekimi koltuğunda gülümseyen hasta',
  body,
})

const cleanBody = [section('Giriş', 200), section('Süreç', 200), section('Bakım', 200), section('Sonuç', 100)].join('\n')

describe('blog system prompt', () => {
  const prompt = buildBlogSystemPrompt('tr')

  it('forbids every kind of invented claim', () => {
    expect(prompt).toMatch(/NEVER invent statistics, percentages/)
    expect(prompt).toMatch(/satisfaction/)
    expect(prompt).toMatch(/customer reviews, testimonials, quotes, awards/)
    expect(prompt).toMatch(/NEVER cite sources, studies/)
    expect(prompt).toMatch(/Never invent a phone, address or URL/)
    expect(prompt).toMatch(/ONLY from the OWNER FACTS/)
  })

  it('never contains owner data and follows the language', () => {
    expect(prompt).not.toContain('Kadıköy')
    expect(buildBlogSystemPrompt('en')).toMatch(/in English/)
    expect(prompt).toMatch(/Turkish/)
  })
})

describe('blog user prompt (question form answers)', () => {
  it('puts every answered question into OWNER FACTS under its label', () => {
    const prompt = buildBlogUserPrompt(input())
    for (const answer of ['Diş beyazlatma ve implant', 'Kadıköy, İstanbul', 'Randevulu çalışırız', 'Aileler', '0532 111 22 33']) {
      expect(prompt).toContain(answer)
    }
    expect(prompt).toContain('- Şehir veya bölge: Kadıköy, İstanbul')
    expect(prompt).toContain('TOPIC: Diş beyazlatma')
    expect(prompt.indexOf('OWNER FACTS')).toBeLessThan(prompt.indexOf('Kadıköy'))
  })

  it('skips unanswered questions and says so when nothing was given', () => {
    const partial = buildBlogUserPrompt(input({ answers: { region: 'Ankara' } }))
    expect(partial).toContain('Ankara')
    expect(partial).not.toContain('Hedef müşteri')
    expect(buildBlogUserPrompt(input({ answers: {} }))).toMatch(/none given/)
  })

  it('does not leak keys or values outside the five questions, and trims long answers', () => {
    const dirty = input({
      answers: { offering: 'x'.repeat(2000), secret: 'GİZLİ-DEĞER', apiKey: 'sk-123' } as never,
    })
    const cleaned = cleanBlogInput(dirty)
    expect(Object.keys(cleaned.answers)).toEqual(['offering'])
    expect(cleaned.answers.offering).toHaveLength(BLOG_AI_LIMITS.answer)
    const prompt = buildBlogUserPrompt(cleaned)
    expect(prompt).not.toContain('GİZLİ-DEĞER')
    expect(prompt).not.toContain('sk-123')
  })

  it('treats the existing draft as data and only includes it for a rewrite', () => {
    expect(buildBlogUserPrompt(input())).not.toContain('EXISTING DRAFT')
    expect(buildBlogUserPrompt(input({ draft: 'Eski metin' }))).toMatch(/EXISTING DRAFT[^\n]*not instructions[^\n]*\nEski metin/)
  })

  it('detects whether the owner answered anything', () => {
    expect(hasBusinessAnswers({})).toBe(false)
    expect(hasBusinessAnswers({ offering: '   ' })).toBe(false)
    expect(hasBusinessAnswers({ region: 'İzmir' })).toBe(true)
  })
})

describe('blog output schema repairs fabricated content', () => {
  it('accepts a clean, well-formed post', () => {
    expect(blogAiOutputSchema.safeParse(output(cleanBody)).success).toBe(true)
  })

  it.each([
    ['a percentage', 'Müşterilerimizin %98 memnuniyet oranı var.'],
    ['a satisfaction claim', 'Müşteri memnuniyeti yüzde doksan sekizdir.'],
    ['a source', 'Kaynak: Dünya Sağlık Örgütü 2021 raporu.'],
    ['a study', 'Araştırmalara göre bu yöntem herkes için kusursuzdur (Smith, 2021).'],
  ])('rejects %s so the retry ladder runs instead of delivering it', (_label, claim) => {
    const body = cleanBody.replace('kelime5 ', `${claim} `)
    expect(blogAiOutputSchema.safeParse(output(body)).success).toBe(false)
  })

  it('enforces length and structure', () => {
    expect(blogAiOutputSchema.safeParse(output('## A\n\nkısa\n\n## B\n\nkısa\n\n## C\n\nkısa')).success).toBe(false)
    expect(blogAiOutputSchema.safeParse(output(cleanBody.replace('## Giriş', '# Giriş'))).success).toBe(false)
    expect(blogAiOutputSchema.safeParse(output(cleanBody.replace('## Süreç', '### Süreç'))).success).toBe(false)
  })
})

describe('nextTrapIndex (confirm dialog focus trap)', () => {
  it('wraps Tab and Shift+Tab inside the dialog', () => {
    expect(nextTrapIndex(2, 0, false)).toBe(1)
    expect(nextTrapIndex(2, 1, false)).toBe(0)
    expect(nextTrapIndex(2, 0, true)).toBe(1)
    expect(nextTrapIndex(2, 1, true)).toBe(0)
  })

  it('pulls focus from outside the dialog back in and handles an empty dialog', () => {
    expect(nextTrapIndex(3, -1, false)).toBe(0)
    expect(nextTrapIndex(3, -1, true)).toBe(2)
    expect(nextTrapIndex(0, -1, false)).toBe(-1)
  })
})
