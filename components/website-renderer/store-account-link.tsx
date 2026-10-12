'use client'

import useSWR from 'swr'
import { UserRound } from 'lucide-react'
import { accountLinkLabel, storeAccountHref, storeSessionApiHref } from '@/lib/store-header-links'

import { fetchStoreSession } from '@/lib/store-session-client'

/**
 * Customer-account entry in a storefront header: "Giriş yap" when signed out,
 * "Hesabım" when signed in. Icon-only on small screens (label stays available
 * to assistive tech), label + icon from `sm` up.
 */
export function StoreAccountLink({ slug, lang = 'tr' }: { slug: string; lang?: 'tr' | 'en' }) {
  const { data } = useSWR(storeSessionApiHref(slug), fetchStoreSession, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    shouldRetryOnError: false,
  })
  const label = accountLinkLabel(Boolean(data?.loggedIn), lang)

  return (
    <a
      href={storeAccountHref(slug)}
      data-header-account
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 px-3 py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
      style={{
        borderRadius: 'var(--site-radius)',
        fontFamily: 'var(--site-body-font)',
        color: 'var(--site-fg)',
      }}
    >
      <UserRound className="size-5" aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </a>
  )
}
