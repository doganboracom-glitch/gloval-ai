import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  AVATAR_PRESET_COUNT,
  cycleAvatar,
  isFemalePreset,
  nextAvatarForNewItem,
  parseAvatar,
  presetForPosition,
  presetSrc,
  resolveAvatar,
} from '@/lib/testimonial-avatars'
import { applyOperation } from '@/lib/website-edit-operations'
import { fallbackWebsite } from '@/lib/website-schema'
import type { WebsiteSchema } from '@/lib/website-schema'

describe('avatar presets', () => {
  it('ships 12 illustrations on disk', () => {
    for (let n = 1; n <= AVATAR_PRESET_COUNT; n++) {
      expect(existsSync(join(process.cwd(), 'public', presetSrc(n)))).toBe(true)
    }
  })

  it('alternates woman, man and wraps after 12', () => {
    expect([1, 2, 3, 4].map(isFemalePreset)).toEqual([true, false, true, false])
    expect(presetForPosition(12)).toBe(1)
    expect(presetForPosition(-1)).toBe(12)
  })

  it('parses only known values', () => {
    expect(parseAvatar('preset:12')).toEqual({ kind: 'preset', n: 12 })
    expect(parseAvatar('preset:13')).toBeNull()
    expect(parseAvatar('initials')).toEqual({ kind: 'initials' })
    expect(parseAvatar('nonsense')).toBeNull()
    expect(parseAvatar(undefined)).toBeNull()
  })

  it('cycles in order and wraps', () => {
    expect(cycleAvatar('preset:1', 0)).toBe('preset:2')
    expect(cycleAvatar('preset:12', 0)).toBe('preset:1')
    expect(cycleAvatar(undefined, 2)).toBe('preset:4')
    expect(cycleAvatar('initials', 2)).toBe('preset:3')
    expect(nextAvatarForNewItem(0)).toBe('preset:1')
    expect(nextAvatarForNewItem(12)).toBe('preset:1')
  })

  it('resolves legacy items by position and respects the avatars switch', () => {
    expect(resolveAvatar({}, 0, false)).toEqual({ kind: 'none' })
    expect(resolveAvatar({}, 1, true)).toMatchObject({ kind: 'preset', n: 2 })
    expect(resolveAvatar({}, 1, true, 'initials')).toEqual({ kind: 'initials' })
    expect(resolveAvatar({ photo: { src: 'x' } }, 0, true)).toEqual({ kind: 'photo' })
    expect(resolveAvatar({ avatar: 'initials' }, 0, true)).toEqual({ kind: 'initials' })
  })
})

describe('avatar edit operations', () => {
  const site = (): WebsiteSchema => ({
    ...fallbackWebsite('"Örnek Atölye" için kurumsal bir site', 'tr'),
    sections: [
      {
        type: 'testimonials',
        title: 'Yorumlar',
        items: [
          { quote: 'Çok iyi.', author: 'Deniz T.' },
          { quote: 'Güzel iş.', author: 'Mert A.', avatar: 'preset:12' },
        ],
      },
    ],
  })
  const items = (s: WebsiteSchema) => (s.sections[0] as Extract<WebsiteSchema['sections'][number], { type: 'testimonials' }>).items

  it('cycleTestimonialAvatar steps one review', () => {
    const next = applyOperation(site(), { op: 'cycleTestimonialAvatar', index: 0, item: 1 })
    expect(items(next)[1].avatar).toBe('preset:1')
    expect(items(next)[0].avatar).toBeUndefined()
    const first = applyOperation(site(), { op: 'cycleTestimonialAvatar', index: 0, item: 0 })
    expect(items(first)[0].avatar).toBe('preset:2')
  })

  it('refuses the photo choice without a photo and unknown values', () => {
    const a = applyOperation(site(), { op: 'updateTestimonial', index: 0, item: 0, patch: { avatar: 'photo' } })
    expect(items(a)[0].avatar).toBeUndefined()
    const b = applyOperation(site(), { op: 'updateTestimonial', index: 0, item: 0, patch: { avatar: 'initials' } })
    expect(items(b)[0].avatar).toBe('initials')
  })

  it('gives a new review the next illustration in order', () => {
    const next = applyOperation(site(), { op: 'addItem', index: 0 })
    expect(items(next)[2].avatar).toBe('preset:3')
  })
})
