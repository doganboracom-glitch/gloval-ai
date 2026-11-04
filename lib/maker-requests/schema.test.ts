import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('maker_requests SQL migration', () => {
  it('documents that it is unapplied and restricts access to service_role', () => {
    const sql = readFileSync(resolve(process.cwd(), 'scripts/096-maker-requests.sql'), 'utf8')

    expect(sql).toMatch(/NOT APPLIED/i)
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/i)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.maker_requests FROM PUBLIC, anon, authenticated/i)
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.maker_requests TO service_role/i)
    expect(sql).toMatch(/reply_text text/i)
    expect(sql).toMatch(/ip_hash text/i)
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })
})
