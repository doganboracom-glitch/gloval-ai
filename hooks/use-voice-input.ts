'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

// Secure-context support never changes after load, so there is nothing to subscribe to.
// The server snapshot stays false so SSR and the first client render agree.
const subscribeNoop = () => () => {}
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { registerVoiceCanceller } from '@/lib/voice/voice-registry'
import { MAX_AUDIO_BYTES, MAX_RECORDING_MS } from '@/lib/voice/audio-limits'
import { composeDictation, mergeIntoText, type SpeechResultLike } from '@/lib/voice/transcript'
import {
  canFallBackToRecorder,
  mapSpeechError,
  recognitionLocale,
  type VoiceErrorCode,
  type VoiceLang,
} from '@/lib/voice/voice-copy'

export type VoiceStatus = 'idle' | 'listening' | 'processing'

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>
}
interface RecognitionErrorEvent {
  error: string
}
interface RecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((event: RecognitionEvent) => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => RecognitionInstance

function getRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return candidates.find((type) => MediaRecorder.isTypeSupported(type))
}

async function transcribeBlob(blob: Blob, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'audio/webm' },
      body: blob,
      signal,
    })
  } catch {
    throw new VoiceError('network')
  }
  if (response.status === 429) throw new VoiceError('rate-limited')
  if (response.status === 413) throw new VoiceError('too-large')
  if (!response.ok) throw new VoiceError('transcribe-failed')
  const data = (await response.json()) as { text?: string }
  return data.text?.trim() ?? ''
}

class VoiceError extends Error {
  constructor(readonly code: VoiceErrorCode) {
    super(code)
  }
}

interface UseVoiceInputOptions {
  lang: VoiceLang
  /** Current text of the field; captured when dictation begins. */
  value: string
  /** Receives the full field text (typed text + dictation). Never submits. */
  onText: (text: string) => void
}

/**
 * Dictation into a text field. Web Speech API is the primary engine; when it
 * is missing (Firefox, in-app browsers) or fails with a recoverable error, a
 * short MediaRecorder capture is transcribed through POST /api/transcribe.
 * Text is only written to the field; sending is always the user's action.
 */
