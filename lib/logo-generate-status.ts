export type LogoGenerateErrorKind = 'auth' | 'credits' | 'dailyLimit' | 'failed'

/** Maps a `/api/logo-image` HTTP status to the UX the editor should show. */
export function classifyLogoGenerateStatus(status: number): LogoGenerateErrorKind {
  if (status === 401) return 'auth'
  if (status === 402) return 'credits'
  if (status === 429) return 'dailyLimit'
  return 'failed'
}
