import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
}))

import { consumeCredits, refundCredits } from '@/lib/ai-credits'

const ROOT = process.cwd()
const SOURCE = /\.(ts|tsx)$/
const SKIP_DIRS = new Set(['node_modules', '.next'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SOURCE.test(name)) out.push(full)
  }
  return out
}

/** Every source file that belongs to the ads feature: lib/ads/** plus any app route or component under an `ads` path. */
function adsSourceFiles(): string[] {
  const roots = ['lib/ads', 'app', 'components'].map((r) => path.join(ROOT, r))
  return roots
    .flatMap((r) => {
      try {
        return walk(r)
      } catch {
        return []
      }
    })
    .filter((f) => {
      const rel = path.relative(ROOT, f).split(path.sep).join('/')
      return /(^|\/)ads(\/|[-.])/.test(rel) || rel.startsWith('lib/ads/')
    })
    .filter((f) => !f.endsWith('.test.ts') && !f.endsWith('.test.tsx'))
}

/** Source without comments, so prose that merely names a helper is not mistaken for a call. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

describe('ads code uses only the ads credit RPCs', () => {
  const files = adsSourceFiles()

  it('finds the ads sources it is meant to police', () => {
    const rel = files.map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    expect(rel).toContain('lib/ads/credits.ts')
    expect(rel).toContain('lib/ads/free-quota.ts')
  })

  it('never calls consumeCredits, refundCredits or the generic credit RPCs', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = code(file)
      if (/\b(consumeCredits|refundCredits)\b/.test(text) || /['"`](consume_ai_credits|refund_ai_credits)['"`]/.test(text)) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('does not write the credit ledger table directly', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = code(file)
      if (/from\(\s*['"`]ai_credit_transactions['"`]\s*\)\s*\.\s*(insert|upsert|update|delete)/.test(text)) {
        offenders.push(path.relative(ROOT, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('only credits.ts calls the ads charge and refund RPCs', () => {
    const callers = files
      .filter((f) => /['"`](ads_charge_credits|ads_refund_credits)['"`]/.test(code(f)))
      .map((f) => path.relative(ROOT, f).split(path.sep).join('/'))
    expect(callers).toEqual(['lib/ads/credits.ts'])
  })
})

describe('the generic credit helpers refuse the ads ledger namespace', () => {
  beforeEach(() => {
    rpc.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it.each(['ads:image:req-abcdef12', 'ads_refund:image:req-abcdef12', 'ads:'])(
    'consumeCredits(%s) fails without touching the database',
    async (reason) => {
      expect(await consumeCredits('user-1', 3, reason)).toEqual({ ok: false, balance: 0 })
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it.each(['ads:image:req-abcdef12', 'ads_refund:image:req-abcdef12'])(
    'refundCredits(%s) returns 0 without touching the database',
    async (reason) => {
      expect(await refundCredits('user-1', 3, reason)).toBe(0)
      expect(rpc).not.toHaveBeenCalled()
    },
  )

  it('still serves ordinary reasons', async () => {
    rpc.mockReturnValue({ maybeSingle: async () => ({ data: { ok: true, balance: 9 }, error: null }) })
    expect(await consumeCredits('user-1', 1, 'image_generation')).toEqual({ ok: true, balance: 9 })
    expect(rpc).toHaveBeenCalledWith('consume_ai_credits', {
      p_user_id: 'user-1',
      p_amount: 1,
      p_reason: 'image_generation',
    })
  })
})
