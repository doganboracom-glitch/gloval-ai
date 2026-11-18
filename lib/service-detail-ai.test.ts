import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/ai-structured', () => ({ generateStructured: vi.fn() }))

import { generateStructured } from '@/lib/ai-structured'
import { fallbackWebsite, type WebsiteSchema } from '@/lib/website-schema'
import { countBlockWords } from '@/lib/service-card'
import { generateServiceDetail, SERVICE_WRITE_TIMEOUT_MS } from '@/lib/service-detail-ai'

const words = (count: number) => Array.from({ length: count }, () => 'hizmet').join(' ')

function siteWithFacts(description = words(32)): WebsiteSchema {
  const base = fallbackWebsite('Kahve atölyesi', 'tr')
  const services = {
    type: 'services' as const,
    title: 'Hizmetler',
    items: [{ title: 'Kahve eğitimi', description }],
    detail: { pageEnabled: true, linkEnabled: true },
  }
  return {
    ...base,
    sections: [...base.sections.filter((section) => section.type !== 'services'), services],
  }
}

function output(wordsPerBlock: number) {
  return {
    shortDescription:
      'Bu hizmet, işletmenin belirlediği kapsam doğrultusunda ihtiyaçları anlamaya ve uygun bir çözüm sunmaya yardımcı olur.',
    icon: 'coffee',
    blocks: ['Hizmetin kapsamı', 'Çalışma yaklaşımı', 'Sonraki adımlar'].map((heading) => ({
      heading,
      body: words(wordsPerBlock),
    })),
  }
}

describe('service detail AI generation', () => {
  it('retries once below 300 words and returns the best grounded response without rejecting shorter copy', async () => {
    const generate = vi.mocked(generateStructured)
    generate.mockResolvedValueOnce({ object: output(64) } as never).mockResolvedValueOnce({ object: output(70) } as never)
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const result = await generateServiceDetail(siteWithFacts(), 0, 'free')

    expect(generate).toHaveBeenCalledTimes(2)
    expect(String(generate.mock.calls[1][0].prompt)).toContain('300 kelime')
    expect(result.written).toBe(true)
    expect(countBlockWords(result.blocks)).toBeLessThan(300)
    expect(result.blocks[0].body).toBe(output(70).blocks[0].body)
    expect(log).toHaveBeenCalledWith(
      '[service-detail] returned below word target',
      expect.objectContaining({ targetWords: 300, attempts: 2 }),
    )
    log.mockRestore()
  })

  it('does not call the model when the service has insufficient facts', async () => {
    const generate = vi.mocked(generateStructured)
    generate.mockReset()

    const result = await generateServiceDetail(siteWithFacts('Kısa'), 0, 'free')

    expect(result).toEqual({
      blocks: expect.any(Array),
      written: false,
      reason: 'thin_facts',
    })
    expect(generate).not.toHaveBeenCalled()
  })

  it('bounds each model call so a slow generation can be reported as a timeout', () => {
    expect(SERVICE_WRITE_TIMEOUT_MS).toBe(45_000)
  })
})
