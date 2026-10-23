/** Undo/redo stack for the editor's schema. `present` is the live value. */
export type History<T> = {
  past: T[]
  present: T | null
  future: T[]
}

/** Records `next` as a new step. A value identical to the present one adds nothing, so undo never has empty steps. */
export function pushHistory<T>(h: History<T>, next: T): History<T> {
  if (h.present === null) return h
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h
  return { past: [...h.past, h.present], present: next, future: [] }
}

export function undoHistory<T>(h: History<T>): History<T> {
  if (!h.past.length || h.present === null) return h
  const prev = h.past[h.past.length - 1]
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] }
}

export function redoHistory<T>(h: History<T>): History<T> {
  if (!h.future.length || h.present === null) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}
