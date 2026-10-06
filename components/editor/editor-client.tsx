'use client'

import { useRouter } from 'next/navigation'
import { WebsitePreview } from '@/components/website-preview'
import {
  listProjectVersions,
  publishProject,
  saveProjectSchema,
  snapshotProject,
  unpublishProject,
} from '@/lib/projects'
import type { ProjectVersionItem } from '@/lib/projects'
import { useLanguage } from '@/components/language-provider'
import { tenantUrl } from '@/lib/domains'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { PlanCode } from '@/lib/pricing-config'

/**
 * Editor route wrapper. Reuses the full WebsitePreview editor and connects its
 * autosave + manual-save + publish hooks to the project persistence layer. The
 * schema loaded from the database seeds the preview's history stack.
 */
export function EditorClient({
  projectId,
  schema,
  language,
  published,
  slug,
  initialVersions,
  planCode,
  autoPublish,
}: {
  projectId: string
  schema: WebsiteSchema
  language: 'tr' | 'en'
  published: boolean
  /** Public site slug (null before the first publish). Used to build the live
   * store URL that preview product/cart links open. */
  slug: string | null
  initialVersions: ProjectVersionItem[]
  /** Pakete bağlı özellik kilitlerini belirler (FREE = telefon/WhatsApp kapalı). */
  planCode: PlanCode
  /**
   * Set when the visitor was routed here (via `?autopublish=1`) straight from
   * an anonymous Publish click or a login-gated publish intent. Triggers a
   * real publish attempt as soon as the editor mounts, so the click they
   * originally made actually completes instead of just opening a draft.
   */
  autoPublish?: boolean
}) {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <WebsitePreview
      site={schema}
      lang={language}
      initialEditorOpen
      planCode={planCode}
      autoPublish={autoPublish}
      onClose={() => {
        // Bust the client Router Cache so the dashboard reflects this project's
        // latest state (name, updated_at, publish status) instead of a stale
        // payload cached before/around login.
        router.push('/dashboard')
        router.refresh()
      }}
      persist={{
        save: async (next) => {
          await saveProjectSchema({ id: projectId, schema: next, name: next.meta.name })
        },
        snapshot: async (next) => {
          await snapshotProject({ id: projectId, schema: next })
        },
        publish: async (next) => {
          const result = await publishProject({
            id: projectId,
            schema: next,
            name: next.meta.name,
          })
  if (!result.ok) {
            if (result.reason === 'PLAN_REQUIRED') {
              router.push(`/billing?publish=${encodeURIComponent(projectId)}`)
            }
            if (result.reason === 'SUBSCRIPTION_SUSPENDED') {
              router.push('/billing')
            }
            return { error: result.reason }
          }
          // Canonical public address of a published site is always its own
          // tenant subdomain (e.g. nakliyat.gloval.site), never the platform
          // host + /site/<slug> internal rewrite path.
          return { url: tenantUrl(result.slug) }
        },
        unpublish: async () => {
          await unpublishProject(projectId)
        },
        published,
        slug,
        initialVersions,
        listVersions: async () => listProjectVersions(projectId),
        closeLabel: t.dash.backToDash,
      }}
    />
  )
}
