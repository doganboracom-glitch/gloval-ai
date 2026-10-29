import { describe, expect, it } from 'vitest'
import { isJsonRequest, isSameOriginRequest } from './request-guard'

const req = (headers: Record<string, string>) =>
  new Request('https://gloval.ai/api/admin/domains/registrar-probe', { method: 'POST', headers })

describe('isSameOriginRequest', () => {
  it('accepts a matching Origin', () => {
    expect(isSameOriginRequest(req({ origin: 'https://gloval.ai', host: 'gloval.ai' }))).toBe(true)
  })
  it('prefers x-forwarded-host behind a proxy', () => {
    expect(isSameOriginRequest(req({ origin: 'https://gloval.ai', 'x-forwarded-host': 'gloval.ai', host: 'internal:3000' }))).toBe(true)
  })
  it('rejects a foreign Origin', () => {
    expect(isSameOriginRequest(req({ origin: 'https://evil.example', host: 'gloval.ai' }))).toBe(false)
  })
  it('rejects a missing or malformed Origin', () => {
    expect(isSameOriginRequest(req({ host: 'gloval.ai' }))).toBe(false)
    expect(isSameOriginRequest(req({ origin: 'null', host: 'gloval.ai' }))).toBe(false)
  })
})

describe('isJsonRequest', () => {
  it('accepts application/json with parameters', () => {
    expect(isJsonRequest(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true)
  })
  it('rejects form encodings and a missing type', () => {
    expect(isJsonRequest(req({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false)
    expect(isJsonRequest(req({ 'content-type': 'text/plain' }))).toBe(false)
    expect(isJsonRequest(req({}))).toBe(false)
  })
})
