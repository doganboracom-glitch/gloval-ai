import { describe, expect, it } from 'vitest'

import { canRefreshMetaPlan, formatSyncedAgo, formatTodaySpend } from '@/lib/ads/meta-overview-refresh'

const objects = { campaignId: '1', adSetId: '2', adId: '3' }
const empty = { campaignId: null, adSetId: null, adId: null }

describe('canRefreshMetaPlan', () => {
  it.each(['published', 'active', 'user_paused'])('%s planı Meta nesneleri varsa yenilenebilir', (status) => {
    expect(canRefreshMetaPlan({ status, objects })).toBe(true)
  })

  it.each(['draft', 'validated', 'approved', 'failed', 'partial', 'archived', 'publishing'])('%s planı yenilenemez', (status) => {
    expect(canRefreshMetaPlan({ status, objects })).toBe(false)
  })

  it('nesneleri eksik veya hiç olmayan plan yenilenemez', () => {
    expect(canRefreshMetaPlan({ status: 'active', objects: empty })).toBe(false)
    expect(canRefreshMetaPlan({ status: 'active', objects: { ...objects, adId: null } })).toBe(false)
    expect(canRefreshMetaPlan({ status: 'active', objects: null })).toBe(false)
    expect(canRefreshMetaPlan({ status: 'active' })).toBe(false)
  })
})

describe('formatSyncedAgo', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('Türkçe göreli süre üretir', () => {
    expect(formatSyncedAgo(ago(10_000), now, 'tr')).toBe('az önce')
    expect(formatSyncedAgo(ago(2 * 60_000), now, 'tr')).toBe('2 dk önce')
    expect(formatSyncedAgo(ago(3 * 3_600_000), now, 'tr')).toBe('3 sa önce')
    expect(formatSyncedAgo(ago(2 * 86_400_000), now, 'tr')).toBe('2 gün önce')
  })

  it('İngilizce göreli süre üretir', () => {
    expect(formatSyncedAgo(ago(5 * 60_000), now, 'en')).toBe('5 min ago')
  })

  it('gelecekteki saati "az önce" sayar; eksik veya bozuk değerde null döner', () => {
    expect(formatSyncedAgo(new Date(now + 60_000).toISOString(), now, 'tr')).toBe('az önce')
    expect(formatSyncedAgo(null, now, 'tr')).toBeNull()
    expect(formatSyncedAgo('bozuk', now, 'tr')).toBeNull()
  })
})

describe('formatTodaySpend', () => {
  it('harcama ve gösterimi birlikte yazar', () => {
    expect(formatTodaySpend({ spend: { todayMajor: 12.5, last7DaysMajor: null, impressionsToday: 340, impressions7Days: null } }, 'TRY', 'tr')).toBe('Bugün: 12,5 TRY · 340 gösterim')
  })

  it('yalnızca olan değeri gösterir', () => {
    expect(formatTodaySpend({ spend: { todayMajor: null, last7DaysMajor: null, impressionsToday: 10, impressions7Days: null } }, 'TRY', 'tr')).toBe('10 gösterim')
  })

  it('veri yoksa null döner', () => {
    expect(formatTodaySpend(null, 'TRY', 'tr')).toBeNull()
    expect(formatTodaySpend({ spend: null }, 'TRY', 'tr')).toBeNull()
    expect(formatTodaySpend({ spend: { todayMajor: null, last7DaysMajor: 5, impressionsToday: null, impressions7Days: 9 } }, 'TRY', 'tr')).toBeNull()
  })
})
