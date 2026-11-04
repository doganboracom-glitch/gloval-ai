import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { checkMakerRequestEmailLimit, checkMakerRequestIpLimit } from './rate-limit'
import { hashMakerRequestIp } from './security'

const secret = 'maker-request-test-secret-with-enough-entropy'

describe('maker request rate limits', () => {
  it('limits an IP by its HMAC digest rather than the raw address', () => {
    const ip = `203.0.113.${randomUUID()}`
    const digest = hashMakerRequestIp(ip, secret)

    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(digest).not.toContain(ip)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkMakerRequestIpLimit(digest).allowed).toBe(true)
    }
    expect(checkMakerRequestIpLimit(digest).allowed).toBe(false)
  })

  it('limits normalized email addresses without putting the address in the key', () => {
    const email = `maker-${randomUUID()}@example.net`
    const spy = vi.spyOn(Date, 'now')
    spy.mockReturnValue(Date.now())

    expect(checkMakerRequestEmailLimit(email, secret).allowed).toBe(true)
    expect(checkMakerRequestEmailLimit(email.toUpperCase(), secret).allowed).toBe(true)
    expect(checkMakerRequestEmailLimit(email, secret).allowed).toBe(true)
    expect(checkMakerRequestEmailLimit(email, secret).allowed).toBe(false)

    spy.mockRestore()
  })
})
