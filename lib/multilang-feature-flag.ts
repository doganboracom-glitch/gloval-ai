/**
 * Gate for selling the "Çoklu Dil Paketi" add-on. Off unless
 * MULTILANG_FEATURE_UI is exactly `true`.
 *
 * Read by the /billing page (to list the card) and by the purchase action (to
 * refuse a forged call). It is NOT read by any public renderer: a site that
 * already owns the right is resolved through `hasAddon`, whatever this says.
 */
export function isMultilangFeatureUiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.MULTILANG_FEATURE_UI === 'true'
}
