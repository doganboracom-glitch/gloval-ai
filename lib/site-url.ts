const DEFAULT_SITE_URL = 'https://gloval.ai'

/** Absolute base URL of the platform (no trailing slash). Safe on server and client. */
export function siteBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '')
}

export const DASHBOARD_MESSAGES_PATH = '/dashboard/messages'

/** Absolute link to the owner's contact message inbox, used in emails. */
export function dashboardMessagesUrl(): string {
  return `${siteBaseUrl()}${DASHBOARD_MESSAGES_PATH}`
}
