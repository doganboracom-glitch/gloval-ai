export type EditEntryDecision = 'toggle' | 'open' | 'gate'

/**
 * What the preview's "Siteyi Düzenle" button does. A persisted project (the real
 * editor) just toggles the panel. In the anonymous landing preview the panel
 * never opens: a signed-in visitor gets it, an anonymous one gets the gate.
 */
export function decideEditEntry(input: {
  persisted: boolean
  panelOpen: boolean
  hasUser: boolean
}): EditEntryDecision {
  if (input.persisted || input.panelOpen) return 'toggle'
  return input.hasUser ? 'open' : 'gate'
}
