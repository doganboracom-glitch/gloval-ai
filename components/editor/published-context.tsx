'use client'

import { createContext, useContext } from 'react'

/** Whether the site being edited is live; lets deep editor fields nudge instead of change. */
export const PublishedContext = createContext(false)

export function useSitePublished() {
  return useContext(PublishedContext)
}
