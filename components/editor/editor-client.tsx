'use client'

import { useRouter } from 'next/navigation'
import { WebsitePreview } from '@/components/website-preview'
import {
  listProjectBackups,
  listProjectVersions,
  publishProject,
  restoreProjectBackup,
  saveProjectSchema,
  snapshotProject,
  unpublishProject,
} from '@/lib/projects'
import type { ProjectVersionItem, RestoreBackupResult } from '@/lib/projects'
import type { BackupItem } from '@/lib/project-backups-core'
import { useLanguage } from '@/components/language-provider'
import { ProjectIdContext } from '@/components/editor/published-context'
import { tenantUrl } from '@/lib/domains'
import { trackPublishSite } from '@/lib/analytics'
import type { WebsiteSchema } from '@/lib/website-schema'
import type { PlanCode } from '@/lib/pricing-config'
import type { PaymentSummary } from '@/lib/store-checkout-rules'
import type { EditorCatalog } from '@/lib/store-editor-catalog-core'
import type { CatalogFeatureState } from '@/components/editor/catalog-feature-tab'

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
  initialBackups = [],
  historyEnabled = false,
  planCode,
  autoPublish,
  payments,
  blog,
  catalog,
  catalogFeature,
}: {
  projectId: string
  schema: WebsiteSchema
  language: 'tr' | 'en'
  published: boolean
  /** Public site slug (null before the first publish). Used to build the live
   * store URL that preview product/cart links open. */
  slug: string | null
  initialVersions: ProjectVersionItem[]
  initialBackups?: BackupItem[]
  /** PRO / E-Ticaret only: enables the version list, backups and restore. */
  historyEnabled?: boolean
  /** Pakete bağlı özellik kilitlerini belirler (FREE = telefon/WhatsApp kapalı). */
  planCode: PlanCode
  /**
   * Set when the visitor was routed here (via `?autopublish=1`) straight from
   * an anonymous Publish click or a login-gated publish intent. Triggers a
   * real publish attempt as soon as the editor mounts, so the click they
   * originally made actually completes instead of just opening a draft.
   */
  autoPublish?: boolean
  /** Non-null only for a store's owner/admin: enables the Sanal Poslar tab. */
  payments?: { projectId: string; initialSummary: PaymentSummary | null } | null
  /** Enables the Blog tab (project owner/admin). */
  blog?: { projectId: string; topics: string[]; sitemapUrl?: string | null; starterPending?: boolean } | null
  /** Owner-verified store catalog for the live preview (store sites only). */
  catalog?: EditorCatalog | null
  /** Corporate-site owner only: enables the Ürünler tab with the catalog switch. */
  catalogFeature?: CatalogFeatureState | null
}) {
  const router = useRouter()
  const { t } = useLanguage()

  return (
    <ProjectIdContext.Provider value={projectId}>
    <WebsitePreview
      site={schema}
      lang={language}
      initialEditorOpen
      planCode={planCode}
      autoPublish={autoPublish}
      payments={payments ?? null}
      blog={blog ?? null}
      catalog={catalog ?? null}
      catalogFeature={catalogFeature ?? null}
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
        publish: async (next, approvals, confirmedReal) => {
          const result = await publishProject({
            id: projectId,
            schema: next,
            name: next.meta.name,
            approvals,
            confirmedReal,
          })
  if (!result.ok) {
            if (result.reason === 'SAMPLE_CONTENT') {
              return {
                error: result.reason,
                sections: result.sections,
                attestationFailed: result.attestationFailed,
              }
            }
            if (result.reason === 'PLAN_REQUIRED') {
              router.push(`/billing?publish=${encodeURIComponent(projectId)}`)
            }
            if (result.reason === 'SUBSCRIPTION_SUSPENDED') {
              router.push('/billing')
            }
            if (result.reason === 'INVALID_SCHEMA') {
              return { error: result.reason, message: result.message }
            }
            return { error: result.reason }
          }
          // Canonical public address of a published site is always its own
          // tenant subdomain (e.g. nakliyat.gloval.site), never the platform
          // host + /site/<slug> internal rewrite path.
          trackPublishSite()
          return { url: tenantUrl(result.slug) }
        },
        unpublish: async () => {
          await unpublishProject(projectId)
        },
        published,
        slug,
        initialVersions,
        ...(historyEnabled
          ? {
              listVersions: async () => listProjectVersions(projectId),
              initialBackups,
              listBackups: async () => listProjectBackups(projectId),
              restoreBackup: async (backupId: string) =>
                restoreProjectBackup({ projectId, backupId }),
            }
          : {}),
        closeLabel: t.dash.backToDash,
      }}
    />
    </ProjectIdContext.Provider>
  )
}
