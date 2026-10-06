'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUp, Loader2, Sparkles, AlertCircle, Eye, Wand2, Check, Save, RefreshCw, ShoppingBag } from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import { toBilingual } from '@/lib/i18n'
import { PlanResult, type Plan } from '@/components/plan-result'
import { WebsitePreview } from '@/components/website-preview'
import { websiteToPlan, type WebsiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/client'
import { createProject } from '@/lib/projects'
import {
  stashPendingProject,
  peekPendingProject,
  clearPendingProject,
} from '@/lib/pending-project'

export function Hero() {
  const { t, lang } = useLanguage()
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [website, setWebsite] = useState<WebsiteSchema | null>(null)
  const [source, setSource] = useState<'ai' | 'fallback' | null>(null)
  const [error, setError] = useState(false)
  const [anonLimitReached, setAnonLimitReached] = useState(false)
  // Hero image outcome for the current site: 'completed' (real image),
  // 'failed' (provider on but no image — show retry), 'skipped' (no provider),
  // or null. Drives the failure banner + "regenerate image" retry button.
  const [imageStatus, setImageStatus] = useState<
    'completed' | 'failed' | 'skipped' | null
  >(null)
  const [retryingImage, setRetryingImage] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  // Synchronous guard: state updates are async, so two rapid clicks could both
  // pass a state-based check and create duplicate projects. A ref blocks the
  // second call in the same tick.
  const savingRef = useRef(false)
  // When true, the live preview opens with the conversational editor panel open.
  const [startWithEditor, setStartWithEditor] = useState(false)
  // True when the site currently shown was rehydrated from a pending draft
  // (e.g. the visitor bounced off the login screen via "Back to home").
  const [restored, setRestored] = useState(false)
  // Idempotency token carried over from a restored pending draft, so a later
  // "Save & edit" re-stash keeps the same token instead of minting a new one.
  const restoredTokenRef = useRef<string | null>(null)
  // Anchor for the generated "AI plan is ready" card. Once the result is
  // actually in the DOM we smooth-scroll here so the user is taken straight to
  // it (they otherwise miss the card because the button is above the fold).
  const resultRef = useRef<HTMLDivElement | null>(null)
  // The prompt textarea, so the "E-Ticaret sitesi" quick idea can focus it
  // after dropping in the editable example text.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Scroll to the freshly generated plan only after it has truly rendered.
  // We key off `plan` (the state that renders the card) and guard against the
  // loading/error paths so a failed generation never yanks the page down.
  // requestAnimationFrame ensures the layout is committed before we measure.
  useEffect(() => {
    if (loading || error || !plan || !resultRef.current) return
    const id = requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [plan, loading, error])

  // On mount, rehydrate the pending site the visitor generated right before
  // hitting the auth gate — so navigating back to the home page from login
  // preserves their in-progress draft (requirement: return-home restore).
  //
  // This is deliberately a ONE-SHOT continuation, not a persistent preview
  // source: the stash is consumed (cleared) as soon as it is restored. The home
  // preview must reflect only what the visitor is actively working on in this
  // session — it must never keep resurrecting the "last generated project" on
  // every future visit. The idempotency token is kept in a ref so a subsequent
  // "Save & edit" re-stashes the same identity without creating duplicates.
  useEffect(() => {
    const pending = peekPendingProject()
    if (!pending?.schema?.meta) return
    try {
      const restoredPlan = websiteToPlan(pending.schema)
      restoredTokenRef.current = pending.token
      setWebsite(pending.schema)
      setPlan(restoredPlan)
      setPrompt(pending.prompt ?? '')
      setSource('ai')
      setRestored(true)
    } catch {
      // A malformed / stale stash must never crash the home page. Drop it.
      restoredTokenRef.current = null
    } finally {
      // Consume the stash either way: prevents the home preview from sticking
      // to this draft (or any "latest project") across later mounts/refreshes,
      // and discards an unusable payload so it can't error again.
      clearPendingProject()
    }
  }, [])

  /**
   * Saves the generated site as a real project and opens its editor. If the
   * visitor isn't signed in, the site is stashed and they're routed through
   * login → dashboard, which finishes the save so nothing is lost.
   */
  async function saveAndEdit() {
    if (!website || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const payload = {
        name: website.meta.name,
        sector: website.meta.audience ?? null,
        language: lang,
        prompt: prompt.trim() || null,
        schema: website,
      }

      if (!user) {
        // Preserve the token from a restored draft so a bounce through login
        // stays idempotent and can never create a duplicate project.
        stashPendingProject({ ...payload, token: restoredTokenRef.current ?? undefined })
        router.push('/auth/login?next=/dashboard')
        return
      }

      const id = await createProject(payload)
      // Written to the DB — the pending stash is now safe to drop.
      clearPendingProject()
      router.push(`/editor/${id}`)
    } catch {
      setError(true)
      setSaving(false)
      savingRef.current = false
    }
  }

  /**
   * Stashes the current draft with `publishIntent: true` so that whichever
   * auth path the visitor takes (login or sign-up), landing back on the
   * dashboard finishes the save AND carries them straight into an
   * auto-publish instead of just an auto-edit.
   */
  function stashDraftForPublish() {
    if (!website) return
    stashPendingProject({
      name: website.meta.name,
      sector: website.meta.audience ?? null,
      language: lang,
      prompt: prompt.trim() || null,
      schema: website,
      token: restoredTokenRef.current ?? undefined,
      publishIntent: true,
    })
  }

  /**
   * Keeps the latest (possibly edited) anonymous draft for the login handoff
   * without any publish intent. The same token is reused so repeated calls
   * overwrite one stash and the dashboard creates exactly one project.
   */
  function preserveDraft(schema: WebsiteSchema) {
    const stashed = peekPendingProject()
    const token = restoredTokenRef.current ?? stashed?.token
    stashPendingProject({
      name: schema.meta.name,
      sector: schema.meta.audience ?? null,
      language: lang,
      prompt: prompt.trim() || null,
      schema,
      token,
      publishIntent: stashed?.publishIntent,
    })
    restoredTokenRef.current = peekPendingProject()?.token ?? token ?? null
  }

  function handlePublishLoginRequired() {
    stashDraftForPublish()
    router.push('/auth/login?next=/dashboard')
  }

  function handlePublishSignupRequired() {
    stashDraftForPublish()
    router.push('/auth/sign-up')
  }

  /**
   * Already-signed-in visitor hit Publish straight from the anonymous
   * landing preview (no project saved yet). Create the project for real,
   * then hand off to the editor with `?autopublish=1` so it finishes the
   * publish the visitor actually asked for.
   */
  async function publishAsNewProject() {
    if (!website) return
    try {
      const id = await createProject({
        name: website.meta.name,
        sector: website.meta.audience ?? null,
        language: lang,
        prompt: prompt.trim() || null,
        schema: website,
      })
      clearPendingProject()
      router.push(`/editor/${id}?autopublish=1`)
    } catch {
      setError(true)
    }
  }

  async function generate(value: string) {
    const trimmed = value.trim()
    if (!trimmed || loading) return
    setLoading(true)
    setError(false)
    setAnonLimitReached(false)
    setPlan(null)
    setWebsite(null)
    setSource(null)
    setImageStatus(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ask for the full WebsiteSchema; the plan summary is derived from it,
        // so one request powers both the summary card and the live preview.
        body: JSON.stringify({ prompt: trimmed, lang, mode: 'website' }),
      })
      if (res.status === 429) {
        setAnonLimitReached(true)
        return
      }
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const site = data.website as WebsiteSchema
      if (!site || !site.meta) throw new Error('invalid')
      // A freshly generated site supersedes any restored draft. Drop the old
      // stash and its token so the two can never be confused on save.
      clearPendingProject()
      restoredTokenRef.current = null
      setRestored(false)
      setWebsite(site)
      setPlan(websiteToPlan(site))
      setSource(data.source === 'fallback' ? 'fallback' : 'ai')
      setImageStatus(data.image?.status ?? null)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Retries ONLY the hero/slider image for the current site — keeping all text
   * and design intact. Used by the failure banner's "regenerate image" button
   * so a failed image never forces a full rebuild.
   */
  async function retryHeroImage() {
    if (!website || retryingImage) return
    setRetryingImage(true)
    try {
      const res = await fetch('/api/hero-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: website, prompt: prompt.trim() || undefined }),
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      const site = data.website as WebsiteSchema
      if (!site || !site.meta) throw new Error('invalid')
      setWebsite(site)
      setPlan(websiteToPlan(site))
      setImageStatus(data.image?.status ?? null)
    } catch {
      setImageStatus('failed')
    } finally {
      setRetryingImage(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      generate(prompt)
    }
  }

  return (
    <section id="top" className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-bg [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_60%,transparent_100%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[42rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[120px]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            {t.hero.badge}
          </span>
          <h1 className="mt-6 text-balance font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            <span className="text-gradient">{t.hero.title}</span>{' '}
            <span className="block text-muted-foreground sm:inline">
              {t.hero.titleAccent}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t.hero.subtitle}
          </p>
        </div>

        {/* AI prompt box */}
        <div
          id="hero-input"
          className="mx-auto mt-10 max-w-2xl animate-fade-up [animation-delay:120ms]"
        >
          <div className="glow-primary rounded-2xl border border-border bg-card/80 p-2 backdrop-blur">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder={t.hero.placeholder}
              className="w-full resize-none rounded-xl bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <span className="text-xs text-muted-foreground/80">
                {t.hero.hint}
              </span>
              <button
                onClick={() => generate(prompt)}
                disabled={loading || prompt.trim().length < 3}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t.hero.generating}
                  </>
                ) : (
                  <>
                    {t.hero.button}
                    <ArrowUp className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t.hero.tryLabel}
            </span>
            {/* E-commerce idea: fills the input with an editable example so the
                visitor can tweak it before generating, rather than firing
                straight away like the other chips. */}
            <button
              onClick={() => {
                setPrompt(t.hero.ecommerceSample)
                requestAnimationFrame(() => {
                  const el = textareaRef.current
                  if (!el) return
                  el.focus()
                  el.setSelectionRange(el.value.length, el.value.length)
                })
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium text-primary transition-colors hover:border-primary hover:bg-primary/15"
            >
              <ShoppingBag className="h-3.5 w-3.5" />
              {t.hero.ecommerceIdea}
            </button>
            {t.hero.samples.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setPrompt(s)
                  generate(s)
                }}
                className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              >
                {s}
              </button>
            ))}
            {/* Architecture / portfolio idea (last chip): like the e-commerce
                one it drops an editable example into the input instead of
                generating immediately, but keeps the neutral sample-chip look
                since it's a corporate/portfolio brief, not a store. */}
            <button
              onClick={() => {
                setPrompt(t.hero.architectureSample)
                requestAnimationFrame(() => {
                  const el = textareaRef.current
                  if (!el) return
                  el.focus()
                  el.setSelectionRange(el.value.length, el.value.length)
                })
              }}
              className="rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {t.hero.architectureIdea}
            </button>
          </div>

          {/* Result */}
          <div className="mt-6">
            {loading && (
              <GenerationProgress
                title={t.hero.loadingTitle}
                steps={t.hero.loadingSteps}
              />
            )}
            {!loading && anonLimitReached && (
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-card/80 p-4 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-foreground">
                      {lang === 'en'
                        ? 'Free trial limit reached'
                        : 'Ücretsiz deneme limitine ulaştın'}
                    </p>
                    <p className="text-muted-foreground">
                      {lang === 'en'
                        ? 'Log in or create a free account to keep building. Your current draft stays safe.'
                        : 'Devam etmek için giriş yap veya ücretsiz hesap oluştur. Mevcut taslağın korunur.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href="/auth/sign-up"
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                    >
                      {lang === 'en' ? 'Create free account' : 'Ücretsiz hesap oluştur'}
                    </a>
                    <a
                      href="/auth/login?next=/dashboard"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground"
                    >
                      {lang === 'en' ? 'Log in' : 'Giriş yap'}
                    </a>
                  </div>
                </div>
              </div>
            )}
            {!loading && error && (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium text-foreground">
                    {t.hero.errorTitle}
                  </p>
                  <p className="text-muted-foreground">{t.hero.errorBody}</p>
                </div>
              </div>
            )}
            {!loading && !error && plan && (
              <div ref={resultRef} className="scroll-mt-24 space-y-3">
                {restored && (
                  <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-foreground">
                    {t.hero.restoredNote}
                  </p>
                )}
                {source === 'fallback' && (
                  <p className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-muted-foreground">
                    {t.hero.fallbackNote}
                  </p>
                )}
                {imageStatus === 'failed' && (
                  <div className="flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <div>
                        <p className="font-medium text-foreground">
                          {t.hero.imageFailedTitle}
                        </p>
                        <p className="text-muted-foreground">{t.hero.imageFailedBody}</p>
                      </div>
                    </div>
                    <button
                      onClick={retryHeroImage}
                      disabled={retryingImage}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-destructive/40 bg-background px-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                    >
                      {retryingImage ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {retryingImage ? t.hero.retryingImage : t.hero.retryImage}
                    </button>
                  </div>
                )}
                <PlanResult plan={plan} />
                {website && (
                  <div className="space-y-2">
                    <button
                      onClick={saveAndEdit}
                      disabled={saving}
                      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {t.dash.save} & {t.preview.edit}
                    </button>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        onClick={() => {
                          setStartWithEditor(false)
                          setShowPreview(true)
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 text-sm font-semibold transition-colors hover:bg-secondary"
                      >
                        <Eye className="h-4 w-4" />
                        {t.preview.open}
                      </button>
                      <button
                        onClick={() => {
                          setStartWithEditor(true)
                          setShowPreview(true)
                        }}
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/40 text-sm font-semibold transition-colors hover:bg-secondary"
                      >
                        <Wand2 className="h-4 w-4" />
                        {t.preview.edit}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showPreview && website && (
        <WebsitePreview
          site={website}
          lang={toBilingual(lang)}
          initialEditorOpen={startWithEditor}
          onClose={() => setShowPreview(false)}
          onAuthenticatedPublish={publishAsNewProject}
          onLoginRequired={handlePublishLoginRequired}
          onSignupRequired={handlePublishSignupRequired}
          onPreserveDraft={preserveDraft}
        />
      )}
    </section>
  )
}

/**
 * Product-focused loading UI. Walks through the build stages visually while the
 * real request is in flight. It advances the first stages on a light timer and
 * then holds on the final stage — it never blocks or delays the actual result,
 * which replaces this component the moment `loading` turns false.
 */
function GenerationProgress({ title, steps }: { title: string; steps: string[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    // Advance up to (but not past) the last step; the last step stays "in
    // progress" until the API result arrives and unmounts this component.
    if (active >= steps.length - 1) return
    const timer = setTimeout(() => setActive((n) => n + 1), 650)
    return () => clearTimeout(timer)
  }, [active, steps.length])

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {steps.map((step, i) => {
          const done = i < active
          const current = i === active
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : current
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground'
                }`}
              >
                {done ? (
                  <Check className="h-3 w-3" />
                ) : current ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                )}
              </span>
              <span
                className={
                  done || current ? 'text-foreground' : 'text-muted-foreground'
                }
              >
                {step}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
