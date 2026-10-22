'use client'

import { createContext, useContext } from 'react'

/** Whether the site being edited is live; lets deep editor fields nudge instead of change. */
export const PublishedContext = createContext(false)

/** Id of the project being edited; null in the anonymous landing preview. */
export const ProjectIdContext = createContext<string | null>(null)

/**
 * Whether the project's products live in the store database ("Ürünleri
 * yönet"): stores and catalogs only. `null` = unknown (anonymous landing
 * preview), where the schema alone decides. A corporate site is `false`, so
 * its products stay inline schema items edited right in the inspector.
 */
export const ProductsManagedContext = createContext<boolean | null>(null)

export function useProductsManaged() {
  return useContext(ProductsManagedContext)
}

export function useEditorProjectId() {
  return useContext(ProjectIdContext)
}

export function useSitePublished() {
  return useContext(PublishedContext)
}
