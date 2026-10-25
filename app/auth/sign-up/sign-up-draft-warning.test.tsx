// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { dictionary } from '@/lib/i18n'

const t = dictionary.tr
const DRAFT_TOKEN = 'a'.repeat(43)

const push = vi.fn()
const replace = vi.fn()
const refresh = vi.fn()
const signUp = vi.fn()
const createSignupDraft = vi.fn()
const resumeSignupDraft = vi.fn()
const getSession = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, refresh }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@/components/language-provider', () => ({ useLanguage: () => ({ t, lang: 'tr' }) }))
vi.mock('@/components/auth/auth-shell', () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))
vi.mock('@/components/auth/oauth-buttons', () => ({ OAuthButtons: () => null, OAuthDivider: () => null }))
vi.mock('@/components/link-button', () => ({
  LinkButton: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signUp,
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  }),
}))
vi.mock('@/lib/signup-draft-actions', () => ({
  createSignupDraft: (...args: unknown[]) => createSignupDraft(...args),
  resumeSignupDraft: (...args: unknown[]) => resumeSignupDraft(...args),
}))
vi.mock('@/lib/auth-redirect', () => ({ getAuthCallbackUrl: () => 'https://gloval.ai/auth/callback' }))
vi.mock('@/lib/analytics', () => ({ trackSignUp: vi.fn() }))
vi.mock('@/lib/attribution', () => ({ readAttribution: () => null }))
vi.mock('@/lib/signup-attribution', () => ({ saveSignupAttribution: vi.fn() }))

import SignUpPage from './page'
import SignUpSuccessPage from '../sign-up-success/page'

async function submitSignUp() {
  render(<SignUpPage />)
  fireEvent.change(screen.getByLabelText(t.auth.email), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText(t.auth.password), { target: { value: 'sifre-12345' } })
  fireEvent.submit(screen.getByRole('button', { name: t.auth.signup }).closest('form')!)
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('gloval:pending-project', JSON.stringify({ token: 'p1', schema: {}, name: 'Kahve' }))
  createSignupDraft.mockResolvedValue({ ok: false })
  resumeSignupDraft.mockResolvedValue(null)
  getSession.mockResolvedValue({ data: { session: null } })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('sign-up with a draft that could not be saved', () => {
  it('e-mail confirmation OFF (session exists): warns on the sign-up page and does not redirect until the user continues', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: { access_token: 'x' } }, error: null })
    await submitSignUp()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(t.auth.draftNotSavedSignedIn)
    expect(push).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: t.auth.draftNotSavedContinue }))
    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(sessionStorage.getItem('gloval:signup-draft-failed')).toBeNull()
  })

  it('e-mail confirmation ON (no session): redirects to the verification page, which shows the notice there', async () => {
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })
    await submitSignUp()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/sign-up-success'))
    expect(screen.queryByText(t.auth.draftNotSavedSignedIn)).toBeNull()
    expect(sessionStorage.getItem('gloval:signup-draft-failed')).toBe('1')

    cleanup()
    render(<SignUpSuccessPage />)
    const notice = await screen.findByRole('alert')
    expect(notice.textContent).toBe(t.auth.draftNotSaved)
  })

  it('parks an idea-only draft before sign-up and preserves it with the server token', async () => {
    sessionStorage.removeItem('gloval:pending-project')
    sessionStorage.setItem('gloval:signup-idea', 'Bir kahve sitesi kur')
    createSignupDraft.mockResolvedValue({ ok: true, token: DRAFT_TOKEN })
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })

    await submitSignUp()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/sign-up-success'))
    expect(createSignupDraft).toHaveBeenCalledWith({
      email: 'ada@example.com',
      draft: { kind: 'idea', prompt: 'Bir kahve sitesi kur' },
    })
    expect(createSignupDraft.mock.invocationCallOrder[0]).toBeLessThan(signUp.mock.invocationCallOrder[0])
    expect(sessionStorage.getItem('gloval:signup-draft')).toBe(DRAFT_TOKEN)
    expect(sessionStorage.getItem('gloval:signup-idea')).toBeNull()
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: expect.stringContaining(`draft=${DRAFT_TOKEN}`),
          data: expect.objectContaining({
            email_locale: 'tr',
            signup_draft_token: DRAFT_TOKEN,
            signup_next_path: encodeURIComponent('/dashboard'),
          }),
        }),
      }),
    )
  })

  it('restores a verified idea on the homepage without generating a project', async () => {
    sessionStorage.removeItem('gloval:pending-project')
    sessionStorage.setItem('gloval:signup-draft', 'idea-token')
    getSession.mockResolvedValue({ data: { session: { access_token: 'x' } } })
    resumeSignupDraft.mockResolvedValue({ status: 'idea', prompt: 'Bir kahve sitesi kur' })

    render(<SignUpSuccessPage />)

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(sessionStorage.getItem('gloval:signup-idea')).toBe('Bir kahve sitesi kur')
    expect(sessionStorage.getItem('gloval:signup-draft')).toBeNull()
  })

  it('shows no warning on either path when the draft was saved', async () => {
    createSignupDraft.mockResolvedValue({ ok: true, token: 'tok' })
    signUp.mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null })
    await submitSignUp()

    await waitFor(() => expect(push).toHaveBeenCalledWith('/auth/sign-up-success'))
    expect(sessionStorage.getItem('gloval:signup-draft-failed')).toBeNull()
    cleanup()
    sessionStorage.removeItem('gloval:signup-draft')
    render(<SignUpSuccessPage />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
