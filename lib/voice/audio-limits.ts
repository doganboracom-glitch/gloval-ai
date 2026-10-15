/** Hard ceiling on a dictation recording, enforced client-side and server-side. */
export const MAX_AUDIO_BYTES = 1_048_576
export const MAX_RECORDING_MS = 60_000
export const MIN_AUDIO_BYTES = 800

const ALLOWED_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']

export function isAllowedAudioType(contentType: string | null): boolean {
  if (!contentType) return false
  const base = contentType.split(';')[0].trim().toLowerCase()
  return ALLOWED_TYPES.includes(base)
}

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

/**
 * Cheap container sniff so the endpoint only forwards real audio: EBML (webm),
 * ISO-BMFF `ftyp` (mp4/m4a), Ogg, RIFF (wav) or an MP3 frame/ID3 tag.
 */
export function looksLikeAudio(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) ||
    startsWith(bytes, [0x66, 0x74, 0x79, 0x70], 4) ||
    startsWith(bytes, [0x4f, 0x67, 0x67, 0x53]) ||
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) ||
    startsWith(bytes, [0x49, 0x44, 0x33]) ||
    (bytes.length > 1 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  )
}
