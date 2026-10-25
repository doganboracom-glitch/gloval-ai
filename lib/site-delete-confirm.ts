/**
 * Typed confirmation for permanently deleting a site. Shared by the dialog (to
 * enable the red button) and by the server action (to refuse unconfirmed
 * requests), so the UI can never be the only line of defence.
 *
 * Turkish casing is the trap: "SİL".toLowerCase() is "si̇l" (i + combining dot)
 * and "SIL" lowercases to "sil" while "SIL" under the `tr` locale becomes
 * "sıl". Every i-variant is therefore folded to a plain "i" by hand instead of
 * relying on locale-dependent case mapping.
 */

/** Words accepted as confirmation, after folding (Turkish and English UI). */
const ACCEPTED_WORDS = new Set(['sil', 'delete'])

/** The word shown to the user in the Turkish interface. */
export const SITE_DELETE_WORD_TR = 'SİL'
/** The word shown to the user in every other interface language. */
export const SITE_DELETE_WORD_EN = 'DELETE'

export function foldDeleteConfirmation(input: string): string {
  return input
    .normalize('NFC')
    .trim()
    .replace(/[İIıi\u0307]/g, 'i')
    .toLowerCase()
}

/** True for "SİL", "SIL", "sil", "Sil", "sıl" (and "delete" in any case), ignoring outer whitespace. */
export function isDeleteConfirmation(input: unknown): boolean {
  if (typeof input !== 'string' || input.length > 32) return false
  return ACCEPTED_WORDS.has(foldDeleteConfirmation(input))
}
