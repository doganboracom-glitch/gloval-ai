// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

const state = vi.hoisted(() => ({
  data: null as unknown,
  mutate: vi.fn(),
  strings: new Proxy({}, { get: (_target, key) => String(key) }) as Record<string, string>,
}))

vi.mock('swr', () => ({
  default: () => ({ data: state.data, isLoading: false, mutate: state.mutate }),
}))
vi.mock('@/components/language-provider', () => ({
  useLanguage: () => ({ t: { domains: state.strings }, lang: 'en' }),
}))
vi.mock('@/components/domains/renewal-card', () => ({ RenewalCard: () => null }))
vi.mock('@/lib/custom-domains/registrar/manage-actions', () => ({
  loadManagedDomainAction: vi.fn(),
  setPrivacyAction: vi.fn(),
  updateContactAction: vi.fn(),
  updateNameserversAction: vi.fn(),
}))

import { RegistrarManagePanel } from './registrar-manage-panel'

const contact = {
  firstName: 'Test',
  lastName: 'Owner',
  company: '',
  email: 'owner@example.com',
  addressLine1: 'Street 1',
  city: 'Istanbul',
  state: 'Istanbul',
  country: 'TR',
  zipCode: '34000',
  phoneCountryCode: '90',
  phone: '5551234567',
}

beforeEach(() => {
  state.data = {
    ok: true,
    details: {
      domain: 'example.com',
      status: 'Active',
      locked: true,
      privacy: false,
      nameservers: ['ns1.example.com', 'ns2.example.com'],
      expiresAtRaw: '2027-01-01T00:00:00Z',
      expiresAt: '2027-01-01T00:00:00.000Z',
      startedAtRaw: null,
      remainingDays: 100,
      hasAuthCode: true,
    },
    contacts: { registrant: contact, admin: null, tech: null, billing: null },
    contactsUnavailable: false,
  }
})

afterEach(() => cleanup())

describe('WHOIS contact accordion', () => {
  it('starts closed with native button semantics and aria wiring', () => {
    render(<RegistrarManagePanel domain="example.com" />)
    const toggle = screen.getByRole('button', { name: 'mgContacts' })
    expect(toggle.tagName).toBe('BUTTON')
    expect((toggle as HTMLButtonElement).type).toBe('button')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)
    expect(panel).not.toBeNull()
    expect(panel!.hasAttribute('hidden')).toBe(true)
    expect(screen.queryByRole('textbox', { name: 'mgFirstName' })).toBeNull()
  })

  it('opens on activation, reveals the existing form, and closes again', () => {
    render(<RegistrarManagePanel domain="example.com" />)
    const toggle = screen.getByRole('button', { name: 'mgContacts' })
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(panel.hasAttribute('hidden')).toBe(false)
    expect(screen.getByRole('textbox', { name: 'mgFirstName' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'mgContactSave' })).toBeTruthy()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(panel.hasAttribute('hidden')).toBe(true)
  })
})
