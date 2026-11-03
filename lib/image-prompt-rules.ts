import { wordIncludes } from '@/lib/visual-subjects'

/**
 * Single source of truth for the rules appended to EVERY photographic image
 * prompt (hero, slider, section, team, product studio). Fast diffusion models
 * happily paint headlines, captions and camera/EXIF strings ("f/5.6, 1/160s,
 * ISO 400") into a "photograph", which then collides with the real HTML text we
 * overlay. These rules are the first line of defence; `image-text-guard.ts` is
 * the second (a cheap vision check + one retry).
 *
 * The rules have two independent halves:
 *  - the TEXT ban, which applies in EVERY case (photo or illustration), and
 *  - the STYLE restriction ("a photograph", no illustration / CGI / 3D render),
 *    which can be lifted for sites that genuinely need drawn artwork
 *    (children's books, explicitly illustrated brands).
 *
 * Logos are exempt from both halves: they legitimately contain a wordmark and
 * are generated with `allowText: true` (see `image-provider.ts`).
 */

export const FIXED_IMAGE_NEGATIVE_TERMS =
  'no text, no letters, no numbers, no words, no typography, no logos, no watermarks, no signage'

const FINAL_IMAGE_NEGATIVE_RULE = `Final negative rule: ${FIXED_IMAGE_NEGATIVE_TERMS}.`

const TEXT_BAN =
  `absolutely NO text of any kind: ${FIXED_IMAGE_NEGATIVE_TERMS}; no captions, headlines, slogans, signatures, shop-sign lettering, label or screen text, camera or EXIF information, lens or exposure settings (f-stop, shutter speed, ISO), timestamps, UI elements, borders or frames.`

export const NO_TEXT_RULE = `STRICT RULE: a plain photograph with ${TEXT_BAN}`

/** Same text ban, without forcing the photographic style. */
export const NO_TEXT_RULE_ANY_STYLE = `STRICT RULE: an image with ${TEXT_BAN}`

const NEGATIVE_BASE = 'text overlay, watermark, collage, split image, infographic, poster layout'
const NEGATIVE_STYLE = 'illustration, CGI, 3D render'
const NEGATIVE_QUALITY = 'oversaturated colors, distorted hands, deformed anatomy, blur, low quality'

export const NEGATIVE_RULE = `Avoid: ${NEGATIVE_BASE}, ${NEGATIVE_STYLE}, ${NEGATIVE_QUALITY}.`

/** NEGATIVE_RULE without the visual-STYLE restriction. */
export const NEGATIVE_RULE_ANY_STYLE = `Avoid: ${NEGATIVE_BASE}, ${NEGATIVE_QUALITY}.`

/** Rules for scene/hero/section/team photos. */
export const IMAGE_PROMPT_RULES = `${NO_TEXT_RULE} ${NEGATIVE_RULE} ${FINAL_IMAGE_NEGATIVE_RULE}`

/** Rules for sectors/requests that need drawn artwork; the text ban is unchanged. */
export const IMAGE_PROMPT_RULES_ANY_STYLE = `${NO_TEXT_RULE_ANY_STYLE} ${NEGATIVE_RULE_ANY_STYLE} ${FINAL_IMAGE_NEGATIVE_RULE}`

/**
 * Rules for product-photo edits: the product's OWN printed markings are part of
 * the product and must survive, everything else must stay text-free.
 */
export const PRODUCT_EDIT_NO_TEXT_RULE =
  `STRICT RULE: no letters, words, numbers, captions, logos, watermarks, signage, camera or EXIF information anywhere in the scene or background. The ONLY exception is markings already printed on the product in the reference photo, which stay exactly as they are. The final negative terms apply only to newly generated scene/background elements, not the unchanged reference product: ${FIXED_IMAGE_NEGATIVE_TERMS}.`

/** The text ban is always included; only the style half is optional. */
export function imagePromptRules(allowIllustration = false): string {
  return allowIllustration ? IMAGE_PROMPT_RULES_ANY_STYLE : IMAGE_PROMPT_RULES
}

/**
 * Explicit illustration signals only. Bare words such as "çizim" are left out
 * on purpose: an architecture or engineering brief ("çizim ve proje hizmetleri")
 * must keep its photographic hero. Kindergartens and toy shops stay photographic
 * by default too — a playroom photo satisfies the rules — unless the request
 * itself asks for an illustrated look.
 */
const ILLUSTRATION_KEYS = [
  'illustrasyon',
  'illustration',
  'illustrated',
  'cizgi film',
  'cartoon',
  'storybook',
  'hikaye kitabi',
  'masal kitabi',
  'cocuk kitabi',
  'cocuk kitaplari',
  "children's book",
  'childrens book',
  'picture book',
  'el cizimi',
  'cizim tarzi',
  'cizim stili',
]

export function wantsIllustrationStyle(text: string): boolean {
  return ILLUSTRATION_KEYS.some((key) => wordIncludes(text, key))
}

export function hasImagePromptRules(prompt: string): boolean {
  return (
    prompt.includes(NO_TEXT_RULE) ||
    prompt.includes(NO_TEXT_RULE_ANY_STYLE) ||
    prompt.includes(PRODUCT_EDIT_NO_TEXT_RULE)
  )
}

/** Idempotent: a prompt that already carries the rules is returned unchanged. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function withTerminalNegativeRule(prompt: string, rule: string): string {
  const cleaned = prompt
    .replace(new RegExp(`\\s*${escapeRegExp(FINAL_IMAGE_NEGATIVE_RULE)}\\s*`, 'gi'), ' ')
    .replace(new RegExp(`\\s*${escapeRegExp(PRODUCT_EDIT_NO_TEXT_RULE)}\\s*`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return [cleaned, rule].filter(Boolean).join(' ')
}

export function withImagePromptRules(prompt: string, allowIllustration = false): string {
  const base = prompt.replace(/\s+/g, ' ').trim()
  const includesProductEditRules = base.includes(PRODUCT_EDIT_NO_TEXT_RULE)
  const withRules = hasImagePromptRules(base)
    ? base
    : [base, imagePromptRules(allowIllustration)].filter(Boolean).join(' ')
  return withTerminalNegativeRule(
    withRules,
    includesProductEditRules ? PRODUCT_EDIT_NO_TEXT_RULE : FINAL_IMAGE_NEGATIVE_RULE,
  )
}

export function stripBrandNameFromImagePrompt(prompt: string, brandName?: string): string {
  const name = brandName?.trim()
  if (!name) return prompt

  const escapedName = name.split(/\s+/).map(escapeRegExp).join('\\s+')
  const matcher = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedName}(?=$|[^\\p{L}\\p{N}])`, 'giu')
  return prompt
    .replace(matcher, '$1')
    .replace(/[“”‘’"']\s*[“”‘’"']/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim()
}
