import { describe, expect, it, vi } from 'vitest'
import { NoObjectGeneratedError } from 'ai'
import { z } from 'zod'
import { extractJson, repairToSchema } from '@/lib/ai-repair'
import { trimSectionsToLimit } from '@/lib/site-repair'
import {
  generateStructured,
  StructuredGenerationError,
  type GenerateArgs,
  type GenerateFn,
} from '@/lib/ai-structured'
import type { AiModelSelection } from '@/lib/ai-models'

const ai: AiModelSelection = { flow: 'productText', tier: 'standard', model: 'test/model', plan: 'free' }

const schema = z.object({
  title: z.string(),
  tags: z.array(z.string()).max(2),
  note: z.string().optional(),
})

function noObject(usage = { inputTokens: 10, outputTokens: 5 }) {
  return new NoObjectGeneratedError({
    message: 'bad',
    text: '{}',
    response: { id: 'r', timestamp: new Date(), modelId: 'm' },
    usage: { ...usage, totalTokens: usage.inputTokens + usage.outputTokens } as never,
    finishReason: 'stop',
  })
}

/** Mimics the SDK: raw text goes through repairText, then the schema. */
function fakeGenerate(texts: Array<string | Error>): GenerateFn {
  let call = 0
  return async (args: GenerateArgs) => {
    const next = texts[call++]
    if (next instanceof Error) throw next
    const repaired = await args.repairText({ text: next })
    if (repaired === null) throw noObject()
    return { object: args.schema.parse(JSON.parse(repaired)), usage: { inputTokens: 10, outputTokens: 5 } }
  }
}

describe('extractJson', () => {
  it('pulls an object out of fenced prose', () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```\nDone')).toEqual({ a: 1 })
  })
})

describe('repairToSchema', () => {
  it('truncates arrays over their maximum', () => {
    const result = repairToSchema({ title: 'x', tags: ['a', 'b', 'c', 'd'] }, schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.tags).toEqual(['a', 'b'])
  })

  it('coerces a number sent where a string is expected', () => {
    const result = repairToSchema({ title: 'x', tags: [], note: 5 }, schema)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.note).toBe('5')
  })
})

describe('trimSectionsToLimit', () => {
  it('keeps hero, contact and footer and the original order', () => {
    const types = ['hero', 'stats', 'process', 'team', 'about', 'services', 'gallery', 'faq', 'cta', 'pricing', 'stats', 'features', 'contact', 'footer']
    const trimmed = trimSectionsToLimit(types.map((type) => ({ type })), 12).map((s) => s.type)
    expect(trimmed).toHaveLength(12)
    expect(trimmed[0]).toBe('hero')
    expect(trimmed.slice(-2)).toEqual(['contact', 'footer'])
  })
})

describe('generateStructured', () => {
  it('accepts a clean first answer without repair', async () => {
    const result = await generateStructured({
      ai,
      schema,
      system: 's',
      prompt: 'p',
      generate: fakeGenerate([JSON.stringify({ title: 'x', tags: [] })]),
    })
    expect(result.outcome).toBe('first_try')
    expect(result.attempts).toBe(1)
  })

  it('repairs an answer in place without a second model call', async () => {
    const generate = vi.fn(fakeGenerate([JSON.stringify({ title: 'x', tags: ['a', 'b', 'c'] })]))
    const result = await generateStructured({ ai, schema, system: 's', prompt: 'p', generate })
    expect(result.outcome).toBe('repaired')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('retries once with the failure listed, and sums both attempts', async () => {
    const prompts: string[] = []
    const inner = fakeGenerate(['not json at all', JSON.stringify({ title: 'ok', tags: [] })])
    const generate: GenerateFn = async (args) => {
      prompts.push(args.prompt)
      return inner(args)
    }
    const result = await generateStructured({ ai, schema, system: 's', prompt: 'p', generate })
    expect(result.outcome).toBe('retried')
    expect(result.attempts).toBe(2)
    expect(prompts[1]).toContain('rejected by validation')
    expect(result.usage.inputTokens).toBe(20)
  })

  it('throws after a failed retry', async () => {
    const generate = fakeGenerate(['nope', 'still nope'])
    await expect(generateStructured({ ai, schema, system: 's', prompt: 'p', generate })).rejects.toBeInstanceOf(
      StructuredGenerationError,
    )
  })

  it('does not retry API errors', async () => {
    const generate = vi.fn(fakeGenerate([new Error('gateway down')]))
    await expect(generateStructured({ ai, schema, system: 's', prompt: 'p', generate })).rejects.toBeInstanceOf(
      StructuredGenerationError,
    )
    expect(generate).toHaveBeenCalledTimes(1)
  })
})
