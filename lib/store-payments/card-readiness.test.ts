import { describe, expect, it, vi } from 'vitest'
import { resolveIyzicoReadiness } from '@/lib/store-payments/card-readiness'

describe('resolveIyzicoReadiness', () => {
  it('is ready when tested and the order columns exist', async () => {
    const r = await resolveIyzicoReadiness({ ok: true, tested: true }, async () => true)
    expect(r).toEqual({ ready: true, unreadable: false, infrastructure: false })
  })

  it('reports infrastructure when tested but the order columns are missing', async () => {
    const r = await resolveIyzicoReadiness({ ok: true, tested: true }, async () => false)
    expect(r).toEqual({ ready: false, unreadable: false, infrastructure: true })
  })

  it('reports not tested (not infrastructure) and skips the column probe', async () => {
    const probe = vi.fn(async () => false)
    const r = await resolveIyzicoReadiness({ ok: true, tested: false }, probe)
    expect(r).toEqual({ ready: false, unreadable: false, infrastructure: false })
    expect(probe).not.toHaveBeenCalled()
  })

  it('reports missing keys as not tested', async () => {
    const probe = vi.fn(async () => false)
    const r = await resolveIyzicoReadiness({ ok: false, reason: 'not_configured' }, probe)
    expect(r).toEqual({ ready: false, unreadable: false, infrastructure: false })
    expect(probe).not.toHaveBeenCalled()
  })

  it('reports unreadable credentials', async () => {
    const r = await resolveIyzicoReadiness({ ok: false, reason: 'unreadable' }, async () => true)
    expect(r).toEqual({ ready: false, unreadable: true, infrastructure: false })
  })
})
