import { detectImageEditIntent, hasImageMention, type ImageEditIntent } from '@/lib/image-edit-intent'
import { parseCommand } from '@/lib/website-command-parser'
import { applyOperation } from '@/lib/website-edit-operations'
import { websiteSchema, type WebsiteSchema } from '@/lib/website-schema'

/**
 * Read-only mirror of the CLIENT half of `applyEdit` in
 * components/website-preview.tsx (steps 0b conjunction split, 0c image intent,
 * 1 offline parser). The component is React state all the way down, so it can't
 * be imported; `pipeline.test.ts` pins the call order in the real file so this
 * mirror cannot silently drift. Production code is NOT modified or imported
 * for writing: only pure parsing helpers are called.
 */

export type ClientStageResult =
  | { stage: 'image'; intent: ImageEditIntent; textInstruction: string | null }
  | {
      stage: 'parser'
      source: 'parser-applied' | 'parser-noop' | 'parser-empty'
      schema: WebsiteSchema
      feedback: string
    }
  | { stage: 'api'; textInstruction: string }

export function runClientStage(instruction: string, site: WebsiteSchema): ClientStageResult {
  let textInstruction = instruction
  let combinedIntent: ImageEditIntent | null = null

  const parts = instruction
    .split(/\s+(?:ve|and)\s+/i)
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length === 2) {
    const [a, b] = parts
    const aImg = hasImageMention(a)
    const bImg = hasImageMention(b)
    const imageClause = aImg && !bImg ? a : bImg && !aImg ? b : null
    if (imageClause) {
      const intent = detectImageEditIntent(imageClause, site)
      if (intent) {
        combinedIntent = intent
        textInstruction = imageClause === a ? b : a
      }
    }
  }
  if (combinedIntent && !textInstruction) {
    return { stage: 'image', intent: combinedIntent, textInstruction: null }
  }
  if (!combinedIntent) {
    const intent = detectImageEditIntent(instruction, site)
    if (intent) return { stage: 'image', intent, textInstruction: null }
  }

  try {
    const parsed = parseCommand(textInstruction, site)
    if (parsed && parsed.operations.length > 0) {
      const next = parsed.operations.reduce((acc, op) => applyOperation(acc, op), site)
      const valid = websiteSchema.safeParse(next)
      if (valid.success) {
        const same = JSON.stringify(valid.data) === JSON.stringify(site)
        return {
          stage: 'parser',
          source: same ? 'parser-noop' : 'parser-applied',
          schema: valid.data,
          feedback: parsed.feedback,
        }
      }
    } else if (parsed && !combinedIntent) {
      return { stage: 'parser', source: 'parser-empty', schema: site, feedback: parsed.feedback }
    }
  } catch {
    // The real client also swallows parser exceptions and continues to the API.
  }
  return { stage: 'api', textInstruction }
}
