export type VoiceErrorCode =
  | 'not-allowed'
  | 'service-not-allowed'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'insecure-context'
  | 'unsupported'
  | 'too-large'
  | 'rate-limited'
  | 'transcribe-failed'
  | 'generic'

export type VoiceLang = 'tr' | 'en'

interface VoiceCopy {
  start: string
  stop: string
  listening: string
  processing: string
  stopped: string
  errors: Record<VoiceErrorCode, string>
}

const COPY: Record<VoiceLang, VoiceCopy> = {
  tr: {
    start: 'Sesle yaz',
    stop: 'Dinlemeyi durdur',
    listening: 'Dinleniyor, konuşabilirsiniz.',
    processing: 'Ses yazıya çevriliyor…',
    stopped: 'Dinleme durdu.',
    errors: {
      'not-allowed': 'Mikrofon izni verilmedi. Tarayıcı adres çubuğundan mikrofona izin verin.',
      'service-not-allowed': 'Bu tarayıcıda sesle yazma kullanılamıyor. Başka bir yöntem deneniyor.',
      'no-speech': 'Ses algılanmadı. Mikrofona yaklaşıp tekrar deneyin.',
      'audio-capture': 'Mikrofon bulunamadı veya başka bir uygulama kullanıyor.',
      network: 'Ağ hatası nedeniyle ses tanıma çalışmadı.',
      'insecure-context': 'Mikrofon yalnızca güvenli (HTTPS) bağlantıda kullanılabilir.',
      unsupported: 'Bu tarayıcı ses kaydını desteklemiyor.',
      'too-large': 'Kayıt çok uzun. Daha kısa konuşup tekrar deneyin.',
      'rate-limited': 'Çok fazla ses isteği gönderdiniz. Biraz sonra tekrar deneyin.',
      'transcribe-failed': 'Ses yazıya çevrilemedi. Lütfen tekrar deneyin.',
      generic: 'Sesle yazma sırasında bir sorun oluştu.',
    },
  },
  en: {
    start: 'Dictate',
    stop: 'Stop listening',
    listening: 'Listening, you can speak now.',
    processing: 'Transcribing your voice…',
    stopped: 'Stopped listening.',
    errors: {
      'not-allowed': 'Microphone permission was denied. Allow the microphone from the address bar.',
      'service-not-allowed': 'Voice typing is unavailable in this browser. Trying another method.',
      'no-speech': 'No speech detected. Move closer to the microphone and try again.',
      'audio-capture': 'No microphone found, or another app is using it.',
      network: 'Speech recognition failed because of a network error.',
      'insecure-context': 'The microphone only works on a secure (HTTPS) connection.',
      unsupported: 'This browser does not support audio recording.',
      'too-large': 'The recording is too long. Speak for less time and try again.',
      'rate-limited': 'Too many voice requests. Please try again shortly.',
      'transcribe-failed': 'Could not transcribe the audio. Please try again.',
      generic: 'Something went wrong with voice input.',
    },
  },
}

export function voiceCopy(lang: VoiceLang): VoiceCopy {
  return COPY[lang]
}

/** Speech recognition locale: Turkish by default, English when the UI is not Turkish. */
export function recognitionLocale(lang: VoiceLang): 'tr-TR' | 'en-US' {
  return lang === 'en' ? 'en-US' : 'tr-TR'
}

/**
 * Maps a Web Speech `SpeechRecognitionErrorEvent.error` value onto our codes.
 * `aborted` is user/system initiated and intentionally yields null (silent).
 */
export function mapSpeechError(error: string): VoiceErrorCode | null {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'no-speech':
    case 'audio-capture':
    case 'network':
      return error
    case 'language-not-supported':
      return 'service-not-allowed'
    case 'aborted':
      return null
    default:
      return 'generic'
  }
}

/** Errors for which retrying through MediaRecorder + /api/transcribe can succeed. */
export function canFallBackToRecorder(code: VoiceErrorCode): boolean {
  return code === 'network' || code === 'service-not-allowed'
}