export function useVoiceInput({ lang, value, onText }: UseVoiceInputOptions) {
  const [status, setStatus] = useState<VoiceStatus>('idle')
  const [error, setError] = useState<VoiceErrorCode | null>(null)

  const valueRef = useRef(value)
  const onTextRef = useRef(onText)
  const langRef = useRef(lang)
  valueRef.current = value
  onTextRef.current = onText
  langRef.current = lang

  const sessionRef = useRef(0)
  const statusRef = useRef<VoiceStatus>('idle')
  const baseRef = useRef('')
  const recognitionRef = useRef<RecognitionInstance | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const discardRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const supported = useSyncExternalStore(
    subscribeNoop,
    () => window.isSecureContext !== false,
    () => false,
  )

  const updateStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const fail = useCallback(
    (code: VoiceErrorCode) => {
      clearTimer()
      releaseStream()
      recognitionRef.current = null
      recorderRef.current = null
      setError(code)
      updateStatus('idle')
    },
    [clearTimer, releaseStream, updateStatus],
  )

  const startRecorder = useCallback(
    async (session: number) => {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === 'undefined'
      ) {
        fail('unsupported')
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        })
      } catch (err) {
        if (session !== sessionRef.current) return
        const name = err instanceof DOMException ? err.name : ''
        fail(name === 'NotFoundError' || name === 'NotReadableError' ? 'audio-capture' : 'not-allowed')
        return
      }

      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      streamRef.current = stream
      const mimeType = pickRecorderMimeType()
      const chunks: Blob[] = []
      let size = 0
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 32_000,
        })
      } catch {
        fail('unsupported')
        return
      }
      recorderRef.current = recorder
      discardRef.current = false

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return
        chunks.push(event.data)
        size += event.data.size
        if (size >= MAX_AUDIO_BYTES - 16_384 && recorder.state === 'recording') recorder.stop()
      }

      recorder.onstop = async () => {
        if (session !== sessionRef.current) {
          // Superseded session: only close our own stream, never a newer one's.
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        clearTimer()
        releaseStream()
        recorderRef.current = null
        if (discardRef.current) return

        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        if (blob.size === 0) {
          fail('no-speech')
          return
        }
        if (blob.size > MAX_AUDIO_BYTES) {
          fail('too-large')
          return
        }

        updateStatus('processing')
        const controller = new AbortController()
        abortRef.current = controller
        try {
          const text = await transcribeBlob(blob, controller.signal)
          if (session !== sessionRef.current) return
          if (!text) {
            fail('no-speech')
            return
          }
          onTextRef.current(mergeIntoText(baseRef.current, text))
          updateStatus('idle')
        } catch (err) {
          if (session !== sessionRef.current) return
          fail(err instanceof VoiceError ? err.code : 'transcribe-failed')
        } finally {
          if (abortRef.current === controller) abortRef.current = null
        }
      }

      recorder.start(1000)
      updateStatus('listening')
      timerRef.current = setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, MAX_RECORDING_MS)
    },
    [clearTimer, fail, releaseStream, updateStatus],
  )

  const startRecognition = useCallback(
    (Recognition: RecognitionConstructor, session: number) => {
      const recognition = new Recognition()
      recognition.lang = recognitionLocale(langRef.current)
      recognition.continuous = true
      recognition.interimResults = true
      recognition.maxAlternatives = 1
      recognitionRef.current = recognition

      recognition.onresult = (event) => {
        if (recognitionRef.current !== recognition) return
        const results: SpeechResultLike[] = Array.from(event.results, (result) => ({
          transcript: result[0]?.transcript ?? '',
          isFinal: result.isFinal,
        }))
        onTextRef.current(composeDictation(baseRef.current, results))
      }

      recognition.onerror = (event) => {
        if (recognitionRef.current !== recognition) return
        const code = mapSpeechError(event.error)
        if (code === null) return
        clearTimer()
        recognitionRef.current = null
        if (canFallBackToRecorder(code)) {
          void startRecorder(session)
          return
        }
        fail(code)
      }

      recognition.onend = () => {
        if (recognitionRef.current !== recognition) return
        clearTimer()
        recognitionRef.current = null
        updateStatus('idle')
      }

      try {
        recognition.start()
      } catch {
        recognitionRef.current = null
        void startRecorder(session)
        return
      }
      updateStatus('listening')
      timerRef.current = setTimeout(() => recognition.stop(), MAX_RECORDING_MS)
    },
    [clearTimer, fail, startRecorder, updateStatus],
  )

  const start = useCallback(() => {
    if (statusRef.current !== 'idle') return
    setError(null)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError('insecure-context')
      return
    }
    sessionRef.current += 1
    const session = sessionRef.current
    baseRef.current = valueRef.current

    const Recognition = getRecognitionConstructor()
    if (Recognition) startRecognition(Recognition, session)
    else void startRecorder(session)
  }, [startRecognition, startRecorder])

  /** Ends capture; recognition keeps what it heard and a recording is transcribed. */
  const stop = useCallback(() => {
    clearTimer()
    recognitionRef.current?.stop()
    const recorder = recorderRef.current
    if (recorder && recorder.state === 'recording') recorder.stop()
    else if (statusRef.current === 'listening' && !recognitionRef.current && !recorder) {
      // Waiting on microphone permission: invalidate the pending start.
      sessionRef.current += 1
      releaseStream()
      updateStatus('idle')
    }
  }, [clearTimer, releaseStream, updateStatus])

  /**
   * Tears everything down without producing text (submit, unmount, route
   * change, hidden tab, sign-out). Bumping the session first makes every late
   * recognition / recorder / transcription callback a no-op.
   */
  const cancel = useCallback(() => {
    sessionRef.current += 1
    discardRef.current = true
    clearTimer()
    abortRef.current?.abort()
    abortRef.current = null
    const recognition = recognitionRef.current
    recognitionRef.current = null
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        // Already ended.
      }
    }
    const recorder = recorderRef.current
    recorderRef.current = null
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop()
      } catch {
        // Already stopped.
      }
    }
    releaseStream()
    if (statusRef.current !== 'idle') updateStatus('idle')
  }, [clearTimer, releaseStream, updateStatus])

  const toggle = useCallback(() => {
    if (statusRef.current === 'idle') start()
    else if (statusRef.current === 'listening') stop()
  }, [start, stop])

  const dismissError = useCallback(() => setError(null), [])

  const pathname = usePathname()
  const lastPathnameRef = useRef(pathname)
  useEffect(() => {
    if (lastPathnameRef.current === pathname) return
    lastPathnameRef.current = pathname
    cancel()
  }, [pathname, cancel])

  useEffect(() => registerVoiceCanceller(cancel), [cancel])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') cancel()
    }
    const onPageHide = () => cancel()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onPageHide)

    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') cancel()
    })

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onPageHide)
      data.subscription.unsubscribe()
      cancel()
    }
  }, [cancel])

  return { status, error, supported, start, stop, toggle, cancel, dismissError }
}
