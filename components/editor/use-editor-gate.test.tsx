// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useEditorGate, type EditorSessionSource } from '@/components/editor/use-editor-gate'

afterEach(cleanup)

function makeSession(initial: boolean) {
  let signedIn = initial
  const listeners = new Set<() => void>()
  const source: EditorSessionSource = {
    hasSession: vi.fn(async () => signedIn),
    onSignedOut: (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
  return {
    source,
    signOut() {
      signedIn = false
      listeners.forEach((l) => l())
    },
    expireSilently() {
      signedIn = false
    },
  }
}

function setup(opts: { signedIn: boolean; persisted?: boolean; initialOpen?: boolean }) {
  const session = makeSession(opts.signedIn)
  const hook = renderHook(() =>
    useEditorGate({
      persisted: opts.persisted ?? false,
      initialOpen: opts.initialOpen ?? false,
      session: session.source,
    }),
  )
  return { session, ...hook }
}

describe('editor panel entry points (landing preview)', () => {
  describe('1. toolbar "Siteyi Düzenle" button (toggle)', () => {
    it('anonymous: panel stays closed, gate is shown', async () => {
      const { result } = setup({ signedIn: false })
      await act(async () => {
        await result.current.toggle()
      })
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(true)
    })

    it('signed in: panel opens, no gate', async () => {
      const { result } = setup({ signedIn: true })
      await act(async () => {
        await result.current.toggle()
      })
      expect(result.current.open).toBe(true)
      expect(result.current.gateOpen).toBe(false)
    })

    it('signed in: second click closes the panel', async () => {
      const { result } = setup({ signedIn: true })
      await act(async () => {
        await result.current.toggle()
      })
      await act(async () => {
        await result.current.toggle()
      })
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(false)
    })
  })

  describe('2. AI plan card "Siteyi Düzenle" (preview mounted with editor requested)', () => {
    it('anonymous: the panel never renders open, gate is shown', async () => {
      const { result } = setup({ signedIn: false, initialOpen: true })
      expect(result.current.open).toBe(false)
      await waitFor(() => expect(result.current.gateOpen).toBe(true))
      expect(result.current.open).toBe(false)
    })

    it('signed in: panel opens', async () => {
      const { result } = setup({ signedIn: true, initialOpen: true })
      await waitFor(() => expect(result.current.open).toBe(true))
      expect(result.current.gateOpen).toBe(false)
    })
  })

  describe('3. sample-publish dialog "edit section" (requestOpen)', () => {
    it('anonymous: gate instead of panel', async () => {
      const { result } = setup({ signedIn: false })
      await act(async () => {
        await result.current.requestOpen()
      })
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(true)
    })

    it('signed in: panel opens', async () => {
      const { result } = setup({ signedIn: true })
      await act(async () => {
        await result.current.requestOpen()
      })
      expect(result.current.open).toBe(true)
    })
  })

  describe('4. session ends while the panel is open', () => {
    it('sign-out event closes the panel and shows the gate', async () => {
      const { result, session } = setup({ signedIn: true })
      await act(async () => {
        await result.current.toggle()
      })
      expect(result.current.open).toBe(true)
      act(() => session.signOut())
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(true)
    })

    it('backstop: a panel that is open without a session is closed again', async () => {
      const { result, session } = setup({ signedIn: true })
      await act(async () => {
        await result.current.requestOpen()
      })
      expect(result.current.open).toBe(true)
      session.expireSilently()
      // Re-open path (e.g. restored state) re-runs the check and denies.
      await act(async () => {
        await result.current.requestOpen()
      })
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(true)
    })

    it('a failing session check is treated as anonymous', async () => {
      const session = makeSession(true)
      session.source.hasSession = vi.fn(async () => {
        throw new Error('network')
      })
      const { result } = renderHook(() =>
        useEditorGate({ persisted: false, initialOpen: false, session: session.source }),
      )
      await act(async () => {
        await result.current.toggle()
      })
      expect(result.current.open).toBe(false)
      expect(result.current.gateOpen).toBe(true)
    })
  })

  describe('gate lifecycle', () => {
    it('cancel closes the gate and leaves the panel closed', async () => {
      const { result } = setup({ signedIn: false })
      await act(async () => {
        await result.current.toggle()
      })
      act(() => result.current.closeGate())
      expect(result.current.gateOpen).toBe(false)
      expect(result.current.open).toBe(false)
    })
  })
})

describe('real editor route (persisted, signed in) is unchanged', () => {
  it('opens on mount without any session check', () => {
    const { result, session } = setup({ signedIn: true, persisted: true, initialOpen: true })
    expect(result.current.open).toBe(true)
    expect(session.source.hasSession).not.toHaveBeenCalled()
  })

  it('toggles instantly without any session check', async () => {
    const { result, session } = setup({ signedIn: true, persisted: true })
    await act(async () => {
      await result.current.toggle()
    })
    expect(result.current.open).toBe(true)
    await act(async () => {
      await result.current.toggle()
    })
    expect(result.current.open).toBe(false)
    expect(session.source.hasSession).not.toHaveBeenCalled()
  })

  it('still closes and shows the gate when the session ends', async () => {
    const { result, session } = setup({ signedIn: true, persisted: true, initialOpen: true })
    act(() => session.signOut())
    expect(result.current.open).toBe(false)
    expect(result.current.gateOpen).toBe(true)
  })
})
