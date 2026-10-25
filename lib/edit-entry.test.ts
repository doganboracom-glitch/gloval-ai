import { describe, expect, it } from 'vitest'
import { decideEditEntry } from '@/lib/edit-entry'
import { resumeTargetPath } from '@/lib/signup-draft-core'

describe('edit gate (landing preview)', () => {
  it('shows the gate to an anonymous visitor', () => {
    expect(decideEditEntry({ persisted: false, panelOpen: false, hasUser: false })).toBe('gate')
  })

  it('opens the panel straight away for a signed-in visitor', () => {
    expect(decideEditEntry({ persisted: false, panelOpen: false, hasUser: true })).toBe('open')
  })

  it('never gates the real editor or an already open panel', () => {
    expect(decideEditEntry({ persisted: true, panelOpen: false, hasUser: false })).toBe('toggle')
    expect(decideEditEntry({ persisted: false, panelOpen: true, hasUser: false })).toBe('toggle')
  })
})

describe('after sign-up the edit intent lands in the editor, publish flow is untouched', () => {
  it('opens the plain editor for an edit intent (no publish prompt)', () => {
    expect(resumeTargetPath('p1', { editIntent: true })).toBe('/editor/p1')
    expect(resumeTargetPath('p1', {})).toBe('/editor/p1')
  })

  it('keeps the autopublish flow for a publish intent', () => {
    expect(resumeTargetPath('p1', { publishIntent: true })).toBe('/editor/p1?autopublish=1')
    expect(resumeTargetPath('p1', { publishIntent: true, editIntent: true })).toBe('/editor/p1?autopublish=1')
  })
})
