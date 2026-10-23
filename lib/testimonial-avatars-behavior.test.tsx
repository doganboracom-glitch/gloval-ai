import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { TestimonialCard } from '@/components/website-renderer/sections/testimonial-card'
import { pushHistory, redoHistory, undoHistory, type History } from '@/lib/schema-history'
import { SECTION_LABEL } from '@/lib/website-command-parser'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'
import { dictionary } from '@/lib/i18n'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const item = { quote: 'Çok memnun kaldık.', author: 'Deniz Tan', avatar: 'preset:3' }

describe('review card avatar switch', () => {
  it('shows the avatar when "Kartlarda avatar göster" is on', () => {
    const html = renderToStaticMarkup(<TestimonialCard item={item} showAvatars lang="tr" />)
    expect(html).toContain('data-testimonial-avatar="preset:3"')
    expect(html).toContain('/avatars/v1/avatar-03.svg')
  })

  it('hides the avatar when it is off, whatever the review stores', () => {
    for (const stored of ['preset:3', 'initials', undefined]) {
      const html = renderToStaticMarkup(<TestimonialCard item={{ ...item, avatar: stored }} showAvatars={false} lang="tr" />)
      expect(html).not.toContain('data-testimonial-avatar')
      expect(html).not.toContain('/avatars/v1/')
    }
  })
})

describe('"Avatarı değiştir" costs nothing and is undoable', () => {
  const start = (): WebsiteSchema => ({
    ...fallbackWebsite('"Örnek Atölye" için kurumsal bir site', 'tr'),
    sections: [{ type: 'testimonials', title: 'Müşteri Yorumları', showAvatars: true, items: [{ quote: 'Güzel iş.', author: 'Mert A.', avatar: 'preset:1' }] }],
  })
  const avatarOf = (s: WebsiteSchema | null) => (s?.sections[0] as { items: { avatar?: string }[] }).items[0].avatar

  it('is a local edit: no AI, credit or network module is involved', () => {
    const ops = read('lib/website-edit-operations.ts')
    expect(ops).not.toMatch(/ai-credits|plan-credit|fetch\(/)
    const fields = read('components/editor/testimonials-fields.tsx')
    expect(fields).toMatch(/onDispatch\(\{ op: 'cycleTestimonialAvatar'/)
    expect(fields).not.toMatch(/onSubmitAi|ai-credits/)
    const preview = read('components/website-preview.tsx')
    const dispatch = preview.slice(preview.indexOf('const dispatch = useCallback'), preview.indexOf('const undo = useCallback'))
    expect(dispatch).not.toMatch(/credit|fetch\(|\/api\//i)
  })

  it('steps back with undo and forward with redo', () => {
    let h: History<WebsiteSchema> = { past: [], present: start(), future: [] }
    h = pushHistory(h, applyOperation(h.present!, { op: 'cycleTestimonialAvatar', index: 0, item: 0 }))
    expect(avatarOf(h.present)).toBe('preset:2')
    h = undoHistory(h)
    expect(avatarOf(h.present)).toBe('preset:1')
    h = redoHistory(h)
    expect(avatarOf(h.present)).toBe('preset:2')
    expect(h.past).toHaveLength(1)
    expect(h.future).toHaveLength(0)
  })

  it('records no step for a no-op', () => {
    const h: History<WebsiteSchema> = { past: [], present: start(), future: [] }
    expect(pushHistory(h, start())).toBe(h)
  })
})

describe('section name "Müşteri Yorumları" / "Customer Reviews"', () => {
  it('is used by the section list, the "Bölüm ekle" picker and the panel', () => {
    expect(dictionary.tr.editor.sectionNames.testimonials).toBe('Müşteri Yorumları')
    expect(dictionary.en.editor.sectionNames.testimonials).toBe('Customer Reviews')
    const panel = read('components/website-editor-panel.tsx')
    expect(panel.match(/t\.editor\.sectionNames\[/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('is used by AI edit feedback and understood as an instruction', () => {
    expect(SECTION_LABEL.testimonials).toEqual({ tr: 'Müşteri Yorumları', en: 'Customer Reviews' })
  })

  it('leaves the schema key alone', () => {
    const next = applyOperation({ ...fallbackWebsite('x', 'tr'), sections: [] }, { op: 'addSection', sectionType: 'testimonials' })
    expect(next.sections.map((s) => s.type)).toEqual(['testimonials'])
  })
})
