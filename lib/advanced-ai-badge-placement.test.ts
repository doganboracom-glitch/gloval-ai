import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

const ADVANCED_FLOWS: Array<{ file: string; flow: string }> = [
  { file: 'components/ecommerce/product-ai-assistant.tsx', flow: 'productText' },
  { file: 'components/editor/logo-studio-dialog.tsx', flow: 'logoEmblem' },
  { file: 'components/editor/blog-ai-panel.tsx', flow: 'blogWrite' },
]

describe('"Gelişmiş AI" badge placement', () => {
  it('is absent from the editor AI chat (edits run on the standard model)', () => {
    const src = read('components/website-editor-panel.tsx')
    expect(src).not.toContain('AdvancedAiBadge')
    expect(src).not.toContain('gelişmiş AI modeliyle')
    expect(src).not.toMatch(/advanced AI model/i)
  })

  it('is absent from the home page prompt box (no badge, no PRO lock label)', () => {
    const src = read('components/hero.tsx')
    expect(src).not.toContain('AdvancedAiBadge')
    expect(src).not.toContain('advanced-ai-badge')
    expect(src).not.toContain('Gelişmiş AI')
  })

  it.each(ADVANCED_FLOWS)('$file renders the badge for the $flow flow', ({ file, flow }) => {
    const src = read(file)
    expect(src).toContain("from '@/components/advanced-ai-badge'")
    expect(src).toContain(`<AdvancedAiBadge flow="${flow}"`)
  })

  it('every badge usage in the app names a flow that runs on the advanced model', () => {
    const files = [...ADVANCED_FLOWS.map((f) => f.file)]
    for (const file of files) {
      const flows = [...read(file).matchAll(/<AdvancedAiBadge[^>]*flow="(\w+)"/g)].map((m) => m[1])
      expect(flows.length).toBeGreaterThan(0)
    }
  })
})
