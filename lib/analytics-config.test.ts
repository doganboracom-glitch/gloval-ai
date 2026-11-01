import { describe, expect, it } from 'vitest'
import { isAuthPath, isMeasurementSurface } from './analytics-config'

const authPaths = [
  '/auth',
  '/auth/login',
  '/auth/confirm',
  '/auth/confirm/verify',
  '/auth/error',
  '/forgot-password',
]

describe('auth analytics exclusion', () => {
  it.each(authPaths)('excludes %s from platform measurement', (pathname) => {
    expect(isAuthPath(pathname)).toBe(true)
    expect(isMeasurementSurface('gloval.ai', pathname)).toBe(false)
  })

  it('does not exclude similarly prefixed public routes', () => {
    expect(isAuthPath('/authentication')).toBe(false)
    expect(isMeasurementSurface('gloval.ai', '/authentication')).toBe(true)
  })

  it('continues to measure non-auth platform pages', () => {
    expect(isMeasurementSurface('gloval.ai', '/')).toBe(true)
    expect(isMeasurementSurface('gloval.ai', '/pricing')).toBe(true)
  })
})
