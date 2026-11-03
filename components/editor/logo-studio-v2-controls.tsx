'use client'

import { LOGO_STUDIO_SECTORS, MAX_LOGO_STUDIO_DIRECTION, MAX_LOGO_STUDIO_NOTES, type LogoStudioLocale, type LogoStudioSectorId } from '@/lib/logo-studio/v2'
import { METAL_TONE_IDS, type LogoMetalTone } from '@/lib/logo-studio/rules'

type LogoStudioV2Copy = {
  section: string
  sector: string
  notes: string
  notesPlaceholder: string
  notesHint: string
  direction: string
  directionPlaceholder: string
  directionHint: string
  directionBrandName: string
  metal: string
  gold: string
  silver: string
  bronze: string
  metalHint: string
}

type LogoStudioV2ControlsProps = {
  locale: LogoStudioLocale
  sectorId: LogoStudioSectorId
  onSectorChange: (sector: LogoStudioSectorId) => void
  industryNotes: string
  onIndustryNotesChange: (notes: string) => void
  creativeDirection: string
  onCreativeDirectionChange: (direction: string) => void
  directionContainsBrandName: boolean
  tone: LogoMetalTone
  onToneChange: (tone: LogoMetalTone) => void
  showDirection: boolean
  showMetalTones: boolean
  disabled: boolean
  copy: LogoStudioV2Copy
}

const fieldClassName =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

export function LogoStudioV2Controls({
  locale,
  sectorId,
  onSectorChange,
  industryNotes,
  onIndustryNotesChange,
  creativeDirection,
  onCreativeDirectionChange,
  directionContainsBrandName,
  tone,
  onToneChange,
  showDirection,
  showMetalTones,
  disabled,
  copy,
}: LogoStudioV2ControlsProps) {
  const toneLabel: Record<LogoMetalTone, string> = {
    gold: copy.gold,
    silver: copy.silver,
    bronze: copy.bronze,
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3" aria-labelledby="logo-studio-v2-heading">
      <h3 id="logo-studio-v2-heading" className="text-sm font-semibold text-foreground">
        {copy.section}
      </h3>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="logo-studio-v2-sector" className="text-sm font-medium text-foreground">
            {copy.sector}
          </label>
          <select
            id="logo-studio-v2-sector"
            value={sectorId}
            onChange={(event) => onSectorChange(event.currentTarget.value as LogoStudioSectorId)}
            disabled={disabled}
            className={fieldClassName}
          >
            {LOGO_STUDIO_SECTORS.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector[locale]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="logo-studio-v2-notes" className="text-sm font-medium text-foreground">
            {copy.notes}
          </label>
          <textarea
            id="logo-studio-v2-notes"
            rows={2}
            maxLength={MAX_LOGO_STUDIO_NOTES}
            value={industryNotes}
            onChange={(event) => onIndustryNotesChange(event.currentTarget.value)}
            placeholder={copy.notesPlaceholder}
            aria-describedby="logo-studio-v2-notes-hint"
            disabled={disabled}
            className={fieldClassName}
          />
          <p id="logo-studio-v2-notes-hint" className="flex items-start justify-between gap-2 text-sm leading-relaxed text-muted-foreground">
            <span>{copy.notesHint}</span>
            <span aria-label={`${Array.from(industryNotes).length} / ${MAX_LOGO_STUDIO_NOTES}`} className="shrink-0 tabular-nums">
              {Array.from(industryNotes).length}/{MAX_LOGO_STUDIO_NOTES}
            </span>
          </p>
        </div>
      </div>

      {showDirection ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="logo-studio-v2-direction" className="text-sm font-medium text-foreground">
            {copy.direction}
          </label>
          <input
            id="logo-studio-v2-direction"
            type="text"
            maxLength={MAX_LOGO_STUDIO_DIRECTION}
            value={creativeDirection}
            onChange={(event) => onCreativeDirectionChange(event.currentTarget.value)}
            placeholder={copy.directionPlaceholder}
            aria-describedby="logo-studio-v2-direction-hint"
            aria-invalid={directionContainsBrandName || undefined}
            disabled={disabled}
            className={fieldClassName}
          />
          <p
            id="logo-studio-v2-direction-hint"
            className={`flex items-start justify-between gap-2 text-sm leading-relaxed ${directionContainsBrandName ? 'text-destructive' : 'text-muted-foreground'}`}
          >
            <span>{directionContainsBrandName ? copy.directionBrandName : copy.directionHint}</span>
            <span aria-label={`${Array.from(creativeDirection).length} / ${MAX_LOGO_STUDIO_DIRECTION}`} className="shrink-0 tabular-nums">
              {Array.from(creativeDirection).length}/{MAX_LOGO_STUDIO_DIRECTION}
            </span>
          </p>
        </div>
      ) : null}

      {showMetalTones ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">{copy.metal}</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={copy.metal}>
            {METAL_TONE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={tone === id}
                disabled={disabled}
                onClick={() => onToneChange(id)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                  tone === id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/60 hover:text-foreground'
                }`}
              >
                {toneLabel[id]}
              </button>
            ))}
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{copy.metalHint}</p>
        </div>
      ) : null}
    </section>
  )
}
