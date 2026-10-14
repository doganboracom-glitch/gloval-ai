export type SaveFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export type SaveFeedbackMessages = {
  saved: string
  /** Error key -> user-facing text. */
  errors: Record<string, string>
  fallbackError: string
}

type SaveResult<V> = { ok: true; view: V } | { ok: false; error: string }

/**
 * Runs a settings save and turns every outcome (success, a typed server error,
 * an unknown error key, a thrown exception) into one feedback message, so the
 * panel can never end a save without telling the owner what happened.
 */
export async function runSaveWithFeedback<V>(
  action: () => Promise<SaveResult<V>>,
  messages: SaveFeedbackMessages,
): Promise<{ feedback: SaveFeedback; view: V | null }> {
  try {
    const res = await action()
    if (res.ok) return { feedback: { kind: 'success', message: messages.saved }, view: res.view }
    return {
      feedback: { kind: 'error', message: messages.errors[res.error] ?? messages.fallbackError },
      view: null,
    }
  } catch {
    return { feedback: { kind: 'error', message: messages.fallbackError }, view: null }
  }
}
