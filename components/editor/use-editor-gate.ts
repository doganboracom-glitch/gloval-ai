'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { decideEditEntry } from '@/lib/edit-entry'

export type EditorSessionSource = {
  /** Resolves true only when a real session exists. A failed check means "no". */
  hasSession: () => Promise<boolean>
  /** Calls `onSignedOut` whenever the session ends. Returns an unsubscribe. */
  onSignedOut: (onSignedOut: () => void) => () => void
}

/**
 * The single owner of "is the editor panel open" and "is the edit gate shown".
 *
 * Every way of opening the panel (toolbar button, plan-card button that mounts
 * the preview with the editor requested, the sample-publish dialog's "edit
 * section", ...) MUST call `requestOpen` / `toggle` from here instead of
 * setting state directly. An anonymous visitor never gets the panel: the gate
 * is shown instead. If the panel is somehow open without a session (session
 * expired, state restored), it is closed and the gate is shown.
 *
 * `persisted` is the real editor route, which is authenticated server-side, so
 * a signed-in user there keeps the instant, check-free toggle.
 */
export function useEditorGate({
  persisted,
  initialOpen,
  session,
}: {
  persisted: boolean
  initialOpen: boolean
  session: EditorSessionSource
}) {
  const [open, setOpen] = useState(persisted && initialOpen)
  const [gateOpen, setGateOpen] = useState(false)
  const mountedRef = useRef(true)
  const sessionRef = useRef(session)
  sessionRef.current = session
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const denyAccess = useCallback(() => {
    setOpen(false)
    setGateOpen(true)
  }, [])

  const requestOpen = useCallback(async () => {
    let hasUser = false
    try {
      hasUser = await sessionRef.current.hasSession()
    } catch {
      hasUser = false
    }
    if (!mountedRef.current) return
    if (decideEditEntry({ persisted: false, panelOpen: false, hasUser }) === 'open') {
      setGateOpen(false)
      setOpen(true)
      return
    }
    denyAccess()
  }, [denyAccess])

  const toggle = useCallback(async () => {
    if (decideEditEntry({ persisted, panelOpen: openRef.current, hasUser: false }) === 'toggle') {
      setOpen((v) => !v)
      return
    }
    await requestOpen()
  }, [persisted, requestOpen])

  const close = useCallback(() => setOpen(false), [])
  const closeGate = useCallback(() => setGateOpen(false), [])

  // A preview that asks for the editor on mount goes through the same check.
  const initialRequestedRef = useRef(false)
  useEffect(() => {
    if (persisted || !initialOpen || initialRequestedRef.current) return
    initialRequestedRef.current = true
    void requestOpen()
  }, [persisted, initialOpen, requestOpen])

  // Backstop: whatever opened the panel, an open panel without a session is
  // closed again and the gate is shown.
  useEffect(() => {
    if (!open || persisted) return
    let cancelled = false
    void (async () => {
      let ok = false
      try {
        ok = await sessionRef.current.hasSession()
      } catch {
        ok = false
      }
      if (!cancelled && mountedRef.current && !ok) denyAccess()
    })()
    return () => {
      cancelled = true
    }
  }, [open, persisted, denyAccess])

  // Session ended while the panel is open (any editor, persisted or not).
  useEffect(() => {
    return sessionRef.current.onSignedOut(() => {
      if (!mountedRef.current) return
      if (openRef.current) denyAccess()
    })
  }, [denyAccess])

  return { open, gateOpen, toggle, requestOpen, close, closeGate }
}
