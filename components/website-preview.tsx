'use client'

import { guardEdit, vetAiSuggestion } from '@/lib/edit-guard'
import { countPlaceholderProducts } from '@/lib/product-items'
import { INVALID_SCHEMA_ERROR, INVALID_SCHEMA_MESSAGE, checkPublishable } from '@/lib/publish-gate'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readImageStorageFailure } from '@/lib/image-storage-error'
import { createPortal } from 'react-dom'
import { useRouter, usePathname } from 'next/navigation'
import useSWR from 'swr'
import { blogPostsKey, fetchBlogPosts } from '@/lib/blog-posts-fetcher'
import { blogNow } from '@/lib/blog-clock'
import { isBlogRoutePath, previewSiteBlogData } from '@/lib/blog-site'
import { withLegacyBlogLatest } from '@/lib/section-order'
import { AUTO_ENABLE_PATCH, shouldAutoEnableBlog } from '@/lib/starter-blog-card'
import { Monitor, Tablet, Smartphone, X, Wand2, Check, AlertCircle, Save, Loader2, LayoutGrid, Rocket, ExternalLink, EyeOff, LogIn, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useEditorGate, type EditorSessionSource } from '@/components/editor/use-editor-gate'
import { stopAllVoiceInput } from '@/lib/voice/voice-registry'
import { useLanguage } from '@/components/language-provider'
import { SamplePublishDialog } from '@/components/editor/sample-publish-dialog'
import { PublishChoiceDialog } from '@/components/editor/publish-choice-dialog'
import type { PublishOptions } from '@/lib/free-publish'
import { PublishedSiteBanner } from '@/components/editor/published-site-banner'
import {
  SAMPLE_CONTENT_ERROR,
  approveSampleFindings,
  clearEditedSampleFlags,
  collectSampleFindings,
  hideSampleSections,
  removeOrHideSampleItem,
  resolveDetectedPlaceholders,
  type SampleSectionFinding,
} from '@/lib/sample-content'
import { websiteSchema, type BlogSettings, type WebsiteSchema } from '@/lib/website-schema'
import { logSchemaRepair, normalizeWebsiteSchema } from '@/lib/website-schema-compat'
import { WebsiteRenderer, type PreviewNav } from '@/components/website-renderer/website-renderer'
import { resolveTheme, googleFontsHref } from '@/components/website-renderer/theme'
import { WebsiteEditorPanel, type ChatMessage } from '@/components/website-editor-panel'
import { PublishedContext } from '@/components/editor/published-context'
import { applyOperation, type EditOperation } from '@/lib/website-edit-operations'
import { pushHistory, redoHistory, undoHistory, type History as HistoryOf } from '@/lib/schema-history'
import { parseCommand } from '@/lib/website-command-parser'
import {
  detectImageEditIntent,
  describeImageTarget,
  removeImageAtTarget,
  hasImageMention,
  type ImageEditTarget,
  type ImageEditIntent,
} from '@/lib/image-edit-intent'
import { tenantUrl, TENANT_ROOT_DOMAIN } from '@/lib/domains'
import { slugifyProjectName } from '@/lib/slug'
import { fitLogoToCanvas } from '@/lib/logo-mark'
import type { ProjectVersionItem, RestoreBackupResult } from '@/lib/projects'
import type { BackupItem } from '@/lib/project-backups-core'
import { canUseLogoGeneration, type PlanCode } from '@/lib/pricing-config'
import type { PaymentSummary } from '@/lib/store-checkout-rules'
import type { EditorCatalog } from '@/lib/store-editor-catalog-core'
import type { CatalogFeatureState } from '@/components/editor/catalog-feature-tab'
import { OutOfCreditsModal } from '@/components/pricing/out-of-credits'
import { blogOperationSchema } from '@/lib/blog-operations'
import {
  BLOG_CHANGED_EVENT,
  blogFailureText,
  blogConfirmCopy,
  blogOperationConfirmText,
blogOperationCopy,
  blogOperationSuccessText,
  callBlogAi,
  newRequestId,
} from '@/lib/blog-client'
  import { DailyLimitModal } from '@/components/pricing/daily-limit-modal'
  import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Device = 'desktop' | 'tablet' | 'mobile'

const STARTER_POLL_MS = 8_000
const STARTER_WAIT_MS = 60_000

const DEVICE_MAX_WIDTH: Record<Device, string> = {
  desktop: 'max-w-6xl',
  tablet: 'max-w-3xl',
  mobile: 'max-w-[390px]',
}

/** Dev-only editor tracing. Never logs in production. */
function debug(...args: unknown[]) {
  if (process.env.NODE_ENV !== 'production') console.log('[v0]', ...args)
}

const browserEditorSession: EditorSessionSource = {
  async hasSession() {
    try {
      const { data } = await createClient().auth.getUser()
      return Boolean(data.user)
    } catch (err) {
      debug('auth check before edit failed:', err instanceof Error ? err.message : err)
      return false
    }
  },
  onSignedOut(onSignedOut) {
    try {
      const { data } = createClient().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') onSignedOut()
      })
      return () => data.subscription.unsubscribe()
    } catch {
      return () => {}
    }
  },
}

type History = HistoryOf<WebsiteSchema>

/**
 * Renders children into an <iframe> via a React portal. The app's stylesheets
 * are cloned into the iframe document so Tailwind utilities work AND — crucially
 * — responsive prefixes (sm/md/lg) respond to the iframe's own width. That makes
 * the desktop/mobile toggle produce genuine responsive behavior, not a scaled
 * screenshot.
 */
function IframeCanvas({
  fontsHref,
  children,
}: {
  fontsHref: string | null
  children: React.ReactNode
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    function setup() {
      const doc = iframe?.contentDocument
      if (!doc) return

      doc.head.innerHTML = ''
      doc.body.innerHTML = ''
      doc.documentElement.style.colorScheme = 'normal'
      doc.body.style.margin = '0'

      document
        .querySelectorAll('style, link[rel="stylesheet"]')
        .forEach((node) => doc.head.appendChild(node.cloneNode(true)))

      if (fontsHref) {
        const link = doc.createElement('link')
        link.rel = 'stylesheet'
        link.href = fontsHref
        doc.head.appendChild(link)
      }

      const root = doc.createElement('div')
      doc.body.appendChild(root)
      setMountNode(root)
    }

    setup()
    iframe.addEventListener('load', setup)
    return () => iframe.removeEventListener('load', setup)
  }, [fontsHref])

  return (
    <iframe
      ref={iframeRef}
      title="website-preview"
      className="h-full w-full border-0 bg-white"
    >
      {mountNode ? createPortal(children, mountNode) : null}
    </iframe>
  )
}

/**
 * WebsitePreview
 * --------------
 * Shows the generated WebsiteSchema as a real, responsive website inside a
 * browser-like frame, with a docked editor (visual controls + AI) and full
 * undo/redo. The schema lives in a history stack here — the single source of
 * truth — so both visual operations and AI edits update the preview instantly
 * with no reload, and every change is reversible.
 */
