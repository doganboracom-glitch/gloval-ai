import { describe, expect, it } from 'vitest'
import {
  deriveSetupStatus,
  shouldShowInstantForm,
  type ProviderSettingsView,
  type ProviderSetupOverview,
} from '@/lib/payment-providers/types'

const FIELDS = ['apiKey', 'secretKey']

function settings(partial: Partial<ProviderSettingsView> = {}): ProviderSettingsView {
  return {
    environment: 'sandbox',
    keysPresent: { apiKey: false, secretKey: false },
    tested: false,
    unreadable: false,
    callbackUrl: 'https://example.com/return',
    ...partial,
  }
}

describe('shouldShowInstantForm', () => {
  it('shows when there are no keys', () => {
    expect(shouldShowInstantForm(settings(), 'live', FIELDS)).toBe(true)
  })

  it('shows when only a sandbox key exists, even if tested', () => {
    const view = settings({ keysPresent: { apiKey: true, secretKey: true }, tested: true })
    expect(shouldShowInstantForm(view, 'live', FIELDS)).toBe(true)
  })

  it('shows when a live key is saved but not tested', () => {
    const view = settings({ environment: 'live', keysPresent: { apiKey: true, secretKey: true } })
    expect(shouldShowInstantForm(view, 'live', FIELDS)).toBe(true)
  })

  it('hides once a live key is saved and tested', () => {
    const view = settings({ environment: 'live', keysPresent: { apiKey: true, secretKey: true }, tested: true })
    expect(shouldShowInstantForm(view, 'live', FIELDS)).toBe(false)
  })
})

function overview(partial: Partial<ProviderSetupOverview> = {}): ProviderSetupOverview {
  return {
    readiness: [{ id: 'published', ok: true, fix: 'publish' }],
    siteUrl: 'https://shop.gloval.site',
    state: { appliedAt: null, accountOpenedAt: null },
    help: { enabled: true, prefill: { name: '', email: '', phone: '' } },
    settings: settings(),
    ...partial,
  }
}

describe('deriveSetupStatus', () => {
  it('is setup_required for a ready site with nothing done', () => {
    expect(deriveSetupStatus(overview())).toBe('setup_required')
  })

  it('is not_ready while a readiness check is red', () => {
    const red = overview({ readiness: [{ id: 'published', ok: false, problem: 'not_published', fix: 'publish' }] })
    expect(deriveSetupStatus(red)).toBe('not_ready')
  })

  it('is applied once the owner marked the application', () => {
    const applied = overview({ state: { appliedAt: '2026-01-01', accountOpenedAt: null } })
    expect(deriveSetupStatus(applied)).toBe('applied')
  })

  it('is connected when the keys passed a test, regardless of other state', () => {
    const connected = overview({
      readiness: [{ id: 'published', ok: false, problem: 'not_published', fix: 'publish' }],
      settings: settings({ tested: true }),
    })
    expect(deriveSetupStatus(connected)).toBe('connected')
  })
})
