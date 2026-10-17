'use client'

import { useEffect, useRef, type PointerEvent } from 'react'
import { Loader2, Mic, Square } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { useVoiceInput } from '@/hooks/use-voice-input'
import { toBilingual } from '@/lib/i18n'
import { voiceCopy } from '@/lib/voice/voice-copy'
import { cn } from '@/lib/utils'

const HOLD_THRESHOLD_MS = 450
const ERROR_VISIBLE_MS = 7000

interface VoiceInputButtonProps {
  /** Current field text; dictation is appended to it. */
  value: string
  /** Receives the full field text. Dictation never submits the form. */
  onText: (text: string) => void
  disabled?: boolean
  className?: string
}

/**
 * Microphone button for a text field. Press and hold to talk (release stops),
 * or tap to start and tap again to stop. Keyboard: Space/Enter toggles.
 */
export function VoiceInputButton({ value, onText, disabled, className }: VoiceInputButtonProps) {
  const { lang } = useLanguage()
  const voiceLang = toBilingual(lang)
  const copy = voiceCopy(voiceLang)
  const { status, error, supported, start, stop, toggle, cancel, dismissError } = useVoiceInput({
    lang: voiceLang,
    value,
    onText,
  })

  // The field turns busy (generation / publish / locked): shut the microphone
  // down at once instead of letting dictation run behind the action.
  useEffect(() => {
    if (disabled) cancel()
  }, [disabled, cancel])

  const pressStartedAt = useRef<number | null>(null)
  const startedByThisPress = useRef(false)
  const swallowNextClick = useRef(false)

  useEffect(() => {
    if (!error) return
    const timer = setTimeout(dismissError, ERROR_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [error, dismissError])

  const listening = status === 'listening'
  const processing = status === 'processing'

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || processing || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    swallowNextClick.current = true
    if (listening) {
      startedByThisPress.current = false
      pressStartedAt.current = null
      stop()
      return
    }
    startedByThisPress.current = true
    pressStartedAt.current = Date.now()
    start()
  }

  function onPointerUp() {
    const startedAt = pressStartedAt.current
    pressStartedAt.current = null
    if (startedByThisPress.current && startedAt && Date.now() - startedAt >= HOLD_THRESHOLD_MS) {
      stop()
    }
    startedByThisPress.current = false
  }

  function onClick() {
    if (swallowNextClick.current) {
      swallowNextClick.current = false
      return
    }
    if (!disabled && !processing) toggle()
  }

  if (!supported) return null

  const label = listening ? copy.stop : copy.start
  const liveMessage = error
    ? copy.errors[error]
    : listening
      ? copy.listening
      : processing
        ? copy.processing
        : ''

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-pressed={listening}
        aria-label={label}
        title={label}
        disabled={disabled || processing}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(event) => event.preventDefault()}
        onClick={onClick}
        className={cn(
          'relative flex h-9 w-9 shrink-0 touch-none select-none items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          listening && 'border-destructive/60 bg-destructive/10 text-destructive hover:text-destructive',
          className,
        )}
      >
        {listening && (
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-lg bg-destructive/25 motion-safe:animate-ping"
          />
        )}
        <span className="relative">
          {processing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : listening ? (
            <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      <span role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </span>

      {error && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-60 rounded-lg border border-border bg-popover px-3 py-2 text-left text-xs leading-snug text-popover-foreground shadow-lg"
        >
          {copy.errors[error]}
        </span>
      )}
    </span>
  )
}
