import { describe, expect, it } from 'vitest'
import { composeDictation, mergeIntoText, splitSpeechResults } from './transcript'
import { isAllowedAudioType, looksLikeAudio } from './audio-limits'
import { canFallBackToRecorder, mapSpeechError, recognitionLocale } from './voice-copy'

describe('transcript composition', () => {
  it('keeps typed text and appends final plus interim speech', () => {
    const text = composeDictation('Bir kafe sitesi', [
      { transcript: 'modern ve sıcak', isFinal: true },
      { transcript: 'menü sayfası', isFinal: false },
    ])
    expect(text).toBe('Bir kafe sitesi modern ve sıcak menü sayfası')
  })

  it('recomputes from the whole results list so interim text never duplicates', () => {
    const first = composeDictation('', [{ transcript: 'merhaba', isFinal: false }])
    const second = composeDictation('', [{ transcript: 'merhaba dünya', isFinal: true }])
    expect(first).toBe('merhaba')
    expect(second).toBe('merhaba dünya')
  })

  it('does not double the separator when the base already ends in whitespace', () => {
    expect(mergeIntoText('Merhaba\n', 'dünya')).toBe('Merhaba\ndünya')
  })

  it('leaves the base untouched for empty speech', () => {
    expect(mergeIntoText('abc', '   ')).toBe('abc')
    expect(splitSpeechResults([])).toEqual({ final: '', interim: '' })
  })
})

describe('speech errors', () => {
  it('treats aborted as silent and maps unknown errors to generic', () => {
    expect(mapSpeechError('aborted')).toBeNull()
    expect(mapSpeechError('bad-grammar')).toBe('generic')
  })

  it('falls back to the recorder only for recoverable errors', () => {
    expect(canFallBackToRecorder('network')).toBe(true)
    expect(canFallBackToRecorder(mapSpeechError('language-not-supported')!)).toBe(true)
    expect(canFallBackToRecorder('not-allowed')).toBe(false)
    expect(canFallBackToRecorder('audio-capture')).toBe(false)
  })

  it('uses Turkish unless the UI is English', () => {
    expect(recognitionLocale('tr')).toBe('tr-TR')
    expect(recognitionLocale('en')).toBe('en-US')
  })
})

describe('audio validation', () => {
  it('accepts known containers and rejects arbitrary bytes', () => {
    expect(looksLikeAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))).toBe(true)
    expect(looksLikeAudio(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))).toBe(true)
    expect(looksLikeAudio(new TextEncoder().encode('<html>not audio</html>'))).toBe(false)
  })

  it('allows only audio content types', () => {
    expect(isAllowedAudioType('audio/webm;codecs=opus')).toBe(true)
    expect(isAllowedAudioType('text/html')).toBe(false)
    expect(isAllowedAudioType(null)).toBe(false)
  })
})
