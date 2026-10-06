'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Wand2,
  Loader2,
  X,
  Undo2,
  Redo2,
  ArrowUp,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  ChevronUp,
  ChevronDown,
  Palette,
  MessageSquare,
  History,
  Check,
  FileClock,
  ImageIcon,
  Upload,
  Pencil,
  Lock,
} from 'lucide-react'
import { useLanguage } from '@/components/language-provider'
import type { WebsiteSchema, Section } from '@/lib/website-schema'
import { isStorefront } from '@/lib/website-schema'
import type { ProjectVersionItem } from '@/lib/projects'
import { resolveTheme } from '@/components/website-renderer/theme'
import { type EditOperation, ADDABLE_SECTION_TYPES } from '@/lib/website-edit-operations'
import { SectionInspector } from '@/components/editor/section-inspector'
import { TextField, IconBtn, UploadButton } from '@/components/editor/editor-fields'
import { LogoField } from '@/components/editor/logo-field'
import { FaviconField } from '@/components/editor/favicon-field'
import { UpgradeModal } from '@/components/pricing/upgrade-modal'
import { contactActionsForEditor } from '@/lib/site-contact-actions'
import {
  canUseContactActions,
  type LockedFeatureKey,
  type PlanCode,
} from '@/lib/pricing-config'

export type ChatMessage = { role: 'user' | 'assistant'; text: string }
export type AiPhase = 'analyzing' | 'applying' | null

type HeroSection = Extract<Section, { type: 'hero' }>
type Tab = 'design' | 'ai' | 'history'

/**
 * WebsiteEditorPanel
 * ------------------
 * The full editing surface docked beside the live preview. It has two tabs:
 *  - Design: visual controls (site info, colors, hero copy, section manager)
 *  - AI: conversational editing with a running message log
 * It never mutates state itself — every change is emitted as a typed
 * EditOperation via `onDispatch` (or an instruction via `onSubmitAi`), so the
 * parent stays the single owner of the schema and its undo/redo history.
 */
