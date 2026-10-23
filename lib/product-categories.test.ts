import { describe, expect, it } from 'vitest'
import { addCategory, findCategoryGroup, renameCategory } from '@/lib/product-categories'
import { slugify } from '@/lib/slug'

type Section = Parameters<typeof addCategory>[0]

const base = {
  type: 'products',
  categories: ['Yazıcılar', 'Kağıtlar'],
  items: [{ name: 'A4', category: 'Kağıtlar' }],
} as unknown as Section

function renamed(section: Section, from: string, to: string): Section {
  const result = renameCategory(section, from, to)
  if (!result.ok) throw new Error(result.error)
  return result.section
}

describe('category rename redirects', () => {
  it('records the old address and leaves untouched sites without a redirect map', () => {
    expect(base.categoryRedirects).toBeUndefined()
    const next = renamed(base, 'Kağıtlar', 'Ofis Kağıtları')
    expect(next.categoryRedirects).toEqual({ [slugify('Kağıtlar')]: slugify('Ofis Kağıtları') })
  })

  it('chains earlier redirects to the newest address', () => {
    const second = renamed(renamed(base, 'Kağıtlar', 'Ofis Kağıtları'), 'Ofis Kağıtları', 'Kırtasiye')
    expect(second.categoryRedirects).toEqual({
      [slugify('Kağıtlar')]: slugify('Kırtasiye'),
      [slugify('Ofis Kağıtları')]: slugify('Kırtasiye'),
    })
  })

  it('drops the redirect when the original name comes back', () => {
    const back = renamed(renamed(base, 'Kağıtlar', 'Ofis Kağıtları'), 'Ofis Kağıtları', 'Kağıtlar')
    expect(back.categoryRedirects).toEqual({ [slugify('Ofis Kağıtları')]: slugify('Kağıtlar') })
  })

  it('lets a re-added category win over an old redirect', () => {
    const moved = renamed(base, 'Kağıtlar', 'Ofis Kağıtları')
    const added = addCategory(moved, 'Kağıtlar')
    if (!added.ok) throw new Error(added.error)
    expect(added.section.categoryRedirects?.[slugify('Kağıtlar')]).toBeUndefined()
  })
})

describe('findCategoryGroup', () => {
  const groups = [{ slug: 'ofis-kagitlari' }, { slug: 'yazicilar' }]

  it('prefers a live category over a redirect', () => {
    expect(findCategoryGroup(groups, { yazicilar: 'ofis-kagitlari' }, 'yazicilar')).toEqual({
      group: groups[1],
      moved: false,
    })
  })

  it('follows a redirect and flags it as moved', () => {
    expect(findCategoryGroup(groups, { kagitlar: 'ofis-kagitlari' }, 'kagitlar')).toEqual({
      group: groups[0],
      moved: true,
    })
  })

  it('returns null for unknown or dangling addresses', () => {
    expect(findCategoryGroup(groups, { eski: 'silinmis' }, 'eski')).toBeNull()
    expect(findCategoryGroup(groups, undefined, 'yok')).toBeNull()
  })
})
