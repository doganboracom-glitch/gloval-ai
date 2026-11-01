'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/components/language-provider'
import { newTicketHref } from '@/lib/support/prefill'

const DISMISSED_KEY = 'gloval:preview-support-notice:dismissed:v1'
const SHOWN_KEY = 'gloval:preview-support-notice:shown:v1'
const REVEAL_DELAY_MS = 1_500
const AUTO_DISMISS_MS = 30_000

function scopedStorageKey(key: string, projectId: string | null) {
  return `${key}:${encodeURIComponent(projectId?.trim() || 'anonymous')}`
}

type Props = {
  projectId?: string | null
  isEditorPreview: boolean
}

export function PreviewSupportCard({ projectId = null, isEditorPreview }: Props) {
  const { t } = useLanguage()
  const scope = projectId?.trim() || 'anonymous'
  const dismissedKey = scopedStorageKey(DISMISSED_KEY, projectId)
  const shownKey = scopedStorageKey(SHOWN_KEY, projectId)
  const [visibleScope, setVisibleScope] = useState<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const remainingTimeMs = useRef(AUTO_DISMISS_MS)
  const visible = isEditorPreview && visibleScope === scope
  const paused = isHovered || hasFocus

  const dismiss = useCallback(() => {
    setVisibleScope(null)
    try {
      window.localStorage.setItem(dismissedKey, 'true')
    } catch {
      // Dismissal still applies to the current mount if storage is blocked.
    }
  }, [dismissedKey])

  useEffect(() => {
    remainingTimeMs.current = AUTO_DISMISS_MS
    if (!isEditorPreview) return

    let dismissed = false
    let shownThisSession = false

    try {
      dismissed =
        window.localStorage.getItem(dismissedKey) === 'true' ||
        window.localStorage.getItem(DISMISSED_KEY) === 'true'
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }

    try {
      shownThisSession =
        window.sessionStorage.getItem(shownKey) === 'true' ||
        window.sessionStorage.getItem(SHOWN_KEY) === 'true'
    } catch {
      // The notice still renders when session storage is unavailable.
    }

    if (dismissed || shownThisSession) return

    const revealTimeout = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(shownKey, 'true')
      } catch {
        // The notice remains visible for this mount even without session storage.
      }
      setVisibleScope(scope)
    }, REVEAL_DELAY_MS)

    return () => window.clearTimeout(revealTimeout)
  }, [dismissedKey, isEditorPreview, scope, shownKey])

  useEffect(() => {
    if (!visible || paused) return

    const startedAt = Date.now()
    const dismissTimeout = window.setTimeout(dismiss, remainingTimeMs.current)

    return () => {
      window.clearTimeout(dismissTimeout)
      remainingTimeMs.current = Math.max(0, remainingTimeMs.current - (Date.now() - startedAt))
    }
  }, [dismiss, paused, visible])

  if (!visible) return null

  const ticketHref = newTicketHref({
    department: 'technical',
    service: 'website',
    projectId: projectId ?? undefined,
  })

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center px-3 sm:px-4">
      <Alert
        role="status"
        aria-live="polite"
        data-testid="preview-support-notice"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onFocusCapture={() => setHasFocus(true)}
        onBlurCapture={(event) => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setHasFocus(false)
          }
        }}
        className="pointer-events-auto w-full max-w-3xl px-4 py-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-300 motion-reduce:animate-none"
      >
        <AlertDescription className="leading-relaxed">
          <p className="text-pretty">
            {t.preview.supportNotice.body}{' '}
            <a
              href={ticketHref}
              className="font-medium text-brand underline underline-offset-2 transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {t.preview.supportNotice.supportLink}
            </a>
          </p>
        </AlertDescription>
        <AlertAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t.preview.supportNotice.dismiss}
            onClick={dismiss}
          >
            <X data-icon="inline-start" aria-hidden="true" />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  )
}
