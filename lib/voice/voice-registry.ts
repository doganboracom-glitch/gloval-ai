const cancellers = new Set<() => void>()

/** Lets every mounted dictation hook be shut down synchronously by a submit/publish action. */
export function registerVoiceCanceller(cancel: () => void): () => void {
  cancellers.add(cancel)
  return () => {
    cancellers.delete(cancel)
  }
}

/**
 * Stops all dictation (recognition, recorder, microphone tracks, pending
 * transcription) immediately. Call at the very start of any send / generate /
 * publish action so no late dictation result can touch the submitted text.
 */
export function stopAllVoiceInput(): void {
  cancellers.forEach((cancel) => cancel())
}
