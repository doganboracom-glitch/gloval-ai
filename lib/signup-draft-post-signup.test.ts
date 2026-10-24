import { describe, expect, it } from 'vitest'
import { resolvePostSignUp } from './signup-draft-client'

describe('resolvePostSignUp', () => {
  it('warns when a session already exists and the draft could not be saved', () => {
    expect(resolvePostSignUp({ hasSession: true, draftToken: null, draftFailed: true })).toEqual({
      kind: 'warn-draft-lost',
    })
  })

  it('resumes the draft when a session exists and the draft was saved', () => {
    expect(resolvePostSignUp({ hasSession: true, draftToken: 'tok', draftFailed: false })).toEqual({
      kind: 'resume',
      token: 'tok',
    })
  })

  it('goes straight to the dashboard when there was no draft at all', () => {
    expect(resolvePostSignUp({ hasSession: true, draftToken: null, draftFailed: false })).toEqual({
      kind: 'dashboard',
    })
  })

  it('leaves the notice to the verification page when e-mail confirmation is pending', () => {
    expect(resolvePostSignUp({ hasSession: false, draftToken: null, draftFailed: true })).toEqual({
      kind: 'verify-email',
    })
  })
})
