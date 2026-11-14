import { describe, expect, it } from 'vitest'
import { getDemoCardImage } from '@/components/dbajans-campaign-landing'
import { allDemos } from '@/lib/demos'

describe('getDemoCardImage', () => {
  it('returns an image source for every demo in the campaign grid', () => {
    expect(allDemos).toHaveLength(12)

    for (const demo of allDemos) {
      const image = getDemoCardImage(demo.slug)

      expect(image, demo.slug).not.toBeNull()
      expect(image?.src.trim(), demo.slug).not.toBe('')
      expect(image?.alt.trim(), demo.slug).not.toBe('')
    }
  })

  it('returns null for a slug without a demo image', () => {
    expect(getDemoCardImage('unknown-demo')).toBeNull()
  })
})