export function WebsitePreview({
  site,
  onClose,
  lang,
  initialEditorOpen = false,
  planCode = 'free',
  payments = null,
  blog = null,
  catalog = null,
  catalogFeature = null,
  persist,
  autoPublish = false,
  autoPublishConfirmed = false,
  onAuthenticatedPublish,
  onLoginRequired,
  onSignupRequired,
  onPreserveDraft,
  onEditLoginRequired,
  onEditSignupRequired,
}: {
  site: unknown
  onClose: () => void
  lang: 'tr' | 'en'
  initialEditorOpen?: boolean
  /**
   * Kullanıcının paketi. Pakete bağlı editör özellikleri (telefon / WhatsApp
   * butonları) buna göre kilitlenir. Anonim landing önizlemesinde FREE.
   */
  planCode?: PlanCode
  /** Non-null for a store's owner/admin: enables the editor's Sanal Poslar tab. */
  payments?: { projectId: string; initialSummary: PaymentSummary | null } | null
  /** Non-null for a project's owner/admin: enables the editor's Blog tab. */
  blog?: { projectId: string; topics: string[]; sitemapUrl?: string | null; starterPending?: boolean } | null
  /**
   * Store owner's active products + collections (loaded server-side), shown by
   * product showcase sections in the preview. Null: no data, empty-state message.
   */
  catalog?: EditorCatalog | null
  /** Non-null for a corporate site's owner: enables the editor's Ürünler tab (catalog switch). */
  catalogFeature?: CatalogFeatureState | null
  /**
   * Optional persistence. When provided (editor route), the live schema is
   * debounce-autosaved and a manual "Save" button records a version snapshot.
   * When omitted (landing preview), the component behaves exactly as before —
   * purely in-memory.
   */
  persist?: {
    save: (schema: WebsiteSchema) => Promise<void>
    snapshot: (schema: WebsiteSchema) => Promise<void>
    /**
     * Publishes the current schema; returns the public URL to show the user,
     * or an `error` code when publishing is blocked (e.g. the plan's published
     * site limit is reached).
     */
    publish?: (
      schema: WebsiteSchema,
      approvals?: string[],
      confirmedReal?: string[],
    ) => Promise<
      | { url: string }
      | {
          error: string
          message?: string
          used?: number
          total?: number
          limit?: number
          sections?: SampleSectionFinding[]
          attestationFailed?: boolean
        }
    >
    /**
     * Asks the server how "Yayınla" should behave for this owner (direct, the
     * FREE-or-packages choice, or packages only). Absent = always direct.
     */
    getPublishOptions?: (schema: WebsiteSchema) => Promise<PublishOptions>
    /** Opens the package picker, remembering which site is waiting to publish. */
    browsePackages?: () => void
    /** Takes the public site offline. The draft is left untouched. */
    unpublish?: () => Promise<void>
    /** Whether the project is already published (controls button label). */
    published?: boolean
    /** Public site slug (null before first publish). Lets storefront preview
     * links open the real live store. */
    slug?: string | null
    /** Version snapshots loaded server-side, seeding the change-history panel. */
    initialVersions?: ProjectVersionItem[]
    /** Re-fetches version snapshots after a save/publish. */
    listVersions?: () => Promise<ProjectVersionItem[]>
    /** Draft backups (PRO / E-Ticaret). Absent = backups hidden. */
    initialBackups?: BackupItem[]
    listBackups?: () => Promise<BackupItem[]>
    /** Restores a backup into the draft only; never touches the published site. */
    restoreBackup?: (backupId: string) => Promise<RestoreBackupResult>
    closeLabel?: string
  }
  /**
   * Auto-triggers `handlePublish` once `persist.publish` is available. Used
   * when the editor route was entered via `?autopublish=1` — i.e. the visitor
   * clicked Publish while logged out on the anonymous landing preview, was
   * routed through login/sign-up, and the dashboard just created the real
   * project from their stashed draft on their behalf.
   */
  autoPublish?: boolean
  /** The owner already chose "publish with FREE" (billing screen): skip the choice dialog. */
  autoPublishConfirmed?: boolean
  /**
   * Publish was clicked with no `persist` (anonymous landing preview) but the
   * visitor turns out to already be signed in. The parent should create the
   * real project now and hand off to the real editor route (typically with
   * `?autopublish=1`) so the publish actually completes.
   */
  onAuthenticatedPublish?: () => void
  /** "Giriş Yap" was clicked in the sign-in-required prompt. */
  onLoginRequired?: () => void
  /** "Üye Ol" was clicked in the sign-in-required prompt. */
  onSignupRequired?: () => void
  /**
   * Anonymous preview only (no `persist`): called with the live schema when the
   * daily-limit modal is dismissed or upgraded from, so the parent can stash
   * the draft for the login → dashboard handoff. Does not publish.
   */
  onPreserveDraft?: (schema: WebsiteSchema) => void
  /**
   * Anonymous preview only: the visitor chose Login / Create account in the
   * edit gate. The parent stashes the draft with edit intent (no publish
   * intent) and navigates to auth.
   */
  onEditLoginRequired?: (schema: WebsiteSchema) => void
  onEditSignupRequired?: (schema: WebsiteSchema) => void
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const [device, setDevice] = useState<Device>('desktop')
  // Single owner of the editor panel + the anonymous edit gate. Nothing in this
  // component sets the panel state directly: every entry point goes through it.
  const {
    open: showEdit,
    gateOpen: showEditGate,
    toggle: toggleEditor,
    requestOpen: requestEditorOpen,
    close: closeEditor,
    closeGate: closeEditGate,
  } = useEditorGate({
    persisted: Boolean(persist),
    initialOpen: initialEditorOpen,
    session: browserEditorSession,
  })
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [publishState, setPublishState] = useState<'idle' | 'publishing'>('idle')
  // FREE-only owners get a choice before the first publish; this is that dialog
  // plus the short server lookup that decides whether to show it.
  const [publishChoice, setPublishChoice] = useState<Exclude<PublishOptions, { mode: 'direct' }> | null>(null)
  const [publishChoiceBusy, setPublishChoiceBusy] = useState(false)
  // Shown when Publish is clicked but there is no authenticated, persisted
  // project to publish yet (anonymous landing preview), or an authenticated
  // session was lost mid-edit (publish call came back UNAUTHENTICATED).
  const [showAuthPrompt, setShowAuthPrompt] = useState(false)
  const autoPublishedRef = useRef(false)
  // Digests of the sample items the server refused to publish without approval.
  // Non-null opens the approval dialog.
  const [sampleGateIds, setSampleGateIds] = useState<ReadonlySet<string> | null>(null)
  const [sampleAttestationFailed, setSampleAttestationFailed] = useState(false)
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null)
  // The canonical tenant slug may be assigned during the first publish. Keep
  // it in local state so every URL shown by the editor switches to the same
  // active subdomain immediately, without waiting for a route refresh.
  const [liveSlug, setLiveSlug] = useState<string | null>(persist?.slug ?? null)
  // Live publish state. Seeded from the server-rendered prop, then updated in
  // place so the button label and the unpublish action stay correct after a
  // publish/unpublish without needing a full route refresh.
  const [livePublished, setLivePublished] = useState(persist?.published ?? false)
  const [unpublishState, setUnpublishState] = useState<'idle' | 'working'>('idle')
  const [confirmUnpublish, setConfirmUnpublish] = useState(false)
  const [versions, setVersions] = useState<ProjectVersionItem[]>(persist?.initialVersions ?? [])
  const [backups, setBackups] = useState<BackupItem[]>(persist?.initialBackups ?? [])
  // AI edit progress phase, so the panel can show Analyzing → Applying → Ready.
  const [aiPhase, setAiPhase] = useState<'analyzing' | 'applying' | null>(null)
  // Hero image regeneration runs independently of the text/design AI editor.
  const [heroImageWorking, setHeroImageWorking] = useState(false)
  // `"sectionIndex:itemIndex"` of the section image currently regenerating.
  const [workingItem, setWorkingItem] = useState<string | null>(null)
  // Index of the slider slide whose image is currently regenerating (or null).
  const [workingSlide, setWorkingSlide] = useState<number | null>(null)

  const initial = useMemo(() => {
    const result = normalizeWebsiteSchema(site)
    if (!result.ok) return { success: false as const }
    logSchemaRepair('editor', result.steps)
    return { success: true as const, data: result.value }
  }, [site])
  const [history, setHistory] = useState<History>(() => ({
    past: [],
    present: initial.success ? withLegacyBlogLatest(initial.data) : null,
    future: [],
  }))
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [editing, setEditing] = useState(false)
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // AI kredisi tükendiğinde açılan yükseltme / kredi satın alma ekranı.
  const [outOfCredits, setOutOfCredits] = useState(false)
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const showOutOfCredits = useCallback((res: Response) => {
    setCreditBalance(null)
    setOutOfCredits(true)
    void res
      .clone()
      .json()
      .then((body: { balance?: unknown } | null) => {
        if (typeof body?.balance === 'number') setCreditBalance(body.balance)
      })
      .catch(() => undefined)
  }, [])
  // Erişilebilir onay penceresi: blog işlemleri 3 AI kredisi harcamadan önce sorar.
  const [blogConfirm, setBlogConfirm] = useState<{ text: string; resolve: (ok: boolean) => void } | null>(null)
  const askBlogConfirm = (text: string) =>
    new Promise<boolean>((resolve) => setBlogConfirm({ text, resolve }))
  const answerBlogConfirm = (ok: boolean) => {
    blogConfirm?.resolve(ok)
    setBlogConfirm(null)
  }
  // Same SWR key as the Blog tab, so the preview's menu link and latest-posts
  // block follow the owner's posts and the two visibility switches live.
  const blogProjectId = blog?.projectId ?? null
  const [starterWaiting, setStarterWaiting] = useState(Boolean(blog?.starterPending))
  useEffect(() => {
    if (!starterWaiting) return
    const stop = setTimeout(() => setStarterWaiting(false), STARTER_WAIT_MS)
    return () => clearTimeout(stop)
  }, [starterWaiting])
  const { data: previewPosts, mutate: reloadPreviewPosts } = useSWR(
    blogProjectId ? blogPostsKey(blogProjectId) : null,
    () => fetchBlogPosts(blogProjectId as string),
    {
      revalidateOnFocus: false,
      // The three starter posts are written in the background right after the
      // site is created: poll briefly (only for a just-created site) so the
      // "Blog" link and "Son yazılar" block appear without a manual reload.
      refreshInterval: (latest) => (starterWaiting && !(latest && latest.length > 0) ? STARTER_POLL_MS : 0),
      errorRetryCount: 3,
    },
  )
  const previewBlog = useMemo(
    () => (previewPosts ? previewSiteBlogData(previewPosts, blogNow()) : null),
    [previewPosts],
  )
  useEffect(() => {
    if (!blogProjectId) return
    const reload = () => void reloadPreviewPosts()
    window.addEventListener(BLOG_CHANGED_EVENT, reload)
    return () => window.removeEventListener(BLOG_CHANGED_EVENT, reload)
  }, [blogProjectId, reloadPreviewPosts])
  // Saves a blog setting on the live schema without an undo step. The same
  // patch is applied to undo/redo snapshots so stepping back never re-triggers
  // the one-time switch-on below or brings the starter card back.
  const patchBlogSettingsSilently = useCallback((patch: BlogSettings) => {
    setHistory((h) => {
      if (!h.present) return h
      const withPatch = (s: WebsiteSchema): WebsiteSchema => ({ ...s, blogSettings: { ...(s.blogSettings ?? {}), ...patch } })
      const flagsOnly: BlogSettings = {
        ...(patch.starterAutoEnabled !== undefined ? { starterAutoEnabled: patch.starterAutoEnabled } : {}),
        ...(patch.starterCardDismissed !== undefined ? { starterCardDismissed: patch.starterCardDismissed } : {}),
      }
      const keepFlags = (s: WebsiteSchema): WebsiteSchema => ({ ...s, blogSettings: { ...(s.blogSettings ?? {}), ...flagsOnly } })
      const nextPresent = applyOperation(h.present, { op: 'updateBlogSettings', patch })
      return {
        past: h.past.map(keepFlags),
        present: nextPresent === h.present ? withPatch(h.present) : nextPresent,
        future: h.future.map(keepFlags),
      }
    })
  }, [])
  // One-time: when a newly generated site's starter posts become public, turn
  // the menu link and the home "latest posts" block on. `starterAutoEnabled`
  // flips to true in the same patch, so a later manual "off" is never overridden
  // and sites generated before this existed (no marker) are never touched.
  const blogSettingsNow = history.present?.blogSettings
  useEffect(() => {
    if (!blogProjectId || !shouldAutoEnableBlog(blogSettingsNow, previewPosts, blogNow())) return
    patchBlogSettingsSilently(AUTO_ENABLE_PATCH)
  }, [blogProjectId, blogSettingsNow, previewPosts, patchBlogSettingsSilently])
  // FREE planın günlük AI işlem limitine ulaşıldığında açılan ekran — bkz.
  // lib/free-daily-limit.ts. resetAt, sunucunun 429 yanıtındaki ISO zaman damgası.
  const [dailyLimitResetAt, setDailyLimitResetAt] = useState<string | null>(null)
  // Set when the assistant asked "what kind of image?" and is waiting for the
  // user's very next chat message to answer it — see applyEdit's step 0.
  const [awaitingImageDetail, setAwaitingImageDetail] = useState<ImageEditTarget | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Section selected on the canvas (or via the Design tab's pencil icon) — a
  // single controlled value so both entry points open the same inspector and
  // an AI instruction can be scoped to just this section.
  const [selectedSectionIndex, setSelectedSectionIndex] = useState<number | null>(null)
  // An AI-sourced result awaiting the user's Apply/Reject decision. While this
  // is non-null the canvas previews `after` instead of the committed schema,
  // and manual editing + the AI composer are both locked so the two "authors"
  // never write to the schema at the same time.
  const [pendingAiEdit, setPendingAiEdit] = useState<{
    before: WebsiteSchema
    after: WebsiteSchema
    sectionIndex: number | null
  } | null>(null)

  const pendingAiEditRef = useRef(pendingAiEdit)
  pendingAiEditRef.current = pendingAiEdit

  const currentSite = history.present
  const canUndo = history.past.length > 0
  const canRedo = history.future.length > 0

  // Always-fresh reference to the live schema, so stable useCallback handlers
  // (e.g. hero image regeneration) never capture a stale snapshot.
  const historyRef = useRef<WebsiteSchema | null>(currentSite)
  historyRef.current = currentSite

  const fontsHref = useMemo(
    () => (currentSite ? googleFontsHref(resolveTheme(currentSite)) : null),
    [currentSite],
  )

  function flashToast(kind: 'ok' | 'err', text: string) {
    setToast({ kind, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }

  // Apply a typed visual operation and push it onto the history stack.
  const dispatch = useCallback((op: EditOperation) => {
    const live = historyRef.current
    if (live) {
      const candidate = clearEditedSampleFlags(live, applyOperation(live, op))
      if (JSON.stringify(candidate) !== JSON.stringify(live)) {
        const verdict = guardEdit(live, candidate)
        if (!verdict.ok) {
          flashToast('err', verdict.message)
          return
        }
      }
    }
    setHistory((h) => {
      if (!h.present) return h
      // A sample item the owner edits by hand becomes their own content.
      return pushHistory(h, clearEditedSampleFlags(h.present, applyOperation(h.present, op)))
    })
  }, [])

  const undo = useCallback(() => setHistory(undoHistory), [])

  const redo = useCallback(() => setHistory(redoHistory), [])

  // Commits a completed schema edit as ONE history entry (so an AI edit or a
  // multi-operation command can be undone in a single step).
  const commitSchema = useCallback((nextSchema: WebsiteSchema): boolean => {
    const verdict = guardEdit(historyRef.current, nextSchema)
    if (!verdict.ok) {
      flashToast('err', verdict.message)
      return false
    }
    setHistory((h) =>
      h.present
        ? { past: [...h.past, h.present], present: nextSchema, future: [] }
        : { past: [], present: nextSchema, future: [] },
    )
    return true
  }, [])

  // Tracks the last-persisted schema so autosave only fires on real changes and
  // never re-saves the schema we just loaded from the database.
  const lastSavedRef = useRef<string | null>(
    initial.success ? JSON.stringify(initial.data) : null,
  )
  const persistRef = useRef(persist)
  persistRef.current = persist

  // Every draft write goes through one promise chain so an older in-flight save
  // can never land after (and overwrite) a newer one.
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const saveDraft = useCallback((schema: WebsiteSchema) => {
    const p = persistRef.current
    if (!p) return Promise.resolve()
    const run = saveChainRef.current.catch(() => undefined).then(() => p.save(schema))
    saveChainRef.current = run
    return run
  }, [])

  // Debounced autosave: whenever the live schema changes, persist it ~800ms
  // after the user stops editing. Only writes the draft; never touches history.
  useEffect(() => {
    const p = persistRef.current
    if (!p || !currentSite) return
    const serialized = JSON.stringify(currentSite)
    if (serialized === lastSavedRef.current) return
    setSaveState('saving')
    const timer = setTimeout(async () => {
      try {
        await saveDraft(currentSite)
        lastSavedRef.current = serialized
        setSaveState('saved')
      } catch (err) {
        debug('autosave error:', err instanceof Error ? err.message : err)
        setSaveState('idle')
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [currentSite, saveDraft])

  // Saves the live draft right now (skipping the autosave debounce). Resolves
  // `true` only when the draft is safely stored: written to the project in the
  // editor, or stashed for the post-login handoff in the anonymous preview.
  // Never publishes anything.
  const flushDraft = useCallback(async (): Promise<boolean> => {
    const schema = historyRef.current
    if (!schema) return true
    if (!persistRef.current) {
      onPreserveDraft?.(schema)
      return true
    }
    const serialized = JSON.stringify(schema)
    if (serialized === lastSavedRef.current) return true
    try {
      await saveDraft(schema)
      lastSavedRef.current = serialized
      setSaveState('saved')
      return true
    } catch (err) {
      debug('flush draft error:', err instanceof Error ? err.message : err)
      return false
    }
  }, [onPreserveDraft, saveDraft])

  // Re-pull the version snapshots so the change-history panel stays current
  // after a manual save or publish. Failure is non-fatal (list just goes stale).
  const refreshVersions = useCallback(async () => {
    const p = persistRef.current
    if (!p?.listVersions) return
    try {
      setVersions(await p.listVersions())
      if (p.listBackups) setBackups(await p.listBackups())
    } catch (err) {
      debug('version refresh error:', err instanceof Error ? err.message : err)
    }
  }, [])

  // Manual save: persist + record a version snapshot.
  async function handleManualSave() {
    if (!persist || !currentSite) return
    setSaveState('saving')
    try {
      await persist.snapshot(currentSite)
      lastSavedRef.current = JSON.stringify(currentSite)
      setSaveState('saved')
      flashToast('ok', t.dash.saved)
      void refreshVersions()
    } catch (err) {
      debug('manual save error:', err instanceof Error ? err.message : err)
      setSaveState('idle')
      flashToast('err', t.editor.failure)
    }
  }

  // Publish: persists a version snapshot and points the public slug at it.
  async function handlePublish(approvals?: string[], siteOverride?: WebsiteSchema, confirmedReal?: string[]) {
    const siteToPublish = siteOverride ?? currentSite
    if (!persist?.publish || !siteToPublish || publishState === 'publishing') return
    stopAllVoiceInput()
    if (!checkPublishable(siteToPublish).ok) {
      flashToast('err', INVALID_SCHEMA_MESSAGE)
      return
    }
    const skippedDrafts = countPlaceholderProducts(siteToPublish)
    if (skippedDrafts > 0) {
      flashToast('ok', `${skippedDrafts} boş ürün taslağı yayınlanmayacak.`)
    }
    setPublishState('publishing')
    setSampleAttestationFailed(false)
    try {
      const result = await persist.publish(siteToPublish, approvals, confirmedReal)
      if ('error' in result) {
        if (result.error === INVALID_SCHEMA_ERROR) {
          flashToast('err', result.message ?? INVALID_SCHEMA_MESSAGE)
          return
        }
        if (result.error === SAMPLE_CONTENT_ERROR) {
          const ids = (result.sections ?? []).flatMap((section) => section.items.map((item) => item.id))
          setSampleGateIds(new Set(ids))
          setSampleAttestationFailed(Boolean(result.attestationFailed))
          return
        }
        setSampleGateIds(null)
        if (result.error === 'FREE_PLAN_STOREFRONT') {
          setPublishChoice({ mode: 'packages_only', block: 'storefront' })
          return
        }
        if (result.error === 'PAGE_LIMIT_REACHED') {
          setPublishChoice({ mode: 'packages_only', block: 'page_limit', limit: result.limit })
          return
        }
        const siteLimitMessage = t.publish.siteLimit
          .replace('{used}', String(result.used ?? '—'))
          .replace('{total}', String(result.total ?? '—'))
        flashToast(
          'err',
          result.error === 'PLAN_REQUIRED'
            ? t.publish.planRequired
            : result.error === 'SUBSCRIPTION_SUSPENDED'
              ? t.billing.publishSuspended
              : siteLimitMessage,
        )
        return
      }
      // The server stored the approved items as the owner's content (flag
      // cleared); mirror that locally so the draft and the live site agree.
      const detectedIds = new Set(
        collectSampleFindings(siteToPublish).flatMap((section) =>
          section.items.filter((item) => item.detected).map((item) => item.id),
        ),
      )
      const realIds = new Set(confirmedReal ?? [])
      const hideIds = new Set((approvals ?? []).filter((id) => detectedIds.has(id) && !realIds.has(id)))
      const sampleApprovals = new Set((approvals ?? []).filter((id) => !detectedIds.has(id)))
      const resolved = resolveDetectedPlaceholders(siteToPublish, { hide: hideIds, real: realIds })
      const published = sampleApprovals.size > 0 ? approveSampleFindings(resolved, sampleApprovals) : resolved
      if (published !== siteToPublish) commitSchema(published)
      lastSavedRef.current = JSON.stringify(published)
      setSaveState('saved')
      setSampleGateIds(null)
  setPublishedUrl(result.url)
  // `publish` returns the authoritative URL from the database write. Extract
  // that slug and make the browser chrome, preview links, and live-store links
  // all use the exact same tenant immediately after publishing.
  try {
    setLiveSlug(new URL(result.url).hostname.split('.')[0] ?? null)
  } catch {
    // Keep the previously known slug if a custom persistence adapter returns a
    // non-URL value; the published link itself is still shown below.
  }
  setLivePublished(true)
      flashToast('ok', t.dash.published)
      void refreshVersions()
    } catch (err) {
      debug('publish error:', err instanceof Error ? err.message : err)
      // The session expired mid-edit. Treat this exactly like the anonymous
      // "not signed in yet" case rather than a generic failure toast, since
      // the fix is the same: sign back in, then continue.
      if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
        setShowAuthPrompt(true)
      } else {
        flashToast('err', t.editor.failure)
      }
    } finally {
      setPublishState('idle')
    }
  }

  // Publish button entry point. With a persisted project, publish directly.
  // Otherwise (anonymous landing preview) we first need a real, authenticated
  // project — check the session and either hand off to the parent to create
  // one (already signed in) or show the sign-in-required prompt.
  async function startPublish(skipChoice = false) {
    if (!persist?.publish) return
    if (skipChoice || livePublished || !persist.getPublishOptions || !currentSite) {
      void handlePublish()
      return
    }
    if (publishChoiceBusy || publishState === 'publishing') return
    setPublishChoiceBusy(true)
    try {
      let options: PublishOptions = { mode: 'direct' }
      try {
        options = await persist.getPublishOptions(currentSite)
      } catch (err) {
        debug('publish options lookup failed:', err instanceof Error ? err.message : err)
      }
      if (options.mode === 'direct') {
        void handlePublish()
      } else {
        setPublishChoice(options)
      }
    } finally {
      setPublishChoiceBusy(false)
    }
  }

  async function handlePublishClick() {
    if (persist?.publish) {
      void startPublish()
      return
    }
    if (onAuthenticatedPublish) {
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getUser()
        if (data.user) {
          onAuthenticatedPublish()
          return
        }
      } catch (err) {
        debug('auth check before publish failed:', err instanceof Error ? err.message : err)
      }
    }
    setShowAuthPrompt(true)
  }

  function goToEditAuth(kind: 'login' | 'signup') {
    closeEditGate()
    const handler = kind === 'login' ? onEditLoginRequired : onEditSignupRequired
    if (handler && currentSite) {
      handler(currentSite)
      return
    }
    if (kind === 'login') {
      router.push(`/auth/login?next=${encodeURIComponent(pathname || '/dashboard')}`)
    } else {
      router.push('/auth/sign-up')
    }
  }

  function goToLogin() {
    setShowAuthPrompt(false)
    if (onLoginRequired) {
      onLoginRequired()
      return
    }
    router.push(`/auth/login?next=${encodeURIComponent(pathname || '/dashboard')}`)
  }

  function goToSignup() {
    setShowAuthPrompt(false)
    if (onSignupRequired) {
      onSignupRequired()
      return
    }
    router.push('/auth/sign-up')
  }

  // When the editor route is entered with `?autopublish=1` (the visitor
  // clicked Publish while logged out, signed in, and was routed straight
  // back here), finish the publish they originally asked for.
  useEffect(() => {
    if (!autoPublish || autoPublishedRef.current) return
    if (!persist?.publish || !currentSite) return
    autoPublishedRef.current = true
    void startPublish(autoPublishConfirmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPublish, autoPublishConfirmed, persist, currentSite])

  // Unpublish: takes the public page offline. Only ever reached via the
  // confirmation modal, never straight from the toolbar button.
  async function handleUnpublish() {
    if (!persist?.unpublish || unpublishState === 'working') return
    setUnpublishState('working')
    try {
      await persist.unpublish()
      setLivePublished(false)
      // Drop the "your site is live at" banner — that URL now 404s.
      setPublishedUrl(null)
      setConfirmUnpublish(false)
      flashToast('ok', t.publish.unpublished)
    } catch (err) {
      debug('unpublish error:', err instanceof Error ? err.message : err)
      flashToast('err', t.editor.failure)
    } finally {
      setUnpublishState('idle')
    }
  }

  /**
   * Regenerates ONLY the hero/slider image from a freeform description (or
   * links a direct URL). This is a dedicated path — never the whole-site AI
   * editor — because asking the LLM to rewrite the entire schema for an image
   * change is what previously returned a site with the image dropped.
   *
   * Returns true when the image was actually replaced.
   */
  const regenerateHeroImage = useCallback(
    async (request: string): Promise<boolean> => {
      const site = historyRef.current
      if (!site) return false
      setHeroImageWorking(true)
      try {
        const res = await fetch('/api/hero-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ schema: site, request }),
        })
        // Same explanatory upgrade screen as the text/design AI editor, not a
        // generic error toast — see applyEdit's 402 handling above.
        if (res.status === 402) {
          showOutOfCredits(res)
          return false
        }
        // FREE plan daily action limit — see lib/free-daily-limit.ts.
        if (res.status === 429) {
          const body = await res.json().catch(() => null)
          setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
          return false
        }
        if (!res.ok) {
          const storageMessage = await readImageStorageFailure(res)
          if (storageMessage) {
            flashToast('err', storageMessage)
            return false
          }
          throw new Error('failed')
        }
        const data = await res.json()
        const parsed = websiteSchema.safeParse(data.website)
        if (!parsed.success) throw new Error('invalid')

        const status = data.image?.status as string | undefined
        debug('hero image — status:', status)

        // Even a failed generation returns the schema carrying the NEW prompt,
        // so the description the user typed is never lost.
        commitSchema(parsed.data)

        if (status === 'generated' || status === 'linked') {
          flashToast('ok', t.editor.success)
          return true
        }
        flashToast('err', t.editor.imageFailedNoCharge)
        return false
      } catch (err) {
        debug('hero image error:', err instanceof Error ? err.message : err)
        flashToast('err', t.editor.imageFailedNoCharge)
        return false
      } finally {
        setHeroImageWorking(false)
      }
    },
    [commitSchema, t],
  )

  /**
   * Regenerates ONE non-hero image (a gallery tile, portfolio card or team
   * portrait) from its own description — or links a direct URL. Runs through
   * the dedicated /api/section-image route so no text or layout is touched.
   */
  const handleRegenerateItemImage = useCallback(
    (index: number, itemIndex: number, request: string) => {
      const site = historyRef.current
      if (!site) return
      const key = `${index}:${itemIndex}`
      setWorkingItem(key)
      void (async () => {
        try {
          const res = await fetch('/api/section-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schema: site, index, itemIndex, request }),
          })
          // Same explanatory upgrade screen as the text/design AI editor, not a
          // generic error toast — see applyEdit's 402 handling above.
          if (res.status === 402) {
            showOutOfCredits(res)
            return
          }
          // FREE plan daily action limit — see lib/free-daily-limit.ts.
          if (res.status === 429) {
            const body = await res.json().catch(() => null)
            setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
            return
          }
          if (!res.ok) {
            const storageMessage = await readImageStorageFailure(res)
            if (storageMessage) {
              flashToast('err', storageMessage)
              return
            }
            throw new Error('failed')
          }
          const data = await res.json()
          const parsed = websiteSchema.safeParse(data.website)
          if (!parsed.success) throw new Error('invalid')

          const status = data.image?.status as string | undefined
          debug('section image — status:', status)
          commitSchema(parsed.data)
          flashToast(
            status === 'generated' || status === 'linked' ? 'ok' : 'err',
            status === 'generated' || status === 'linked' ? t.editor.success : t.editor.imageFailedNoCharge,
          )
        } catch (err) {
          debug('section image error:', err instanceof Error ? err.message : err)
          flashToast('err', t.editor.imageFailedNoCharge)
        } finally {
          setWorkingItem(null)
        }
      })()
    },
    [commitSchema, t],
  )

  /** Panel-facing wrapper: fire-and-forget, state is reported via the toast. */
  const handleRegenerateHeroImage = useCallback(
    (request: string) => {
      void regenerateHeroImage(request)
    },
    [regenerateHeroImage],
  )

  /**
   * Regenerates (or links a direct URL for) ONE slider slide's image, leaving
   * every other slide and all text/layout untouched. Runs through the same
   * /api/hero-image route with an explicit `slideIndex`.
   */
  const handleRegenerateSlideImage = useCallback(
    (slideIndex: number, request: string) => {
      const site = historyRef.current
      if (!site) return
      setWorkingSlide(slideIndex)
      void (async () => {
        try {
          const res = await fetch('/api/hero-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schema: site, slideIndex, request }),
          })
          // Same explanatory upgrade screen as the text/design AI editor, not a
          // generic error toast — see applyEdit's 402 handling above.
          if (res.status === 402) {
            showOutOfCredits(res)
            return
          }
          // FREE plan daily action limit — see lib/free-daily-limit.ts.
          if (res.status === 429) {
            const body = await res.json().catch(() => null)
            setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
            return
          }
          if (!res.ok) {
            const storageMessage = await readImageStorageFailure(res)
            if (storageMessage) {
              flashToast('err', storageMessage)
              return
            }
            throw new Error('failed')
          }
          const data = await res.json()
          const parsed = websiteSchema.safeParse(data.website)
          if (!parsed.success) throw new Error('invalid')

          const status = data.image?.status as string | undefined
          debug('slide image — status:', status)
          // The schema carries the new prompt even on failure, so the user's
          // description is never lost.
          commitSchema(parsed.data)
          flashToast(
            status === 'generated' || status === 'linked' ? 'ok' : 'err',
            status === 'generated' || status === 'linked' ? t.editor.success : t.editor.imageFailedNoCharge,
          )
        } catch (err) {
          debug('slide image error:', err instanceof Error ? err.message : err)
          flashToast('err', t.editor.imageFailedNoCharge)
        } finally {
          setWorkingSlide(null)
        }
      })()
    },
    [commitSchema, t],
  )

  /**
   * Chat-driven counterpart to handleRegenerateItemImage / handleRegenerateHeroImage
   * for targets resolved by `detectImageEditIntent` (FAZ 3B): a section
   * collection item, a specific hero/slider slide, or the logo. Unlike the
   * panel controls this runs from `applyEdit`, so it reports through the
   * chat transcript rather than a toast and returns a success boolean the
   * caller uses to pick the right assistant message.
   */
  const runChatImageAction = useCallback(
    async (target: ImageEditTarget, request: string): Promise<boolean> => {
      const site = historyRef.current
      if (!site) return false

      if (target.kind === 'logo') {
        if (!canUseLogoGeneration(planCode)) return false
        try {
          const res = await fetch('/api/logo-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              schema: site,
              companyName: site.navigation.logoText || site.meta.name,
              format: 'horizontal',
              count: 1,
              request,
            }),
          })
          if (res.status === 402) {
            showOutOfCredits(res)
            return false
          }
          if (res.status === 429) {
            const body = await res.json().catch(() => null)
            setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
            return false
          }
          if (!res.ok) {
            const storageMessage = await readImageStorageFailure(res)
            if (storageMessage) {
              flashToast('err', storageMessage)
              return false
            }
            throw new Error('failed')
          }
          const data = await res.json()
          const src = Array.isArray(data.alternatives) ? data.alternatives[0]?.src : null
          if (typeof src !== 'string' || !src) throw new Error('no alternative')
          const fitted = await fitLogoToCanvas(src)
          commitSchema(applyOperation(site, { op: 'updateNavLogo', src: fitted, source: 'ai' }))
          return true
        } catch (err) {
          debug('chat logo image error:', err instanceof Error ? err.message : err)
          return false
        }
      }

      if (target.kind === 'hero') {
        return regenerateHeroImage(request)
      }

      // Section collection item.
      try {
        const res = await fetch('/api/section-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            schema: site,
            index: target.sectionIndex,
            itemIndex: target.itemIndex,
            request,
          }),
        })
        if (res.status === 402) {
          showOutOfCredits(res)
          return false
        }
        if (res.status === 429) {
          const body = await res.json().catch(() => null)
          setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
          return false
        }
        if (!res.ok) {
          const storageMessage = await readImageStorageFailure(res)
          if (storageMessage) {
            flashToast('err', storageMessage)
            return false
          }
          throw new Error('failed')
        }
        const data = await res.json()
        const parsed = websiteSchema.safeParse(data.website)
        if (!parsed.success) throw new Error('invalid')
        commitSchema(parsed.data)
        const status = data.image?.status as string | undefined
        return status === 'generated' || status === 'linked'
      } catch (err) {
        debug('chat section image error:', err instanceof Error ? err.message : err)
        return false
      }
    },
    [commitSchema, planCode, regenerateHeroImage],
  )

  // Commits the pending AI suggestion into the SAME history stack a manual
  // edit uses, so it can be undone/redone and autosaved identically.
  const applyPendingAiEdit = useCallback(() => {
    const pending = pendingAiEditRef.current
    setPendingAiEdit(null)
    if (!pending) return
    const live = historyRef.current
    const verdict = live ? vetAiSuggestion(live, pending.after) : null
    if (verdict && !verdict.ok) {
      flashToast('err', verdict.message)
      setMessages((prev) => [...prev, { role: 'assistant', text: verdict.message }])
      return
    }
    commitSchema(verdict ? verdict.schema : pending.after)
  }, [commitSchema])

  // Discards the suggestion; the canvas falls back to rendering the
  // committed schema again. No extra refund is issued — the credit paid for
  // the AI actually producing the suggestion, whether or not it's kept.
  const rejectPendingAiEdit = useCallback(() => {
    setPendingAiEdit(null)
  }, [])

  /**
   * Runs one resolved image/logo intent to completion: removal (pure schema
   * edit), the FREE-plan logo gate, the "what kind of image?" clarifying
   * question, or the actual generation call — pushing the matching chat
   * message at each step. Shared by the clarify-continuation, the single-
   * instruction, and the combined "text AND image" paths below so all three
   * report identically.
   */
  async function resolveImageIntent(intent: ImageEditIntent): Promise<boolean> {
    const isLogo = intent.target.kind === 'logo'

    // Removal never touches the AI/credits/daily-limit pipeline — it's a
    // pure, safe schema edit.
    if (intent.action === 'remove') {
      const site = historyRef.current
      if (site) commitSchema(removeImageAtTarget(site, intent.target))
      setMessages((prev) => [...prev, { role: 'assistant', text: t.editor.imageRemoved }])
      flashToast('ok', t.editor.success)
      return true
    }

    if (isLogo && !canUseLogoGeneration(planCode)) {
      setMessages((prev) => [...prev, { role: 'assistant', text: t.editor.logoPremiumRequired }])
      return false
    }

    // No usable description yet — ask instead of guessing, and remember the
    // target so the next message can answer directly.
    if (!intent.request) {
      setAwaitingImageDetail(intent.target)
      setMessages((prev) => [...prev, { role: 'assistant', text: t.editor.imageClarify }])
      return true
    }

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', text: isLogo ? t.editor.logoGenerating : t.editor.imageGenerating },
    ])
    const ok = await runChatImageAction(intent.target, intent.request)
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: ok
          ? isLogo
            ? t.editor.logoApplied
            : t.editor.imageApplied
          : isLogo
            ? t.editor.logoFailed
            : t.editor.imageFailed,
      },
    ])
    return ok
  }

  async function applyEdit(instruction: string): Promise<boolean> {
    if (!currentSite || editing || pendingAiEdit) return false
    setEditing(true)
    setAiPhase('analyzing')
    setMessages((prev) => [...prev, { role: 'user', text: instruction }])
    debug('AI edit — user command:', instruction)
    debug('AI edit — current site name:', currentSite.meta.name)

    // 0. Continuation of a previous "what kind of image would you like?"
    //    clarifying question — the very next message answers it directly,
    //    without needing to re-mention the target.
    if (awaitingImageDetail) {
      const target = awaitingImageDetail
      setAwaitingImageDetail(null)
      setAiPhase('applying')
      const ok = await resolveImageIntent({ target, action: 'generate', request: instruction })
      setEditing(false)
      setAiPhase(null)
      return ok
    }

    // 0b. Combined "text AND image" instruction — e.g. "Hero başlığını 'X'
    //    yap ve görseli bir villa fotoğrafıyla değiştir." Split on the
    //    conjunction and require exactly one side to mention an image/logo
    //    at all, so an unrelated "ve" inside one clause (e.g. "daha modern ve
    //    premium hale getir") never gets misread as two separate commands.
    let textInstruction = instruction
    let combinedImageHandled = false
    let combinedImageOk = true
    const conjunctionParts = instruction
      .split(/\s+(?:ve|and)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean)
    if (conjunctionParts.length === 2) {
      const [a, b] = conjunctionParts
      const aIsImage = hasImageMention(a)
      const bIsImage = hasImageMention(b)
      const imageClause = aIsImage && !bIsImage ? a : bIsImage && !aIsImage ? b : null
      const clauseTextInstruction = imageClause === a ? b : a
      if (imageClause) {
        const intent = detectImageEditIntent(imageClause, currentSite)
        if (intent) {
          debug('AI edit — combined image clause:', intent, 'text clause:', clauseTextInstruction)
          setAiPhase('applying')
          combinedImageOk = await resolveImageIntent(intent)
          combinedImageHandled = true
          textInstruction = clauseTextInstruction
        }
      }
    }

    if (combinedImageHandled && !textInstruction) {
      setEditing(false)
      setAiPhase(null)
      return combinedImageOk
    }

    // 0c. Single-instruction image/logo edit intent: "hero görselini
    //    kamyonetli bir görselle değiştir", "galerideki ikinci fotoğrafı
    //    kaldır", "logomu yenile". Skipped when the combined path above
    //    already consumed the image clause. Resolved against the LIVE schema
    //    so the right section/item/slide is targeted, then handled by the
    //    dedicated image pipeline — never the whole-site AI editor — so
    //    text/layout is never touched and an image can't silently disappear.
    if (!combinedImageHandled) {
      const imageIntent = detectImageEditIntent(instruction, currentSite)
      if (imageIntent) {
        debug('AI edit — image intent:', imageIntent)
        setAiPhase('applying')
        const ok = await resolveImageIntent(imageIntent)
        setEditing(false)
        setAiPhase(null)
        return ok
      }
    }

    // A section is selected: skip the whole-site deterministic parser (it
    // isn't scope-aware) and go straight to the AI, scoped to that section
    // only, so the instruction can never touch anything else on the page.
    const scopedSectionIndex = selectedSectionIndex
    if (scopedSectionIndex === null) {
      // 1. Deterministic command parser first: instant, offline, and reliable
      //    for common edits. This works even when the AI Gateway is unavailable.
      try {
        const parsed = parseCommand(textInstruction, currentSite)
        debug('AI edit — parsed command:', parsed ? parsed.operations : null)
        if (parsed && parsed.operations.length > 0) {
          const nextSchema = parsed.operations.reduce(
            (acc, op) => applyOperation(acc, op),
            currentSite,
          )
          const valid = websiteSchema.safeParse(nextSchema)
          if (valid.success && JSON.stringify(valid.data) === JSON.stringify(currentSite)) {
            // The command resolved but changed nothing: never claim success.
            debug('AI edit — parsed command produced no change')
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                text:
                  lang === 'en'
                    ? 'Nothing was changed. Please rephrase the instruction.'
                    : 'Hiçbir değişiklik yapılmadı. Lütfen komutu farklı ifade eder misin?',
              },
            ])
            flashToast('err', t.editor.failure)
            setEditing(false)
            setAiPhase(null)
            return false
          }
          if (valid.success) {
            debug('AI edit — patched site name:', valid.data.meta.name)
            if (!commitSchema(valid.data)) {
              setMessages((prev) => [
                ...prev,
                { role: 'assistant', text: 'Bu değişiklik sitenizin yapısını bozacağı için uygulanmadı.' },
              ])
              setEditing(false)
              setAiPhase(null)
              return false
            }
            setMessages((prev) => [...prev, { role: 'assistant', text: parsed.feedback }])
            flashToast('ok', t.editor.success)
            setEditing(false)
            setAiPhase(null)
            // When this text half followed a combined instruction, only
            // report overall success if the image half also succeeded.
            return combinedImageOk
          }
          debug('AI edit — parsed result failed validation, trying AI')
        } else if (parsed && parsed.operations.length === 0 && !combinedImageHandled) {
          // Parser understood the intent but nothing to apply (e.g. target
          // section not present) — report honestly, don't call the AI. Only
          // when this ISN'T the leftover text half of a combined instruction:
          // there, an unrecognized remainder is common (e.g. a bare "ve
          // ayrıca" filler) and shouldn't override the image result above.
          setMessages((prev) => [...prev, { role: 'assistant', text: parsed.feedback }])
          flashToast('err', t.editor.failure)
          setEditing(false)
          setAiPhase(null)
          return false
        }
      } catch (err) {
        debug('AI edit — parser error:', err instanceof Error ? err.message : err)
      }
    }

    // 2. Fall back to the AI editor for anything the parser can't handle (or
    //    everything, when a section is selected).
    setAiPhase('applying')
    try {
      const res = await fetch('/api/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: currentSite,
          instruction: textInstruction,
          lang,
          scope: scopedSectionIndex !== null ? { sectionIndex: scopedSectionIndex } : undefined,
        }),
      })
      // AI kredisi bittiğinde jenerik hata toast'ı yerine açıklayıcı
      // yükseltme / kredi satın alma ekranı gösterilir. Sunucu kredi sayacı
      // devreye girdiğinde 402 döndürmesi yeterli — burada başka değişiklik
      // gerekmez.
      if (res.status === 402) {
        showOutOfCredits(res)
        setEditing(false)
        setAiPhase(null)
        return false
      }
      // FREE plan daily action limit — see lib/free-daily-limit.ts.
      if (res.status === 429) {
        const body = await res.json().catch(() => null)
        setDailyLimitResetAt(body?.resetAt ?? new Date().toISOString())
        setEditing(false)
        setAiPhase(null)
        return false
      }
      // Plan page limit reached: explain it instead of a generic failure.
      // Existing pages are untouched; only the growth was refused (no credit spent).
      if (res.status === 403) {
        const body = await res.json().catch(() => null)
        if (body?.error === 'PAGE_LIMIT_REACHED') {
          const message = typeof body.message === 'string' ? body.message : t.editor.failure
          setMessages((prev) => [...prev, { role: 'assistant', text: message }])
          flashToast('err', message)
          return false
        }
        throw new Error('failed')
      }
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      debug('AI edit — endpoint source:', data.source)
      if (data.source === 'blog') {
        return await runBlogInstruction(data.blogOperation)
      }
      if (data.source === 'declined') {
        const message = typeof data.message === 'string' ? data.message : t.editor.assistantAckFallback
        setMessages((prev) => [...prev, { role: 'assistant', text: message }])
        flashToast('err', t.editor.failure)
        return false
      }
      const vetted = vetAiSuggestion(currentSite, data.schema)
      if (!vetted.ok) {
        // Rejected: nothing reaches the canvas or the history.
        setMessages((prev) => [...prev, { role: 'assistant', text: vetted.message }])
        flashToast('err', vetted.message)
        return false
      }
      const parsed = { success: true as const, data: vetted.schema }

      const changeLines: string[] = Array.isArray(data.changes)
        ? data.changes.filter((c: unknown): c is string => typeof c === 'string')
        : []
      const ackText =
        changeLines.length > 0
          ? `${t.editor.assistantAck}\n${changeLines.map((c) => `• ${c}`).join('\n')}`
          : t.editor.assistantAck

      const productsNotice = data.notice ? t.editor.productsManagedNotice : null

      if (data.source !== 'fallback') {
        // Don't commit yet: hand the result to the user as a preview they
        // must explicitly Apply or Reject, so an AI edit can never silently
        // overwrite what's on the canvas.
        setPendingAiEdit({
          before: currentSite,
          after: parsed.data,
          sectionIndex: scopedSectionIndex,
        })
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', text: ackText },
          ...(productsNotice ? [{ role: 'assistant' as const, text: productsNotice }] : []),
        ])
        return true
      } else if (productsNotice) {
        setMessages((prev) => [...prev, { role: 'assistant', text: productsNotice }])
        flashToast('err', productsNotice)
        return false
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: t.editor.assistantAckFallback }])
        flashToast('err', t.editor.failure)
        return false
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: t.editor.assistantAckFallback }])
      flashToast('err', t.editor.failure)
      return false
    } finally {
      setEditing(false)
      setAiPhase(null)
    }
  }

  /**
   * Executes a blog operation recognised by /api/edit. Credit-spending
   * operations (write / personalize) are confirmed with the owner first; the
   * server re-checks every gate, so this is never the only protection.
   */
  async function runBlogInstruction(raw: unknown): Promise<boolean> {
    const say = (text: string, ok: boolean) => {
      setMessages((prev) => [...prev, { role: 'assistant', text }])
      flashToast(ok ? 'ok' : 'err', text)
      return ok
    }
    const parsedOperation = blogOperationSchema.safeParse(raw)
    if (!parsedOperation.success) return say(blogOperationCopy(lang).failed, false)
    if (!blog) return say(blogOperationCopy(lang).notAvailable, false)
    const operation = parsedOperation.data

    const confirmText = blogOperationConfirmText(lang, operation)
    if (confirmText && !(await askBlogConfirm(confirmText))) return say(blogFailureText(lang, 'confirm'), false)

    const outcome = await callBlogAi('/api/blog/operation', {
      projectId: blog.projectId,
      requestId: newRequestId(),
      operation,
      confirmed: confirmText !== null,
    })
    if (!outcome.ok) {
      if (outcome.reason === 'credits') setOutOfCredits(true)
      return say(blogFailureText(lang, outcome.reason), false)
    }
    window.dispatchEvent(new Event(BLOG_CHANGED_EVENT))
    return say(blogOperationSuccessText(lang, operation, outcome.post), true)
  }

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // The confirm modal is layered above the editor, so Escape has to
        // dismiss that first instead of closing the whole editor behind it.
        if (confirmUnpublish) {
          if (unpublishState !== 'working') setConfirmUnpublish(false)
          return
        }
        onClose()
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose, undo, redo, confirmUnpublish, unpublishState])

  // A published site's canonical subdomain is the active slug, not a slug
  // derived again from the editable site name. Keep every URL surface on this
  // same value so renaming the site cannot leave the banner and preview chrome
  // pointing at different tenants.
  const urlLabel = liveSlug
    ? `${liveSlug}.${TENANT_ROOT_DOMAIN}`
    : currentSite
      ? `${slugifyProjectName(currentSite.meta.name)}.${TENANT_ROOT_DOMAIN}`
      : `preview.${TENANT_ROOT_DOMAIN}`
  const activePublishedUrl = livePublished && liveSlug ? tenantUrl(liveSlug) : publishedUrl

  // Preview navigation for the renderer. The preview iframe has no router, so
  // page links switch in-memory, while a storefront's product/cart/checkout
  // routes open the REAL live store in a new tab — those pages exist only on
  // the published tenant site. If the store isn't published yet we can't link
  // to a live page, so we nudge the owner to publish first.
  const previewNav: PreviewNav = {
    slug: liveSlug,
    published: livePublished,
    onStoreRoute: (tenantPath) => {
      if (livePublished && liveSlug) {
        window.open(`${tenantUrl(liveSlug)}${tenantPath}`, '_blank', 'noopener,noreferrer')
      } else {
        const blogRoute = isBlogRoutePath(tenantPath)
        flashToast(
          'err',
          blogRoute
            ? lang === 'en'
              ? 'Publish your site to open the blog pages.'
              : 'Blog sayfalarını açmak için sitenizi yayınlayın.'
            : lang === 'en'
              ? 'Publish your store to open product and cart pages.'
              : 'Ürün ve sepet sayfalarını açmak için mağazanızı yayınlayın.',
        )
      }
    },
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Toolbar */}
      {/* Wraps rather than overflows: with publish + unpublish + close present,
          the action row is too wide to fit beside the title on narrow screens. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
        {/* Left group yields space first: the action buttons on the right must
            never be pushed off-screen. The hint only appears once the toolbar is
            wide enough to hold it alongside the publish/unpublish actions. */}
        <div className="flex min-w-0 shrink items-center gap-2">
          <span className="whitespace-nowrap text-sm font-semibold">{t.preview.title}</span>
          <span className="hidden truncate text-xs text-muted-foreground xl:inline">
            {t.preview.hint}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-border bg-secondary/40 p-0.5">
            <ToggleButton
              active={device === 'desktop'}
              onClick={() => setDevice('desktop')}
              label={t.preview.desktop}
            >
              <Monitor className="h-4 w-4" />
            </ToggleButton>
            <ToggleButton
              active={device === 'tablet'}
              onClick={() => setDevice('tablet')}
              label={t.preview.tablet}
            >
              <Tablet className="h-4 w-4" />
            </ToggleButton>
            <ToggleButton
              active={device === 'mobile'}
              onClick={() => setDevice('mobile')}
              label={t.preview.mobile}
            >
              <Smartphone className="h-4 w-4" />
            </ToggleButton>
          </div>
          <button
            onClick={() => void toggleEditor()}
            aria-pressed={showEdit}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
              showEdit
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
            }`}
          >
            <Wand2 className="h-4 w-4" />
            <span className="hidden sm:inline">{t.preview.edit}</span>
          </button>
          {persist && (
            <button
              onClick={handleManualSave}
              disabled={saveState === 'saving'}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 text-sm font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
            >
              {saveState === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saveState === 'saved' ? (
                <Check className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {saveState === 'saving' ? t.dash.saving : saveState === 'saved' ? t.dash.saved : t.dash.save}
              </span>
            </button>
          )}
          {/* Only offered while the site is actually live. */}
          {persist?.unpublish && livePublished && (
            <button
              onClick={() => setConfirmUnpublish(true)}
              disabled={unpublishState === 'working'}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20 hover:shadow-[0_0_12px_-2px_var(--destructive)] disabled:opacity-60"
            >
              {unpublishState === 'working' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{t.publish.unpublish}</span>
            </button>
          )}
          {/* Always visible, even before the draft is ever saved — publishing
              is the whole point of the editor, so the button can't be gated
              behind a save the visitor hasn't been asked to do yet. Clicking
              it without a persisted project routes through auth first. */}
          <button
            onClick={handlePublishClick}
            disabled={publishState === 'publishing' || publishChoiceBusy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {publishState === 'publishing' || publishChoiceBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {livePublished ? t.publish.republish : t.publish.publish}
            </span>
          </button>
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            {persist ? <LayoutGrid className="h-4 w-4" /> : <X className="h-4 w-4" />}
            <span className="hidden sm:inline">{persist?.closeLabel ?? t.preview.close}</span>
          </button>
        </div>
      </div>

      {/* Published link banner: always uses the active canonical subdomain. */}
      {activePublishedUrl && (
        <PublishedSiteBanner url={activePublishedUrl} label={t.publish.liveAt} lang={lang === 'en' ? 'en' : 'tr'} />
      )}

      {publishChoice && (
        <PublishChoiceDialog
          choice={publishChoice}
          onPublishFree={() => {
            setPublishChoice(null)
            void handlePublish()
          }}
          onBrowsePackages={() => {
            setPublishChoice(null)
            persist?.browsePackages?.()
          }}
          onClose={() => setPublishChoice(null)}
        />
      )}

      {sampleGateIds && currentSite && (
        <SamplePublishDialog
          lang={lang}
          site={currentSite}
          gateIds={sampleGateIds}
          publishing={publishState === 'publishing'}
          attestationFailed={sampleAttestationFailed}
          onHideSections={(indexes) => commitSchema(hideSampleSections(currentSite, indexes))}
          onDeleteItem={(sectionIndex, itemIndex) =>
            commitSchema(removeOrHideSampleItem(currentSite, sectionIndex, itemIndex))
          }
          onEditSection={(index) => {
            setSampleGateIds(null)
            void requestEditorOpen()
            setSelectedSectionIndex(index)
          }}
          onPublish={(approvals, hideIndexes, confirmedReal) => {
            if (hideIndexes.length === 0) {
              void handlePublish(approvals, undefined, confirmedReal)
              return
            }
            const hidden = hideSampleSections(currentSite, hideIndexes)
            commitSchema(hidden)
            void handlePublish(approvals, hidden, confirmedReal)
          }}
          onClose={() => setSampleGateIds(null)}
        />
      )}

      {/* Unpublish confirmation. Layered above the editor shell (which is itself
          z-50) so it is never rendered behind the toolbar. */}
      {confirmUnpublish && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="unpublish-title"
          aria-describedby="unpublish-body"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 id="unpublish-title" className="text-base font-semibold text-foreground">
              {t.publish.unpublishTitle}
            </h2>
            <p id="unpublish-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.publish.unpublishBody}
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmUnpublish(false)}
                disabled={unpublishState === 'working'}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
              >
                {t.publish.unpublishCancel}
              </button>
              <button
                type="button"
                onClick={handleUnpublish}
                disabled={unpublishState === 'working'}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-destructive/50 bg-destructive/20 px-4 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/30 disabled:opacity-60"
              >
                {unpublishState === 'working' && <Loader2 className="h-4 w-4 animate-spin" />}
                {unpublishState === 'working' ? t.publish.unpublishing : t.publish.unpublish}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish requires an authenticated, persisted project. Shown either
          for the anonymous landing preview (no project yet) or when a real
          session expired mid-edit — in both cases the draft stays exactly as
          it is; only sign-in/sign-up stands between the visitor and Publish. */}
      {showAuthPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="publish-auth-title"
          aria-describedby="publish-auth-body"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 id="publish-auth-title" className="text-base font-semibold text-foreground">
              {t.publish.authRequiredTitle}
            </h2>
            <p id="publish-auth-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.publish.authRequiredBody}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                onClick={goToLogin}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <LogIn className="h-4 w-4" />
                {t.auth.login}
              </button>
              <button
                type="button"
                onClick={goToSignup}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <UserPlus className="h-4 w-4" />
                {t.auth.signup}
              </button>
              <button
                type="button"
                onClick={() => setShowAuthPrompt(false)}
                className="mt-1 inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.publish.authRequiredCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditGate && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-gate-title"
          aria-describedby="edit-gate-body"
          data-testid="edit-gate"
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <h2 id="edit-gate-title" className="text-base font-semibold text-foreground">
              {t.publish.editGateTitle}
            </h2>
            <p id="edit-gate-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t.publish.editGateBody}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => goToEditAuth('signup')}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <UserPlus className="h-4 w-4" />
                {t.publish.editGateSignup}
              </button>
              <button
                type="button"
                onClick={() => goToEditAuth('login')}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-4 text-sm font-medium transition-colors hover:bg-secondary"
              >
                <LogIn className="h-4 w-4" />
                {t.auth.login}
              </button>
              <button
                type="button"
                onClick={closeEditGate}
                className="mt-1 inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.publish.authRequiredCancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body: stage + docked editor */}
      <div className="relative flex min-h-0 flex-1">
        <div className="flex flex-1 justify-center overflow-hidden bg-muted/30 p-4 sm:p-6">
          <div
            className={`flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl transition-[max-width] duration-300 ${DEVICE_MAX_WIDTH[device]}`}
          >
            {/* Browser chrome */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-secondary/50 px-3 py-2">
              <span className="flex gap-1.5">
                <span className="h-3 w-3 rounded-full bg-destructive/70" />
                <span className="h-3 w-3 rounded-full bg-chart-5/70" />
                <span className="h-3 w-3 rounded-full bg-accent/70" />
              </span>
              <span className="mx-auto max-w-[70%] truncate rounded-md bg-background/70 px-3 py-1 text-center text-xs text-muted-foreground">
                {urlLabel}
              </span>
            </div>

            {/* Rendered website inside an isolated, responsive iframe */}
            <div className="min-h-0 flex-1">
              {currentSite ? (
                <IframeCanvas fontsHref={fontsHref}>
                  <WebsiteRenderer
                    site={pendingAiEdit ? pendingAiEdit.after : currentSite}
                    onUndoLastChange={canUndo ? undo : null}
                    planCode={planCode}
                    preview={previewNav}
                    blog={previewBlog}
                    previewProducts={catalog?.products}
                    previewCollections={catalog?.collections}
                    editSelection={
                      showEdit
                        ? { index: selectedSectionIndex, onSelect: setSelectedSectionIndex }
                        : null
                    }
                  />
                </IframeCanvas>
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  {t.hero.errorBody}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Editor: docked column on md+, drawer overlay on small screens */}
        {showEdit && currentSite && (
          <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-[380px] p-3 md:static md:z-auto md:w-[380px] md:shrink-0 md:border-l md:border-border md:p-3">
              <PublishedContext.Provider value={livePublished}>
              <WebsiteEditorPanel
                site={currentSite}
                payments={payments}
                blog={blog}
                catalogFeature={catalogFeature}
  onPatchBlogSettings={patchBlogSettingsSilently}
                publicSlug={liveSlug}
                planCode={planCode}
                onBeforeUpgrade={flushDraft}
                messages={messages}
                loading={editing}
                aiPhase={aiPhase}
                canUndo={canUndo}
                canRedo={canRedo}
                onDispatch={dispatch}
                onSubmitAi={applyEdit}
                onUndo={undo}
                onRedo={redo}
                onClose={closeEditor}
              versions={persist?.listVersions ? versions : null}
              backups={persist?.listBackups ? backups : null}
              onRestoreBackup={persist?.restoreBackup}
              saveState={saveState}
              onRegenerateHeroImage={handleRegenerateHeroImage}
              heroImageWorking={heroImageWorking}
              onRegenerateSlideImage={handleRegenerateSlideImage}
              workingSlide={workingSlide}
              onRegenerateItemImage={handleRegenerateItemImage}
              workingItem={workingItem}
              selectedIndex={selectedSectionIndex}
              onSelectIndex={setSelectedSectionIndex}
              pendingAiEdit={
                pendingAiEdit ? { sectionIndex: pendingAiEdit.sectionIndex } : null
              }
              onApplyAiEdit={applyPendingAiEdit}
              onRejectAiEdit={rejectPendingAiEdit}
            />
              </PublishedContext.Provider>
          </aside>
        )}
      </div>

      {/* Toast confirmation after an AI edit */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-16 z-20 -translate-x-1/2">
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium shadow-lg ${
              toast.kind === 'ok'
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-destructive/30 bg-destructive/15 text-destructive'
            }`}
          >
            {toast.kind === 'ok' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {toast.text}
          </div>
        </div>
      )}

        {/* AI kredisi tükendiğinde hata yerine gösterilen açıklayıcı ekran. */}
        <OutOfCreditsModal
          open={outOfCredits}
          balance={creditBalance}
          onClose={() => setOutOfCredits(false)}
        />
        <ConfirmDialog
          open={blogConfirm !== null}
          title={blogConfirmCopy(lang).creditsTitle}
          description={blogConfirm?.text ?? ''}
          confirmLabel={blogConfirmCopy(lang).creditsContinue}
          cancelLabel={blogConfirmCopy(lang).cancel}
          onConfirm={() => answerBlogConfirm(true)}
          onCancel={() => answerBlogConfirm(false)}
        />
        {/* FREE planın günlük AI işlem limitine ulaşıldığında gösterilen ekran. */}
        <DailyLimitModal
          open={dailyLimitResetAt !== null}
          onClose={() => {
            setDailyLimitResetAt(null)
            void flushDraft().then((ok) => {
              if (!ok) flashToast('err', t.editor.failure)
            })
          }}
          resetAt={dailyLimitResetAt}
          onBeforeUpgrade={flushDraft}
        />
      </div>
    )
  }

function ToggleButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={label}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}
