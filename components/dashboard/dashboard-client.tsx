'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  LogOut,
  Plus,
  Trash2,
  Loader2,
  LayoutGrid,
  ExternalLink,
  Package,
  CreditCard,
  LifeBuoy,
  Mail,
  Globe,
  Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createProject, deleteProject } from '@/lib/projects'
import { createEcommerceProject } from '@/lib/ecommerce'
import type { ProjectListItem } from '@/lib/projects'
import { peekPendingProject, clearPendingProject } from '@/lib/pending-project'
import { useLanguage } from '@/components/language-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { LinkButton } from '@/components/link-button'
import { BrandLogo } from '@/components/brand-logo'
import type { PlanCode } from '@/lib/pricing-config'
import { tenantUrl } from '@/lib/domains'

const headerActionClass =
  'h-11 gap-2 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted hover:text-foreground'

export function DashboardClient({
  projects,
  userEmail,
  planCode,
  billingAlert = null,
}: {
  projects: ProjectListItem[]
  userEmail: string
  /** Kullanıcının aktif paketi; AI kredi göstergesini besler. */
  planCode: PlanCode
  /** Ödeme gerektiren abonelik durumu; yoksa uyarı gösterilmez. */
  billingAlert?: 'past_due' | 'suspended' | null
}) {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [creatingPending, setCreatingPending] = useState(false)
  const [pendingError, setPendingError] = useState(false)
  // Tracks the idempotency token currently being created so neither a Strict
  // Mode double-mount nor a manual retry can create the same project twice.
  const inFlightTokenRef = useRef<string | null>(null)

  // Finish a "Save & edit" that was started while logged out: create the
  // stashed project, then jump straight into its editor. The stash is only
  // cleared AFTER the DB write succeeds, so a failed insert never loses the
  // visitor's site — they can retry. router.refresh() busts the client Router
  // Cache so the dashboard shows the new project when they navigate back.
  const runPendingCreate = useCallback(async () => {
    const pending = peekPendingProject()
    if (!pending) return
    // Guard against concurrent/duplicate runs for the same stashed site.
    if (inFlightTokenRef.current === pending.token) return
    inFlightTokenRef.current = pending.token
    setPendingError(false)
    setCreatingPending(true)
    try {
      const id = await createProject(pending)
      clearPendingProject()
      router.refresh()
      // The visitor's original action was Publish, not just "edit" — carry
      // that intent through so the editor finishes the publish automatically
      // instead of stranding them on a freshly created but still-draft site.
      router.push(pending.publishIntent ? `/editor/${id}?autopublish=1` : `/editor/${id}`)
    } catch {
      // Leave the stash in place so the site is preserved; allow a retry.
      inFlightTokenRef.current = null
      setCreatingPending(false)
      setPendingError(true)
    }
  }, [router])

  useEffect(() => {
    void runPendingCreate()
  }, [runPendingCreate])

  // New e-commerce store: capture a short prompt, create the project, then jump
  // straight into its product panel.
  const [showStorePrompt, setShowStorePrompt] = useState(false)
  const [storePrompt, setStorePrompt] = useState('')
  const [creatingStore, setCreatingStore] = useState(false)

  async function handleCreateStore(e: React.FormEvent) {
    e.preventDefault()
    if (creatingStore) return
    setCreatingStore(true)
    try {
      // Site generation (fallbackWebsite) only has tr/en copy; every other
      // interface locale falls back to generating the store in English.
      const id = await createEcommerceProject({
        prompt: storePrompt,
        language: lang === 'tr' ? 'tr' : 'en',
      })
      router.refresh()
      router.push(`/ecommerce/${id}`)
    } catch {
      setCreatingStore(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  function handleDelete(id: string) {
    if (!window.confirm(t.dash.deleteConfirm)) return
    setPendingId(id)
    startTransition(async () => {
      await deleteProject(id)
      setPendingId(null)
      router.refresh()
    })
  }

  const dateFmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  return (
    <div className="relative min-h-svh">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />

      {creatingPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 text-sm font-medium shadow-xl">
            <Loader2 className="size-5 animate-spin text-primary" />
            {t.dash.saving}
          </div>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="GLOVAL AI" className="flex shrink-0 items-center">
            <BrandLogo priority />
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Link
              href="/dashboard/domains"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Globe className="size-4" />
              <span className="hidden sm:inline">{t.domains.navLabel}</span>
            </Link>
            <Link
              href="/dashboard/email"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Mail className="size-4" />
              <span className="hidden sm:inline">{t.mail.navLabel}</span>
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <CreditCard className="size-4" />
              <span className="hidden sm:inline">{t.dash.billing}</span>
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="size-4" />
              <span className="hidden sm:inline">{t.settings.navLabel}</span>
            </Link>
            <span className="hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1.5">
              <LogOut className="size-4" />
              <span className="hidden sm:inline">{t.auth.logout}</span>
            </Button>
          </div>
        </header>

        {billingAlert && (
          <div
            role="alert"
            className="mt-6 flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-foreground">
              {billingAlert === 'suspended' ? t.billing.dashSuspendedBody : t.billing.dashPastDueBody}
            </span>
            <LinkButton href="/billing" className="shrink-0">
              {billingAlert === 'suspended' ? t.billing.renewSuspendedCta : t.billing.renewPastDueCta}
            </LinkButton>
          </div>
        )}

        {pendingError && (
          <div
            role="alert"
            className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <span>{t.editor.failure}</span>
            <button
              type="button"
              onClick={() => void runPendingCreate()}
              className="font-medium underline underline-offset-2"
            >
              {t.dash.save}
            </button>
          </div>
        )}

        <div className="mt-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-balance">
              {t.dash.title}
            </h1>
            <p className="mt-1 text-muted-foreground">{t.dash.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              onClick={() => {
                setStorePrompt('')
                setShowStorePrompt(true)
              }}
              className={headerActionClass}
            >
              <Package className="size-4" />
              {t.dash.newStore}
            </Button>
            <LinkButton href="/" variant="ghost" className={headerActionClass}>
              <Plus className="size-4" />
              {t.dash.newProject}
            </LinkButton>
            <Link
              href="/support"
              className="support-neon inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold"
            >
              <LifeBuoy className="size-4" />
              {lang === 'tr' ? 'Destek' : 'Support'}
            </Link>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-20 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LayoutGrid className="size-7" />
            </div>
            <p className="mt-5 text-lg font-medium">{t.dash.empty}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.dash.emptyCta}</p>
            <LinkButton href="/" className="mt-6 gap-2">
              <Plus className="size-4" />
              {t.dash.newProject}
            </LinkButton>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <li
                key={p.id}
                className="group relative flex flex-col rounded-2xl border border-border bg-card/70 p-5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Publish state comes from the projects row (`published`),
                        so it always reflects real publish/unpublish results. */}
                    <span
                      className={`status-neon inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${
                        p.published ? 'status-neon-live' : 'status-neon-offline'
                      }`}
                    >
                      {p.published ? t.dash.liveBadge : t.dash.offlineBadge}
                    </span>
                    {p.project_type === 'ecommerce' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        <Package className="size-3" />
                        {t.dash.ecommerce}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    disabled={isPending && pendingId === p.id}
                    aria-label={t.dash.delete}
                    className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                  >
                    {isPending && pendingId === p.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </button>
                </div>

                <Link href={`/editor/${p.id}`} className="mt-3 flex flex-1 flex-col">
                  <h2 className="font-display text-lg font-semibold leading-tight text-balance">
                    {p.name || t.dash.untitled}
                  </h2>
                  {p.sector && (
                    <p className="mt-1 text-sm capitalize text-muted-foreground">{p.sector}</p>
                  )}
                {/* Only shown while live. Unpublishing keeps the slug reserved
                    so republishing reuses the same URL, but rendering it as a
                    path here would advertise an address that now 404s. */}
                {p.published && p.slug && (
                  <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                    /{p.slug}
                  </p>
                )}
                  <div className="mt-4 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span>
                      {t.dash.created}: {dateFmt.format(new Date(p.created_at))}
                    </span>
                    <span>
                      {t.dash.updated}: {dateFmt.format(new Date(p.updated_at))}
                    </span>
                  </div>
                </Link>

                <div className="mt-4 flex items-center justify-between gap-2">
                  <Link
                    href={`/editor/${p.id}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    {t.dash.open}
                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                  {p.published && p.slug && (
                    <a
                      href={tenantUrl(p.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-accent"
                    >
                      {t.dash.viewLive}
                      <ExternalLink className="size-3.5" />
                    </a>
                  )}
                </div>

                {p.project_type === 'ecommerce' && (
                  <Link
                    href={`/ecommerce/${p.id}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    <Package className="size-4" />
                    {t.dash.manageProducts}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showStorePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-primary">
              <Package className="size-5" />
              <h2 className="font-display text-xl font-bold text-foreground">{t.dash.newStore}</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t.dash.newStoreHint}</p>
            <form onSubmit={handleCreateStore} className="mt-4 flex flex-col gap-3">
              <textarea
                value={storePrompt}
                onChange={(e) => setStorePrompt(e.target.value)}
                rows={3}
                autoFocus
                placeholder={t.dash.newStorePlaceholder}
                className="w-full resize-y rounded-lg border border-input bg-background/60 px-3 py-2 text-sm outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowStorePrompt(false)}
                  disabled={creatingStore}
                >
                  {t.ecom.cancel}
                </Button>
                <Button type="submit" disabled={creatingStore} className="gap-2">
                  {creatingStore ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t.dash.saving}
                    </>
                  ) : (
                    t.dash.createStore
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
