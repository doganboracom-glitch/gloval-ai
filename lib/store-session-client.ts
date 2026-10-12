import { mutate } from 'swr'
import { normalizeSessionPayload, storeSessionApiHref } from '@/lib/store-header-links'

/** SWR fetcher for the header's session check; any failure reads as signed out. */
export async function fetchStoreSession(url: string): Promise<{ loggedIn: boolean }> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
    if (!res.ok) return { loggedIn: false }
    return normalizeSessionPayload(await res.json())
  } catch {
    return { loggedIn: false }
  }
}

/** Call after a successful login/register so the header flips to "Hesabım" at once. */
export function markStoreSessionLoggedIn(slug: string) {
  return mutate(storeSessionApiHref(slug), { loggedIn: true }, { revalidate: true })
}

/** Call after logout so the header flips back to "Giriş yap" at once. */
export function markStoreSessionLoggedOut(slug: string) {
  return mutate(storeSessionApiHref(slug), { loggedIn: false }, { revalidate: true })
}
