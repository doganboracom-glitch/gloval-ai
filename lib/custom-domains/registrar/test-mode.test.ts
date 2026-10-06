import { describe, expect, it } from 'vitest'
import { REGISTRAR_ENDPOINTS, decideRegistrarMode, isProductionRuntime } from './test-mode'

const PROD = { VERCEL_ENV: 'production' }
const PREVIEW = { VERCEL_ENV: 'preview' }
const LOCAL = { NODE_ENV: 'development' }

describe('decideRegistrarMode', () => {
  it.each(['true', 'True', 'TRUE', ' true ', "'true'", '"true"', '1', 'yes', 'on'])(
    'treats %j as test mode in every environment',
    (raw) => {
      for (const env of [PROD, PREVIEW, LOCAL]) {
        expect(decideRegistrarMode(raw, env)).toEqual({
          kind: 'test',
          testMode: true,
          endpoint: REGISTRAR_ENDPOINTS.test,
        })
      }
    },
  )

  it.each(['false', 'False', "'false'", '0', 'no', 'off'])('allows live for %j only in production', (raw) => {
    expect(decideRegistrarMode(raw, PROD)).toEqual({
      kind: 'live',
      testMode: false,
      endpoint: REGISTRAR_ENDPOINTS.production,
    })
    expect(decideRegistrarMode(raw, PREVIEW)).toEqual({ kind: 'blocked', reason: 'live_not_allowed_here' })
    expect(decideRegistrarMode(raw, LOCAL)).toEqual({ kind: 'blocked', reason: 'live_not_allowed_here' })
  })

  it.each(['', '   ', "''", undefined])('blocks an unset flag %j instead of defaulting to live', (raw) => {
    expect(decideRegistrarMode(raw, PROD)).toEqual({ kind: 'blocked', reason: 'mode_unset' })
  })

  it.each(['maybe', 'ote', "'tru"])('blocks unrecognised value %j', (raw) => {
    expect(decideRegistrarMode(raw, PROD)).toEqual({ kind: 'blocked', reason: 'mode_unrecognized' })
  })

  it('never returns the production endpoint for a test-mode flag', () => {
    const decision = decideRegistrarMode("'true'", PROD)
    expect(decision.kind === 'test' && decision.endpoint).toBe(REGISTRAR_ENDPOINTS.test)
  })
})

describe('isProductionRuntime', () => {
  it('prefers VERCEL_ENV over NODE_ENV', () => {
    expect(isProductionRuntime({ VERCEL_ENV: 'preview', NODE_ENV: 'production' })).toBe(false)
    expect(isProductionRuntime({ VERCEL_ENV: 'production', NODE_ENV: 'development' })).toBe(true)
  })

  it('falls back to NODE_ENV off Vercel', () => {
    expect(isProductionRuntime({ NODE_ENV: 'production' })).toBe(true)
    expect(isProductionRuntime({ NODE_ENV: 'development' })).toBe(false)
    expect(isProductionRuntime({})).toBe(false)
  })
})
