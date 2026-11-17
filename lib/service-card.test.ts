import { describe, expect, it } from 'vitest'
import { SERVICE_ITEM_LIMITS } from '@/lib/service-item-limits'
import { blocksToText, normalizeServiceText, textToBlocks } from '@/lib/service-card'

describe('service description text conversion', () => {
  it('round-trips generated headings, Turkish text, paragraphs, and lists', () => {
    const blocks = [
      {
        heading: 'Özel kahve hizmetleri',
        level: 'h2' as const,
        body: 'İlk paragrafı açıklayın.\n\n- Taze çekirdek\n- Usta barista',
      },
      {
        heading: 'Nasıl çalışır?',
        level: 'h3' as const,
        body: 'Önce ihtiyaçları dinleriz.\n\nSonra birlikte planlarız.',
      },
    ]

    expect(textToBlocks(blocksToText(blocks))).toEqual(blocks)
  })

  it('keeps text before the first heading as an unheaded block and recognizes both heading levels', () => {
    expect(textToBlocks('Kısa giriş.\n\n- Birinci adım\n- İkinci adım\n\n## Hizmet\n\nAçıklama.\n\n### Süreç\n\nDetay.')).toEqual([
      { body: 'Kısa giriş.\n\n- Birinci adım\n- İkinci adım' },
      { heading: 'Hizmet', level: 'h2', body: 'Açıklama.' },
      { heading: 'Süreç', level: 'h3', body: 'Detay.' },
    ])
  })

  it('round-trips blocks without headings and drops empty blocks', () => {
    const blocks = [{ body: 'Düz metin.\n\n- Madde bir\n- Madde iki' }]
    expect(textToBlocks(blocksToText(blocks))).toEqual(blocks)
    expect(textToBlocks(' \n\n## \n\n  ')).toEqual([])
  })
})

describe('service description limits', () => {
  it('splits oversized blocks at paragraph boundaries while preserving text', () => {
    const first = 'a'.repeat(3000)
    const second = 'b'.repeat(3000)
    const result = normalizeServiceText(`## Açıklama\n\n${first}\n\n${second}`)

    expect(result.warning).toBeNull()
    expect(result.blocks).toEqual([
      { heading: 'Açıklama', level: 'h2', body: first },
      { body: second },
    ])
    expect(result.blocks.every((block) => block.body.length <= SERVICE_ITEM_LIMITS.blockBody)).toBe(true)
  })

  it('merges block overflow into the last allowed block without dropping content', () => {
    const count = SERVICE_ITEM_LIMITS.blocks + 1
    const text = Array.from({ length: count }, (_, index) => `## Bölüm ${index + 1}\n\nİçerik ${index + 1}`).join('\n\n')
    const result = normalizeServiceText(text)

    expect(result.warning).toBeNull()
    expect(result.blocks).toHaveLength(SERVICE_ITEM_LIMITS.blocks)
    const serialized = blocksToText(result.blocks)
    for (let index = 1; index <= count; index += 1) {
      expect(serialized).toContain(`İçerik ${index}`)
    }
    expect(result.blocks.at(-1)?.body).toContain(`Bölüm ${count}`)
  })

  it('warns instead of truncating when a paragraph or heading cannot fit', () => {
    const oversizedParagraph = 'x'.repeat(SERVICE_ITEM_LIMITS.blockBody + 1)
    const paragraphResult = normalizeServiceText(oversizedParagraph)
    const headingResult = normalizeServiceText(
      `## ${'Başlık'.repeat(SERVICE_ITEM_LIMITS.blockHeading)}\n\nKısa açıklama`,
    )

    expect(paragraphResult.warning).toBe('paragraph-too-long')
    expect(textToBlocks(oversizedParagraph)[0]?.body).toBe(oversizedParagraph)
    expect(headingResult.warning).toBe('heading-too-long')
  })

  it('warns when merging overflow would exceed the last block size', () => {
    const count = SERVICE_ITEM_LIMITS.blocks + 1
    const text = Array.from(
      { length: count },
      (_, index) => `## Bölüm ${index + 1}\n\n${'x'.repeat(SERVICE_ITEM_LIMITS.blockBody)}`,
    ).join('\n\n')

    expect(normalizeServiceText(text).warning).toBe('block-limit')
    expect(textToBlocks(text)).toHaveLength(count)
  })
})
