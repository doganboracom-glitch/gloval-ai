/**
 * Gate for SELLING the "Aura İmleç" add-on. Off unless
 * AURA_CURSOR_FEATURE_UI is exactly `true`.
 *
 * Read by the /billing page (to list the card) and by the purchase action (to
 * refuse a forged call). It is NOT read by the public renderer or by the owner
 * settings action: a site that already holds the right (bought, or granted by an
 * admin) keeps working whatever this says.
 */
export function isAuraCursorFeatureUiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.AURA_CURSOR_FEATURE_UI === 'true'
}