export function WebsiteEditorPanel({
  site,
  planCode = 'free',
  messages,
  loading,
  aiPhase = null,
  canUndo,
  canRedo,
  onDispatch,
  onSubmitAi,
  onUndo,
  onRedo,
  onClose,
  versions = null,
  saveState = 'idle',
  onRegenerateHeroImage,
  heroImageWorking = false,
  onRegenerateSlideImage,
  workingSlide = null,
  onRegenerateItemImage,
  workingItem = null,
  selectedIndex = null,
  onSelectIndex,
  pendingAiEdit = null,
  onApplyAiEdit,
  onRejectAiEdit,
  onBeforeUpgrade,
}: {
  site: WebsiteSchema
  /** Anonim ziyaretçi yükseltme için girişe giderken taslağı saklar. */
  onBeforeUpgrade?: () => Promise<boolean>
  /** Pakete bağlı özellik kilitleri (FREE = telefon / WhatsApp kapalı). */
  planCode?: PlanCode
  messages: ChatMessage[]
  loading: boolean
  aiPhase?: AiPhase
  /** Regenerates ONE gallery/portfolio/team image without touching anything else. */
  onRegenerateItemImage?: (index: number, itemIndex: number, request: string) => void
  /** `"sectionIndex:itemIndex"` currently generating, so only that card spins. */
  workingItem?: string | null
  /**
   * Regenerates ONLY the hero image from a freeform description (or links a
   * direct URL). Kept separate from `onSubmitAi` so an image change never runs
   * the whole-site AI editor — that path used to drop the image entirely.
   */
  onRegenerateHeroImage?: (request: string) => void
  heroImageWorking?: boolean
  /** Regenerates ONE slider slide image (or links a URL) without touching others. */
  onRegenerateSlideImage?: (slideIndex: number, request: string) => void
  /** Index of the slide currently generating, so only that slide spins. */
  workingSlide?: number | null
  canUndo: boolean
  canRedo: boolean
  onDispatch: (op: EditOperation) => void
  /** Resolves to `false` when the edit could not be applied (enables retry). */
  onSubmitAi: (instruction: string) => void | Promise<boolean>
  onUndo: () => void
  onRedo: () => void
  onClose: () => void
  /** Version snapshots for the change-history tab. null = history disabled. */
  versions?: ProjectVersionItem[] | null
  saveState?: 'idle' | 'saving' | 'saved'
  /**
   * Section index selected on the canvas (or via the Design tab's own pencil
   * icon) — the two stay in sync through this single controlled value so
   * clicking a section on the canvas opens the same inspector the pencil
   * icon would.
   */
  selectedIndex?: number | null
  /** Called whenever the selection changes, from either the canvas or the panel. */
  onSelectIndex?: (index: number | null) => void
  /**
   * Non-null while an AI suggestion is awaiting a decision. Locks manual
   * editing and the AI composer so the two "authors" never write to the
   * schema at the same time.
   */
  pendingAiEdit?: { sectionIndex: number | null } | null
  onApplyAiEdit?: () => void
  onRejectAiEdit?: () => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const [tab, setTab] = useState<Tab>('design')
  const historyEnabled = versions !== null
  const locked = pendingAiEdit !== null

  // A canvas click always jumps to the Design tab so the selected section's
  // inspector is immediately visible, whether the panel was on AI or History.
  useEffect(() => {
    if (selectedIndex !== null) setTab('design')
  }, [selectedIndex])

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      {/* Header with undo/redo/close */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Wand2 className="h-4 w-4" />
          </span>
          <h3 className="font-display text-sm font-bold">{t.editor.title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <IconBtn label={ui.undo} disabled={!canUndo || locked} onClick={onUndo}>
            <Undo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={ui.redo} disabled={!canRedo || locked} onClick={onRedo}>
            <Redo2 className="h-4 w-4" />
          </IconBtn>
          <IconBtn label={t.preview.close} onClick={onClose}>
            <X className="h-4 w-4" />
          </IconBtn>
        </div>
      </div>

      {/* AI suggestion banner: visible on every tab, since it blocks the whole
          panel until the user resolves it. */}
      {pendingAiEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/30 bg-primary/10 px-4 py-2.5">
          <span className="flex items-center gap-2 text-xs font-medium text-primary">
            <Wand2 className="h-3.5 w-3.5" />
            {ui.aiPendingBanner}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onRejectAiEdit}
              className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
            >
              {ui.aiPendingReject}
            </button>
            <button
              type="button"
              onClick={onApplyAiEdit}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {ui.aiPendingApply}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border p-2">
        <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
          <Palette className="h-4 w-4" />
          {ui.design}
        </TabButton>
        <TabButton active={tab === 'ai'} onClick={() => setTab('ai')}>
          <MessageSquare className="h-4 w-4" />
          {ui.aiTitle}
        </TabButton>
        {historyEnabled && (
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            <History className="h-4 w-4" />
            {t.editor.history.tab}
          </TabButton>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'design' && (
          <DesignTab
            site={site}
            planCode={planCode}
            onDispatch={onDispatch}
            onRegenerateHeroImage={onRegenerateHeroImage}
            heroImageWorking={heroImageWorking}
            onRegenerateSlideImage={onRegenerateSlideImage}
            workingSlide={workingSlide}
            onRegenerateItemImage={onRegenerateItemImage}
            workingItem={workingItem}
            openIndex={selectedIndex}
            onOpenIndexChange={onSelectIndex}
            locked={locked}
            onBeforeUpgrade={onBeforeUpgrade}
          />
        )}
        {tab === 'ai' && (
          <AiTab
            messages={messages}
            loading={loading}
            aiPhase={aiPhase}
            onSubmit={onSubmitAi}
            locked={locked}
            selectedIndex={selectedIndex}
            onClearSelection={onSelectIndex ? () => onSelectIndex(null) : undefined}
          />
        )}
        {tab === 'history' && historyEnabled && (
          <HistoryTab versions={versions ?? []} saveState={saveState} />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Design tab                                                                */
/* -------------------------------------------------------------------------- */

function DesignTab({
  site,
  planCode,
  onDispatch,
  onRegenerateHeroImage,
  heroImageWorking = false,
  onRegenerateSlideImage,
  workingSlide = null,
  onRegenerateItemImage,
  workingItem = null,
  openIndex = null,
  onOpenIndexChange,
  locked = false,
  onBeforeUpgrade,
}: {
  site: WebsiteSchema
  planCode: PlanCode
  onDispatch: (op: EditOperation) => void
  /** Saves/stashes the draft before an anonymous visitor leaves for login. */
  onBeforeUpgrade?: () => Promise<boolean>
  /** Asks the parent to (re)generate the hero image from a description. */
  onRegenerateHeroImage?: (request: string) => void
  heroImageWorking?: boolean
  /** Asks the parent to (re)generate ONE slider slide image. */
  onRegenerateSlideImage?: (slideIndex: number, request: string) => void
  workingSlide?: number | null
  onRegenerateItemImage?: (index: number, itemIndex: number, request: string) => void
  workingItem?: string | null
  /** Section index whose inspector is open — controlled so a canvas click and
   * the pencil icon share the exact same selection. */
  openIndex?: number | null
  onOpenIndexChange?: (index: number | null) => void
  /** True while an AI suggestion is pending — disables every manual control. */
  locked?: boolean
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const theme = resolveTheme(site)
  const hero = site.sections.find((s): s is HeroSection => s.type === 'hero') ?? null

  return (
    <div
      className={locked ? 'pointer-events-none opacity-50' : undefined}
      aria-disabled={locked}
    >
    {locked && (
      <p className="mx-4 mt-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-snug text-primary">
        {ui.lockedByAiNote}
      </p>
    )}
    <div className="flex flex-col gap-5 p-4">
      <Group title={ui.groupSite}>
        <TextField
          label={ui.siteName}
          value={site.meta.name}
          onCommit={(v) => onDispatch({ op: 'updateMeta', name: v })}
        />
        <TextField
          label={ui.seoTitle}
          value={site.meta.seoTitle ?? ''}
          hint={ui.seoTitleHelp}
          onCommit={(v) => onDispatch({ op: 'updateMeta', seoTitle: v })}
        />
        <TextField
          label={ui.tagline}
          value={site.meta.tagline}
          onCommit={(v) => onDispatch({ op: 'updateMeta', tagline: v })}
        />
      </Group>

      <Group title={ui.groupNav}>
        <TextField
          label={ui.logoText}
          value={site.navigation.logoText}
          onCommit={(v) => onDispatch({ op: 'updateNavigation', logoText: v })}
        />
        <LogoField site={site} onDispatch={onDispatch} onBeforeUpgrade={onBeforeUpgrade} />
        <FaviconField site={site} onDispatch={onDispatch} />
        {site.pages.length > 1 &&
          site.pages.map((page, pageIndex) => {
            const homeIndex = Math.max(
              0,
              site.pages.findIndex((p) => p.isHome === true),
            )
            return (
              <div key={`${page.slug}-${pageIndex}`} className="flex items-end gap-1">
                <div className="flex-1">
                  <TextField
                    label={ui.fieldLabels.label}
                    value={page.title}
                    onCommit={(v) => onDispatch({ op: 'updatePageTitle', pageIndex, title: v })}
                  />
                </div>
                <IconBtn
                  label={ui.remove}
                  small
                  disabled={pageIndex === homeIndex}
                  onClick={() => onDispatch({ op: 'removePage', pageIndex })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            )
          })}
        {site.pages.length <= 1 && site.navigation.links.map((link, linkIndex) => (
          <div key={linkIndex} className="flex items-end gap-1">
            <div className="grid flex-1 grid-cols-2 gap-1.5">
              <TextField
                label={ui.fieldLabels.label}
                value={link.label}
                onCommit={(v) =>
                  onDispatch({ op: 'updateNavLink', linkIndex, field: 'label', value: v })
                }
              />
              <TextField
                label={ui.linkTarget}
                value={link.href}
                onCommit={(v) =>
                  onDispatch({ op: 'updateNavLink', linkIndex, field: 'href', value: v })
                }
              />
            </div>
            <IconBtn
              label={ui.remove}
              small
              disabled={site.navigation.links.length <= 1}
              onClick={() => onDispatch({ op: 'removeNavLink', linkIndex })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconBtn>
          </div>
        ))}
        {site.pages.length <= 1 && (
          <button
            type="button"
            onClick={() => onDispatch({ op: 'addNavLink', label: ui.newLink })}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            {ui.addLink}
          </button>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <TextField
            label={ui.navCta}
            value={site.navigation.cta?.label ?? ''}
            onCommit={(v) => onDispatch({ op: 'updateNavCta', field: 'label', value: v })}
          />
          <TextField
            label={ui.linkTarget}
            value={site.navigation.cta?.href ?? ''}
            onCommit={(v) => onDispatch({ op: 'updateNavCta', field: 'href', value: v })}
          />
        </div>
      </Group>

      <Group title={ui.groupColors}>
        <div className="grid grid-cols-2 gap-3">
          <ColorField
            label={ui.brandColor}
            value={theme.primary}
            onCommit={(v) => onDispatch({ op: 'updatePalette', role: 'primary', hex: v })}
          />
          <ColorField
            label={ui.accentColor}
            value={theme.accent}
            onCommit={(v) => onDispatch({ op: 'updatePalette', role: 'accent', hex: v })}
          />
          <ColorField
            label={ui.bgColor}
            value={theme.background}
            onCommit={(v) => onDispatch({ op: 'updatePalette', role: 'background', hex: v })}
          />
          <ColorField
            label={ui.textColor}
            value={theme.foreground}
            onCommit={(v) => onDispatch({ op: 'updatePalette', role: 'foreground', hex: v })}
          />
        </div>
      </Group>

      {hero && (
        <Group title={ui.groupHero}>
          <TextField
            label={ui.heroBadge}
            value={hero.badge ?? ''}
            onCommit={(v) => onDispatch({ op: 'updateHero', patch: { badge: v } })}
          />
          <TextField
            label={ui.heroTitle}
            value={hero.title}
            onCommit={(v) => onDispatch({ op: 'updateHero', patch: { title: v } })}
          />
          <TextField
            label={ui.heroDesc}
            multiline
            value={hero.description}
            onCommit={(v) => onDispatch({ op: 'updateHero', patch: { description: v } })}
          />
          <TextField
            label={ui.heroTrust}
            value={hero.trustText ?? ''}
            onCommit={(v) => onDispatch({ op: 'updateHero', patch: { trustText: v } })}
          />
          <HeroImageField
            hero={hero}
            onDispatch={onDispatch}
            onRegenerate={onRegenerateHeroImage}
            working={heroImageWorking}
          />
          {(hero.slides?.length ?? 0) > 1 && (
            <SlideImagesField
              hero={hero}
              onDispatch={onDispatch}
              onRegenerate={onRegenerateSlideImage}
              workingSlide={workingSlide}
            />
          )}
        </Group>
      )}

      <Group title={ui.groupSections}>
        <SectionManager
          site={site}
          onDispatch={onDispatch}
          onRegenerateItemImage={onRegenerateItemImage}
          workingItem={workingItem}
          openIndex={openIndex}
          onOpenIndexChange={onOpenIndexChange}
        />
      </Group>

      <Group title={ui.groupContact}>
        <ContactActionsFields
          site={site}
          planCode={planCode}
          onDispatch={onDispatch}
          onBeforeUpgrade={onBeforeUpgrade}
        />
      </Group>

      <Group title={ui.groupCode}>
        <p className="text-[11px] leading-snug text-muted-foreground">{ui.codeIntro}</p>
        <TextField
          label={ui.codeHead}
          hint={ui.codeHeadHelp}
          multiline
          mono
          rows={6}
          placeholder={ui.codePlaceholder}
          value={site.tracking?.head ?? ''}
          onCommit={(v) => onDispatch({ op: 'updateTracking', field: 'head', value: v })}
        />
        <TextField
          label={ui.codeBodyStart}
          hint={ui.codeBodyStartHelp}
          multiline
          mono
          rows={6}
          placeholder={ui.codePlaceholder}
          value={site.tracking?.bodyStart ?? ''}
          onCommit={(v) => onDispatch({ op: 'updateTracking', field: 'bodyStart', value: v })}
        />
        <TextField
          label={ui.codeBodyEnd}
          hint={ui.codeBodyEndHelp}
          multiline
          mono
          rows={6}
          placeholder={ui.codePlaceholder}
          value={site.tracking?.bodyEnd ?? ''}
          onCommit={(v) => onDispatch({ op: 'updateTracking', field: 'bodyEnd', value: v })}
        />
      </Group>
    </div>
    </div>
  )
}

/**
 * Manual control for the floating phone + WhatsApp buttons.
 *
 * The numbers shown here are the RESOLVED values, so a site that has never been
 * configured displays the number inherited from its contact section instead of
 * an empty box. Committing a field writes it explicitly, which is what lets an
 * empty value mean "remove this button" rather than "inherit again".
 */
function ContactActionsFields({
  site,
  planCode,
  onDispatch,
  onBeforeUpgrade,
}: {
  site: WebsiteSchema
  planCode: PlanCode
  onDispatch: (op: EditOperation) => void
  onBeforeUpgrade?: () => Promise<boolean>
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const current = contactActionsForEditor(site)
  // FREE kullanıcı telefon/WhatsApp butonlarını kullanamaz. Alanlar tamamen
  // gizlenmez; kilit olarak durur ve dokununca yükseltme mesajı açılır — böylece
  // özelliğin var olduğu ama pakete bağlı olduğu anlaşılır.
  const [lockedFeature, setLockedFeature] = useState<LockedFeatureKey | null>(null)
  // E-ticaret sitelerinde telefon/WhatsApp butonları paket kilidinden muaftır:
  // bir mağaza için iletişim butonu temel bir özelliktir, bu yüzden FREE pakette
  // bile düzenlenebilir kalır (public görünümle aynı kural — resolveContactActions).
  const allowed = canUseContactActions(planCode) || isStorefront(site)

  if (!allowed) {
    return (
      <>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {ui.contactIntro}
        </p>
        {(
          [
            { key: 'phone' as const, label: ui.contactPhone },
            { key: 'whatsapp' as const, label: ui.contactWhatsapp },
          ]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setLockedFeature(item.key)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="text-xs font-medium text-muted-foreground">
              {item.label}
            </span>
            <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        ))}
        <UpgradeModal
          featureKey={lockedFeature}
          onClose={() => setLockedFeature(null)}
          linkPrefix="/"
        onBeforeUpgrade={onBeforeUpgrade}
        />
      </>
    )
  }

  return (
    <>
      <p className="text-[11px] leading-snug text-muted-foreground">{ui.contactIntro}</p>
      <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium">{ui.contactEnabled}</span>
        <input
          type="checkbox"
          checked={current.enabled}
          onChange={(e) =>
            onDispatch({ op: 'updateContactActions', enabled: e.target.checked })
          }
          className="h-4 w-4 accent-primary"
        />
      </label>
      {current.enabled && (
        <>
          <TextField
            label={ui.contactPhone}
            hint={ui.contactPhoneHelp}
            value={current.phone ?? ''}
            placeholder="+90 212 555 12 34"
            onCommit={(v) => onDispatch({ op: 'updateContactActions', phone: v })}
          />
          <TextField
            label={ui.contactWhatsapp}
            hint={ui.contactWhatsappHelp}
            value={current.whatsapp ?? ''}
            placeholder="+90 532 555 12 34"
            onCommit={(v) => onDispatch({ op: 'updateContactActions', whatsapp: v })}
          />
          <TextField
            label={ui.contactMessage}
            hint={ui.contactMessageHelp}
            multiline
            rows={2}
            value={current.whatsappMessage ?? ''}
            onCommit={(v) => onDispatch({ op: 'updateContactActions', whatsappMessage: v })}
          />
        </>
      )}
    </>
  )
}

/**
 * Manual hero image control.
 *
 * Gives the user two independent, always-available paths to the main slider
 * visual — an AI description ("beyaz kamyonete koli yükleyen personel") and a
 * direct image URL — so a failed generation never leaves them stuck. The
 * description is stored on the schema immediately (so it survives even when
 * generation is unavailable) and regeneration is delegated to the parent.
 */
function HeroImageField({
  hero,
  onDispatch,
  onRegenerate,
  working,
}: {
  hero: HeroSection
  onDispatch: (op: EditOperation) => void
  onRegenerate?: (request: string) => void
  working: boolean
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const current = hero.image?.imagePrompt ?? hero.imagePrompt ?? ''
  const [draft, setDraft] = useState(current)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && draft !== current) setDraft(current)

  const src = hero.image?.src ?? ''

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{ui.heroImage}</span>
        <textarea
          rows={3}
          value={draft}
          placeholder={ui.heroImageHint}
          onChange={(e) => {
            dirtyRef.current = true
            setDraft(e.target.value)
          }}
          onBlur={() => {
            dirtyRef.current = false
            if (draft !== current) onDispatch({ op: 'updateHeroImage', patch: { imagePrompt: draft } })
          }}
          className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground"
        />
      </label>

      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/data URI preview
        <img
          src={src || '/placeholder.svg'}
          alt={hero.image?.alt ?? ''}
          className="h-24 w-full rounded-lg border border-border object-cover"
        />
      ) : null}

      {onRegenerate && (
        <button
          type="button"
          onClick={() => {
            const request = draft.trim()
            dirtyRef.current = false
            if (request && request !== current) {
              onDispatch({ op: 'updateHeroImage', patch: { imagePrompt: request } })
            }
            onRegenerate(request)
          }}
          disabled={working}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {working ? ui.heroImageWorking : ui.heroImageRegenerate}
        </button>
      )}

      <UploadButton
        label={ui.heroImageUpload}
        icon={<Upload className="h-4 w-4" />}
        onFile={(dataUri) => onDispatch({ op: 'updateHeroImage', patch: { src: dataUri } })}
      />
    </div>
  )
}

/**
 * Per-slide image controls for a multi-slide slider hero.
 *
 * When the hero rotates through several slides, each slide is a self-contained
 * visual — so the owner needs to set each one independently instead of only the
 * first. This renders one upload + AI-generate + description block per slide,
 * dispatching a slide-scoped `updateSlideImage` op (and delegating regeneration
 * to the parent, keyed by slide index) so touching one slide never disturbs the
 * others. The first slide is tagged as the one shown first.
 */
function SlideImagesField({
  hero,
  onDispatch,
  onRegenerate,
  workingSlide,
}: {
  hero: HeroSection
  onDispatch: (op: EditOperation) => void
  onRegenerate?: (slideIndex: number, request: string) => void
  workingSlide?: number | null
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const slides = hero.slides ?? []

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">{ui.slideImagesTitle}</span>
        <p className="text-[11px] leading-snug text-muted-foreground">{ui.slideImagesIntro}</p>
      </div>
      {slides.map((slide, slideIndex) => (
        <SlideImageRow
          key={slideIndex}
          label={`${ui.slideLabel} ${slideIndex + 1}`}
          firstBadge={slideIndex === 0 ? ui.slideFirstBadge : null}
          title={slide.title}
          image={slide.image}
          working={workingSlide === slideIndex}
          onCommitPrompt={(imagePrompt) =>
            onDispatch({ op: 'updateSlideImage', slideIndex, patch: { imagePrompt } })
          }
          onUpload={(dataUri) =>
            onDispatch({ op: 'updateSlideImage', slideIndex, patch: { src: dataUri } })
          }
          onRegenerate={
            onRegenerate ? (request) => onRegenerate(slideIndex, request) : undefined
          }
        />
      ))}
    </div>
  )
}

/** A single slide's image editor: description + preview + AI regen + upload. */
function SlideImageRow({
  label,
  firstBadge,
  title,
  image,
  working,
  onCommitPrompt,
  onUpload,
  onRegenerate,
}: {
  label: string
  firstBadge: string | null
  title?: string
  image?: { src?: string; alt?: string; imagePrompt?: string }
  working: boolean
  onCommitPrompt: (imagePrompt: string) => void
  onUpload: (dataUri: string) => void
  onRegenerate?: (request: string) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const current = image?.imagePrompt ?? ''
  const [draft, setDraft] = useState(current)
  const dirtyRef = useRef(false)
  if (!dirtyRef.current && draft !== current) setDraft(current)

  const src = image?.src ?? ''

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold">{label}</span>
        {firstBadge && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            {firstBadge}
          </span>
        )}
      </div>
      {title && (
        <p className="truncate text-[11px] text-muted-foreground" title={title}>
          {title}
        </p>
      )}

      <textarea
        rows={2}
        value={draft}
        placeholder={ui.heroImageHint}
        onChange={(e) => {
          dirtyRef.current = true
          setDraft(e.target.value)
        }}
        onBlur={() => {
          dirtyRef.current = false
          if (draft !== current) onCommitPrompt(draft)
        }}
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary placeholder:text-muted-foreground"
      />

      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary remote/data URI preview
        <img
          src={src || '/placeholder.svg'}
          alt={image?.alt ?? ''}
          className="h-20 w-full rounded-lg border border-border object-cover"
        />
      ) : null}

      {onRegenerate && (
        <button
          type="button"
          onClick={() => {
            const request = draft.trim()
            dirtyRef.current = false
            if (request && request !== current) onCommitPrompt(request)
            onRegenerate(request)
          }}
          disabled={working}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-border py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {working ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {working ? ui.heroImageWorking : ui.heroImageRegenerate}
        </button>
      )}

      <UploadButton
        label={ui.heroImageUpload}
        icon={<Upload className="h-4 w-4" />}
        onFile={onUpload}
      />
    </div>
  )
}

function SectionManager({
  site,
  onDispatch,
  onRegenerateItemImage,
  workingItem = null,
  openIndex: controlledOpenIndex = null,
  onOpenIndexChange,
}: {
  site: WebsiteSchema
  onDispatch: (op: EditOperation) => void
  onRegenerateItemImage?: (index: number, itemIndex: number, request: string) => void
  workingItem?: string | null
  /** Controlled by the parent so canvas clicks and the pencil icon share one selection. */
  openIndex?: number | null
  onOpenIndexChange?: (index: number | null) => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const [adding, setAdding] = useState(false)
  const [internalOpenIndex, setInternalOpenIndex] = useState<number | null>(null)
  const openIndex = onOpenIndexChange ? controlledOpenIndex : internalOpenIndex
  const setOpenIndex = onOpenIndexChange ?? setInternalOpenIndex
  const sections = site.sections

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1.5">
        {sections.map((section, i) => {
          const name = t.editor.sectionNames[section.type] ?? section.type
          const isHidden = Boolean(section.hidden)
          const locked = section.type === 'footer' || section.type === 'hero'
          const open = openIndex === i
          return (
            <li
              key={`${section.type}-${i}`}
              className="rounded-lg border border-border bg-background/50 px-2.5 py-2"
            >
            <div className="flex items-center gap-1">
              <span className="flex-1 truncate text-sm font-medium">
                {name}
                {isHidden && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {ui.hidden}
                  </span>
                )}
              </span>
              <IconBtn
                label={ui.editContent}
                onClick={() => setOpenIndex(open ? null : i)}
                small
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={ui.moveUp}
                disabled={i === 0}
                onClick={() => onDispatch({ op: 'moveSection', index: i, direction: 'up' })}
                small
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={ui.moveDown}
                disabled={i === sections.length - 1}
                onClick={() => onDispatch({ op: 'moveSection', index: i, direction: 'down' })}
                small
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                label={isHidden ? ui.show : ui.hide}
                disabled={section.type === 'footer'}
                onClick={() =>
                  onDispatch({ op: 'setSectionHidden', index: i, hidden: !isHidden })
                }
                small
              >
                {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </IconBtn>
              <IconBtn
                label={ui.remove}
                disabled={locked}
                onClick={() => onDispatch({ op: 'removeSection', index: i })}
                small
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>

            {open && (
              <SectionInspector
                site={site}
                index={i}
                onDispatch={onDispatch}
                onRegenerateItemImage={onRegenerateItemImage}
                workingItem={workingItem}
              />
            )}
            </li>
          )
        })}
      </ul>

      {adding ? (
        <div className="rounded-lg border border-border bg-background/50 p-2">
          <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">
            {ui.addSectionTitle}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {ADDABLE_SECTION_TYPES.filter((type) => type !== 'hero').map((type) => (
              <button
                key={type}
                onClick={() => {
                  onDispatch({ op: 'addSection', sectionType: type })
                  setAdding(false)
                }}
                className="rounded-md border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-secondary"
              >
                {t.editor.sectionNames[type] ?? type}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAdding(false)}
            className="mt-2 w-full rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary"
          >
            {ui.cancel}
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          {ui.addSection}
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  AI tab                                                                    */
/* -------------------------------------------------------------------------- */

function AiTab({
  messages,
  loading,
  aiPhase,
  onSubmit,
  locked = false,
  selectedIndex = null,
  onClearSelection,
}: {
  messages: ChatMessage[]
  loading: boolean
  aiPhase: AiPhase
  /**
   * Applies an instruction. May resolve to `false` when the edit could not be
   * applied, so the composer can restore the user's text for an easy retry
   * instead of silently losing it.
   */
  onSubmit: (instruction: string) => void | Promise<boolean>
  /** True while a previous AI suggestion is still awaiting Apply/Reject. */
  locked?: boolean
  /** Section selected on the canvas — instructions are scoped to just it. */
  selectedIndex?: number | null
  onClearSelection?: () => void
}) {
  const { t } = useLanguage()
  const ui = t.editor.ui
  const [value, setValue] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const phaseText =
    aiPhase === 'analyzing'
      ? t.editor.phaseAnalyzing
      : aiPhase === 'applying'
        ? t.editor.applying
        : t.editor.applying

  async function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading || locked) return
    // Optimistically clear the field so the message log reads cleanly, but keep
    // the text so a failed edit can restore it (network/server error retry).
    setValue('')
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
    })
    const result = await onSubmit(trimmed)
    if (result === false) {
      // Edit failed — put the instruction back (unless the user already started
      // typing a new one) so they can tweak and retry without re-typing.
      setValue((current) => (current.trim().length === 0 ? trimmed : current))
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {t.editor.suggestionsLabel}
            </p>
            <div className="flex flex-col gap-1.5">
              {t.editor.suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => submit(s)}
                  disabled={loading}
                  className="rounded-lg border border-border px-3 py-2 text-left text-sm transition-colors hover:border-primary hover:bg-secondary disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <li key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <span
                  className={`max-w-[85%] text-pretty rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-secondary text-secondary-foreground'
                  }`}
                >
                  {m.text}
                </span>
              </li>
            ))}
            {loading && (
              <li className="flex justify-start">
                <span className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {phaseText}
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-border p-3">
        {selectedIndex !== null && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5">
            <span className="text-[11px] font-medium text-primary">{ui.aiSelectionScoped}</span>
            {onClearSelection && (
              <button
                type="button"
                onClick={onClearSelection}
                className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                {ui.aiSelectionClear}
              </button>
            )}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2 transition-colors focus-within:border-primary">
          <textarea
            rows={2}
            value={value}
            disabled={locked}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault()
                submit(value)
              }
            }}
            placeholder={ui.aiPlaceholder}
            className="min-h-[3rem] max-h-40 w-full flex-1 resize-none bg-transparent py-1 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
          />
          <button
            onClick={() => submit(value)}
            disabled={loading || locked || !value.trim()}
            aria-label={t.editor.apply}
            className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] leading-snug text-muted-foreground/80">
          {locked ? ui.aiPendingComposerHint : ui.aiComposerHint}
        </p>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  History tab                                                               */
/* -------------------------------------------------------------------------- */

function HistoryTab({
  versions,
  saveState,
}: {
  versions: ProjectVersionItem[]
  saveState: 'idle' | 'saving' | 'saved'
}) {
  const { t, lang } = useLanguage()
  const h = t.editor.history
  const fmt = new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

  const draftLabel =
    saveState === 'saving' ? t.dash.saving : saveState === 'saved' ? h.autosaved : h.draft

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-muted-foreground">{h.description}</p>

      {/* Live draft state — always at the top. */}
      <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <FileClock className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{h.current}</p>
          <p className="text-xs text-muted-foreground">{draftLabel}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {t.dash.draft}
        </span>
      </div>

      {versions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          {h.empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {versions.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {v.label === 'published' ? h.publishedSnapshot : h.savedSnapshot}
                </p>
                <p className="text-xs text-muted-foreground">{fmt.format(new Date(v.created_at))}</p>
              </div>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                {t.dash.saved}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Building blocks                                                           */
/* -------------------------------------------------------------------------- */

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  )
}

function ColorField({
  label,
  value,
  onCommit,
}: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  // `value` may arrive as a non-hex (rgb/default); the color input needs
  // #rrggbb, so fall back to a safe default when it isn't valid hex.
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5">
        <input
          key={safe}
          type="color"
          defaultValue={safe}
          onBlur={(e) => {
            if (e.target.value.toLowerCase() !== value.toLowerCase()) onCommit(e.target.value)
          }}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
          aria-label={label}
        />
        <span className="font-mono text-xs uppercase text-muted-foreground">{safe}</span>
      </div>
    </label>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
      }`}
    >
      {children}
    </button>
  )
}
