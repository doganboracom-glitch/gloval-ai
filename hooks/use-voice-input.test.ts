// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

let mockPathname = '/'
let authListener: ((event: string) => void) | null = null

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: (cb: (event: string) => void) => {
        authListener = cb
        return { data: { subscription: { unsubscribe: () => { authListener = null } } } }
      },
    },
  }),
}))

import { useVoiceInput } from './use-voice-input'
import { stopAllVoiceInput } from '@/lib/voice/voice-registry'

interface FakeTrack {
  stop: ReturnType<typeof vi.fn>
}

let tracks: FakeTrack[] = []
let recorders: FakeMediaRecorder[] = []
let recognitions: FakeRecognition[] = []

class FakeMediaRecorder {
  static isTypeSupported() {
    return true
  }
  state: 'inactive' | 'recording' = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onstop: (() => void | Promise<void>) | null = null
  constructor() {
    recorders.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    void this.onstop?.()
  }
}

class FakeRecognition {
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onend: (() => void) | null = null
  start = vi.fn()
  stop = vi.fn()
  abort = vi.fn()
  constructor() {
    recognitions.push(this)
  }
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

function useRecorderEngine() {
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
}

function useRecognitionEngine() {
  Object.defineProperty(window, 'webkitSpeechRecognition', { value: FakeRecognition, configurable: true })
}

function setup(value = 'merhaba') {
  const onText = vi.fn()
  const hook = renderHook(() => useVoiceInput({ lang: 'tr', value, onText }))
  return { ...hook, onText }
}

beforeEach(() => {
  tracks = []
  recorders = []
  recognitions = []
  mockPathname = '/'
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => {
        const track: FakeTrack = { stop: vi.fn() }
        tracks.push(track)
        return { getTracks: () => [track] }
      }),
    },
  })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  useRecorderEngine()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function startRecording(hook: ReturnType<typeof setup>) {
  await act(async () => {
    hook.result.current.start()
  })
  expect(hook.result.current.status).toBe('listening')
  expect(tracks).toHaveLength(1)
  expect(tracks[0].stop).not.toHaveBeenCalled()
}

describe('useVoiceInput shutdown', () => {
  it('closes every microphone track the moment a submit action runs', async () => {
    const hook = setup()
    await startRecording(hook)

    act(() => stopAllVoiceInput())

    expect(tracks[0].stop).toHaveBeenCalled()
    expect(recorders[0].state).toBe('inactive')
    expect(hook.result.current.status).toBe('idle')
  })

  it('aborts Web Speech recognition on submit and drops its late results', () => {
    useRecognitionEngine()
    const hook = setup('selam')
    act(() => hook.result.current.start())
    expect(hook.result.current.status).toBe('listening')
    const recognition = recognitions[0]
    const lateResult = recognition.onresult

    act(() => stopAllVoiceInput())

    expect(recognition.abort).toHaveBeenCalledTimes(1)
    expect(hook.result.current.status).toBe('idle')
    // Even a handler reference kept by the engine must be a no-op after submit.
    lateResult?.({ results: [Object.assign([{ transcript: 'geç gelen' }], { isFinal: true })] })
    expect(hook.onText).not.toHaveBeenCalled()
  })

  it('closes tracks when the component unmounts', async () => {
    const hook = setup()
    await startRecording(hook)

    hook.unmount()

    expect(tracks[0].stop).toHaveBeenCalled()
    expect(recorders[0].state).toBe('inactive')
  })

  it('closes tracks when the tab becomes hidden', async () => {
    const hook = setup()
    await startRecording(hook)

    act(() => setVisibility('hidden'))

    expect(tracks[0].stop).toHaveBeenCalled()
    expect(hook.result.current.status).toBe('idle')
  })

  it('closes tracks on route change', async () => {
    const hook = setup()
    await startRecording(hook)

    mockPathname = '/dashboard'
    hook.rerender()

    expect(tracks[0].stop).toHaveBeenCalled()
    expect(hook.result.current.status).toBe('idle')
  })

  it('closes tracks when the session signs out', async () => {
    const hook = setup()
    await startRecording(hook)

    act(() => authListener?.('SIGNED_OUT'))

    expect(tracks[0].stop).toHaveBeenCalled()
  })

  it('closes a stream that resolves after the user already submitted', async () => {
    let release: (() => void) | undefined
    const track: FakeTrack = { stop: vi.fn() }
    const getUserMedia = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ getTracks: () => [track] })
        }),
    )
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    const hook = setup()
    act(() => hook.result.current.start())

    act(() => stopAllVoiceInput())
    await act(async () => release?.())

    expect(track.stop).toHaveBeenCalled()
    expect(recorders).toHaveLength(0)
    expect(hook.result.current.status).toBe('idle')
  })
})

describe('useVoiceInput late transcription', () => {
  async function recordAndStop(hook: ReturnType<typeof setup>) {
    await startRecording(hook)
    recorders[0].ondataavailable?.({ data: new Blob(['ses-verisi']) })
    await act(async () => {
      hook.result.current.stop()
    })
  }

  it('aborts the pending transcription request and never writes its result', async () => {
    let signal: AbortSignal | undefined
    let resolveFetch: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
      }),
    )
    const hook = setup()
    await recordAndStop(hook)
    expect(hook.result.current.status).toBe('processing')

    act(() => stopAllVoiceInput())
    expect(signal?.aborted).toBe(true)
    expect(hook.result.current.status).toBe('idle')

    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ text: 'geç yazılan metin' })))
    })

    expect(hook.onText).not.toHaveBeenCalled()
    expect(hook.result.current.status).toBe('idle')
  })

  it('ignores a transcription that completes after submit even if the request cannot be aborted', async () => {
    let resolveFetch: ((response: Response) => void) | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          }),
      ),
    )
    const hook = setup()
    await recordAndStop(hook)

    act(() => stopAllVoiceInput())
    await act(async () => {
      resolveFetch?.(new Response(JSON.stringify({ text: 'gönderimden sonra' })))
    })

    expect(hook.onText).not.toHaveBeenCalled()
  })

  it('still writes the transcription when nothing cancelled it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ text: 'normal sonuç' }))),
    )
    const hook = setup('başlangıç')
    await recordAndStop(hook)
    await act(async () => {})

    expect(hook.onText).toHaveBeenCalledWith(expect.stringContaining('normal sonuç'))
  })
})
