/**
 * Single source for the Meta plan status colour language.
 * The plan picker, the plan badge and the Overview plan summaries all read this mapping,
 * so a status can never look different in two places. Client-safe: no server imports.
 *
 * Colours themselves live as CSS tokens (`--plan-*` in app/globals.css); this module only
 * decides WHICH token a status uses (`colorKey`) plus its label, icon and aria text.
 */

export type MetaPlanLang = 'tr' | 'en'

/** Semantic status of a plan as the user perceives it. */
export type MetaPlanStatusKey =
  | 'draft'
  | 'paused'
  | 'partial'
  | 'active'
  | 'review'
  | 'disapproved'
  | 'failed'
  | 'publishing'
  | 'archived'

/** Token family (`--plan-<colorKey>`); several statuses can share one colour. */
export type MetaPlanColorKey = 'draft' | 'paused' | 'partial' | 'active' | 'review' | 'error' | 'archived'

export type MetaPlanIconKey = 'draft' | 'paused' | 'partial' | 'active' | 'review' | 'error' | 'archived' | 'publishing'

export type MetaPlanTone = 'neutral' | 'ok' | 'warn' | 'error'

export type MetaPlanStatusView = {
  key: MetaPlanStatusKey
  colorKey: MetaPlanColorKey
  icon: MetaPlanIconKey
  tone: MetaPlanTone
  label: string
  /** e.g. "Plan durumu: Etkin". Colour is never the only channel: icon + label + this text. */
  ariaLabel: string
  /** Soft outer glow (box-shadow). Off for the archived/ended look. */
  glow: boolean
  /** Very slow, subtle pulse. Only a live (active) campaign pulses. */
  pulse: boolean
}

export const REVIEW_EFFECTIVE_STATES: ReadonlySet<string> = new Set(['PENDING_REVIEW', 'IN_PROCESS', 'PREAPPROVED'])
export const DISAPPROVED_EFFECTIVE_STATES: ReadonlySet<string> = new Set(['DISAPPROVED', 'WITH_ISSUES'])

type Labels = Record<MetaPlanLang, string>

type Definition = {
  key: MetaPlanStatusKey
  colorKey: MetaPlanColorKey
  icon: MetaPlanIconKey
  tone: MetaPlanTone
  glow: boolean
  pulse: boolean
  label: Labels
}

const DEFINITIONS = {
  draft: { key: 'draft', colorKey: 'draft', icon: 'draft', tone: 'neutral', glow: true, pulse: false, label: { tr: 'Taslak', en: 'Draft' } },
  validated: { key: 'draft', colorKey: 'draft', icon: 'draft', tone: 'neutral', glow: true, pulse: false, label: { tr: 'Doğrulandı', en: 'Validated' } },
  approved: { key: 'draft', colorKey: 'draft', icon: 'draft', tone: 'neutral', glow: true, pulse: false, label: { tr: 'Onaylandı', en: 'Approved' } },
  paused: { key: 'paused', colorKey: 'paused', icon: 'paused', tone: 'neutral', glow: true, pulse: false, label: { tr: 'Duraklatıldı', en: 'Paused' } },
  partial: { key: 'partial', colorKey: 'partial', icon: 'partial', tone: 'warn', glow: true, pulse: false, label: { tr: 'Kısmen oluştu', en: 'Partially created' } },
  active: { key: 'active', colorKey: 'active', icon: 'active', tone: 'ok', glow: true, pulse: true, label: { tr: 'Etkin', en: 'Active' } },
  review: { key: 'review', colorKey: 'review', icon: 'review', tone: 'warn', glow: true, pulse: false, label: { tr: 'Meta incelemesinde', en: 'In Meta review' } },
  disapproved: { key: 'disapproved', colorKey: 'error', icon: 'error', tone: 'error', glow: true, pulse: false, label: { tr: 'Reddedildi', en: 'Rejected' } },
  failed: { key: 'failed', colorKey: 'error', icon: 'error', tone: 'error', glow: true, pulse: false, label: { tr: 'Başarısız', en: 'Failed' } },
  publishing: { key: 'publishing', colorKey: 'review', icon: 'publishing', tone: 'warn', glow: true, pulse: false, label: { tr: 'Oluşturuluyor', en: 'Creating' } },
  archived: { key: 'archived', colorKey: 'archived', icon: 'archived', tone: 'neutral', glow: false, pulse: false, label: { tr: 'Arşivlendi', en: 'Archived' } },
} as const satisfies Record<string, Definition>

type DefinitionName = keyof typeof DEFINITIONS

function resolveDefinition(plan: { status: string; effectiveStatus?: string | null }): DefinitionName {
  switch (plan.status) {
    case 'active': {
      const effective = plan.effectiveStatus ?? null
      if (effective && DISAPPROVED_EFFECTIVE_STATES.has(effective)) return 'disapproved'
      if (effective && REVIEW_EFFECTIVE_STATES.has(effective)) return 'review'
      return 'active'
    }
    case 'published':
    case 'user_paused':
      return 'paused'
    case 'partial':
      return 'partial'
    case 'failed':
      return 'failed'
    case 'publishing':
      return 'publishing'
    case 'archived':
      return 'archived'
    case 'validated':
      return 'validated'
    case 'approved':
      return 'approved'
    default:
      return 'draft'
  }
}

export function metaPlanStatusAriaText(label: string, lang: MetaPlanLang = 'tr'): string {
  return lang === 'tr' ? `Plan durumu: ${label}` : `Plan status: ${label}`
}

/** The one mapping: raw plan status (+ Meta's effective status) -> colour key, label, icon, aria text. */
export function metaPlanStatusView(
  plan: { status: string; effectiveStatus?: string | null },
  lang: MetaPlanLang = 'tr',
): MetaPlanStatusView {
  const definition = DEFINITIONS[resolveDefinition(plan)]
  const label = definition.label[lang]
  return {
    key: definition.key,
    colorKey: definition.colorKey,
    icon: definition.icon,
    tone: definition.tone,
    label,
    ariaLabel: metaPlanStatusAriaText(label, lang),
    glow: definition.glow,
    pulse: definition.pulse,
  }
}

/** Accessible name for a plan picker button: name, status and selection, so neither colour nor ring is the only cue. */
export function metaPlanPickerAriaLabel(
  name: string,
  view: Pick<MetaPlanStatusView, 'ariaLabel'>,
  selected: boolean,
  lang: MetaPlanLang = 'tr',
): string {
  const parts = [name, view.ariaLabel]
  if (selected) parts.push(lang === 'tr' ? 'seçili' : 'selected')
  return parts.join(', ')
}
