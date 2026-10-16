'use client'

import { createContext, useContext, useMemo } from 'react'
import {
  BLOG_LABEL,
  blogIndexHref,
  shouldShowBlogLink,
  shouldShowLatestPosts,
  type SiteBlogData,
} from '@/lib/blog-site'
import type { BlogSettings } from '@/lib/website-schema'

type SiteBlogValue = {
  blog: SiteBlogData | null
  settings: BlogSettings | undefined
}

const SiteBlogContext = createContext<SiteBlogValue>({ blog: null, settings: undefined })

export function SiteBlogProvider({
  blog,
  settings,
  children,
}: {
  blog: SiteBlogData | null
  settings: BlogSettings | undefined
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ blog, settings }), [blog, settings])
  return <SiteBlogContext.Provider value={value}>{children}</SiteBlogContext.Provider>
}

export function useSiteBlog(): SiteBlogValue {
  return useContext(SiteBlogContext)
}

/** The real blog link for the menu and footer, or null when it must not show. */
export function useBlogLink(): { href: string; label: string } | null {
  const { blog, settings } = useSiteBlog()
  if (!blog || !shouldShowBlogLink(blog, settings)) return null
  return { href: blogIndexHref(blog), label: BLOG_LABEL }
}

/** The data for the latest-posts block, or null when it must not show. */
export function useLatestPosts(): { blog: SiteBlogData; settings: BlogSettings | undefined } | null {
  const { blog, settings } = useSiteBlog()
  if (!blog || !shouldShowLatestPosts(blog, settings)) return null
  return { blog, settings }
}
