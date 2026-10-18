import { describe, expect, it } from 'vitest'
import {
  isForeignPoolTopic,
  pickStarterTopics,
  STARTER_BLOG_TOPICS,
  STARTER_POST_COUNT,
  type PooledSector,
} from '@/lib/starter-blog-topics'

const SECTORS = Object.keys(STARTER_BLOG_TOPICS) as PooledSector[]

describe('starter blog topic fit', () => {
  it('covers the 10 business types', () => {
    expect(SECTORS).toHaveLength(10)
  })

  it('has no generic pool for unknown businesses', () => {
    expect(SECTORS).not.toContain('default' as never)
    expect(pickStarterTopics('default', 'any-seed')).toEqual([])
  })

  it.each(SECTORS)('%s: three distinct topics, all from its own pool', (sector) => {
    for (const seed of ['a', 'project-1', '7f3c9e2a-1b44-4c0e-9d1a-2f6a8e5b9c10', 'x'.repeat(40)]) {
      const topics = pickStarterTopics(sector, seed)
      expect(topics).toHaveLength(STARTER_POST_COUNT)
      expect(new Set(topics).size).toBe(STARTER_POST_COUNT)
      for (const topic of topics) {
        expect(STARTER_BLOG_TOPICS[sector]).toContain(topic)
        expect(isForeignPoolTopic(topic, sector)).toBe(false)
      }
    }
  })

  it.each(SECTORS)('%s: no topic is shared with another sector pool', (sector) => {
    for (const topic of STARTER_BLOG_TOPICS[sector]) {
      for (const other of SECTORS.filter((s) => s !== sector)) {
        expect(STARTER_BLOG_TOPICS[other]).not.toContain(topic)
      }
    }
  })

  it('flags a topic from another sector as foreign, including for unknown sites', () => {
    const dental = STARTER_BLOG_TOPICS.dental[0]
    expect(isForeignPoolTopic(dental, 'food')).toBe(true)
    expect(isForeignPoolTopic(dental, 'default')).toBe(true)
    expect(isForeignPoolTopic(dental, 'dental')).toBe(false)
  })
})
