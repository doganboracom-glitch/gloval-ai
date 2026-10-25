import { describe, expect, it } from 'vitest'
import { evaluateFreePublish, publishOptionsFromVerdict } from '@/lib/free-publish'

const base = {
  alreadyLive: false,
  isStorefront: false,
  pageCount: 3,
  pageLimit: 5,
  otherPublished: 0,
  siteLimit: 1,
}

describe('evaluateFreePublish', () => {
  it('lets a small corporate site publish on FREE', () => {
    expect(evaluateFreePublish(base)).toEqual({ ok: true })
    expect(publishOptionsFromVerdict(evaluateFreePublish(base))).toEqual({ mode: 'free_choice' })
  })

  it('blocks storefronts', () => {
    expect(evaluateFreePublish({ ...base, isStorefront: true })).toMatchObject({ ok: false, block: 'storefront' })
  })

  it('blocks a second published site', () => {
    expect(evaluateFreePublish({ ...base, otherPublished: 1 })).toMatchObject({
      ok: false,
      block: 'site_limit',
      used: 1,
      total: 1,
    })
  })

  it('blocks more pages than the plan allows', () => {
    expect(evaluateFreePublish({ ...base, pageCount: 6 })).toMatchObject({ ok: false, block: 'page_limit', limit: 5 })
  })

  it('never refuses a re-publish of a live site', () => {
    expect(evaluateFreePublish({ ...base, alreadyLive: true, isStorefront: true, pageCount: 9, otherPublished: 3 })).toEqual({
      ok: true,
    })
  })
})
