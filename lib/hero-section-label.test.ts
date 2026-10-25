import { describe, expect, it } from 'vitest'
import { dictionary } from '@/lib/i18n'
import { SECTION_LABEL } from '@/lib/website-command-parser'

describe('hero section label', () => {
  it('is "Açılış" in Turkish editor surfaces and stays "Hero" in English', () => {
    expect(dictionary.tr.editor.sectionNames.hero).toBe('Açılış')
    expect(dictionary.en.editor.sectionNames.hero).toBe('Hero')
    expect(SECTION_LABEL.hero).toEqual({ tr: 'Açılış', en: 'Hero' })
  })
})
