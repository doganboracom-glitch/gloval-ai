export interface SpeechResultLike {
  transcript: string
  isFinal: boolean
}

/**
 * Splits a Web Speech `results` list into the text the engine has committed
 * (final) and the still-changing tail (interim). Interim chunks that precede a
 * final one are never expected, but if they occur they are kept in order.
 */
export function splitSpeechResults(results: readonly SpeechResultLike[]): {
  final: string
  interim: string
} {
  let final = ''
  let interim = ''
  for (const result of results) {
    const piece = result.transcript.trim()
    if (!piece) continue
    if (result.isFinal) final = joinSpoken(final, piece)
    else interim = joinSpoken(interim, piece)
  }
  return { final, interim }
}

function joinSpoken(left: string, right: string): string {
  if (!left) return right
  if (!right) return left
  return `${left} ${right}`
}

/**
 * Appends dictated text to whatever the user had already typed, separated by a
 * single space (or a newline-preserving join when the base ends in one).
 */
export function mergeIntoText(base: string, spoken: string): string {
  const addition = spoken.trim()
  if (!addition) return base
  if (!base.trim()) return addition
  const separator = /\s$/.test(base) ? '' : ' '
  return `${base}${separator}${addition}`
}

/** Final + interim speech composed onto the text that existed when listening began. */
export function composeDictation(base: string, results: readonly SpeechResultLike[]): string {
  const { final, interim } = splitSpeechResults(results)
  return mergeIntoText(base, joinSpoken(final, interim))
}
