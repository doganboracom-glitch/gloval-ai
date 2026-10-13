/**
 * Single source of truth for the rules appended to EVERY photographic image
 * prompt (hero, slider, section, team, product studio). Fast diffusion models
 * happily paint headlines, captions and camera/EXIF strings ("f/5.6, 1/160s,
 * ISO 400") into a "photograph", which then collides with the real HTML text we
 * overlay. These rules are the first line of defence; `image-text-guard.ts` is
 * the second (a cheap vision check + one retry).
 */

export const NO_TEXT_RULE =
  'STRICT RULE: a plain photograph with absolutely NO text of any kind: no letters, words, numbers, captions, headlines, typography, slogans, logos, watermarks, signatures, signage or shop-sign lettering, label or screen text, camera or EXIF information, lens or exposure settings (f-stop, shutter speed, ISO), timestamps, UI elements, borders or frames.'

export const NEGATIVE_RULE =
  'Avoid: text overlay, watermark, collage, split image, infographic, poster layout, illustration, CGI, 3D render, oversaturated colors, distorted hands, deformed anatomy, blur, low quality.'

/** Rules for scene/hero/section/team photos. */
export const IMAGE_PROMPT_RULES = `${NO_TEXT_RULE} ${NEGATIVE_RULE}`

/**
 * Rules for product-photo edits: the product's OWN printed markings are part of
 * the product and must survive, everything else must stay text-free.
 */
export const PRODUCT_EDIT_NO_TEXT_RULE =
  'STRICT RULE: no letters, words, numbers, captions, logos, watermarks, signage, camera or EXIF information anywhere in the scene or background. The ONLY exception is markings already printed on the product in the reference photo, which stay exactly as they are.'

export function hasImagePromptRules(prompt: string): boolean {
  return prompt.includes(NO_TEXT_RULE) || prompt.includes(PRODUCT_EDIT_NO_TEXT_RULE)
}

/** Idempotent: a prompt that already carries the rules is returned unchanged. */
export function withImagePromptRules(prompt: string): string {
  const base = prompt.replace(/\s+/g, ' ').trim()
  return hasImagePromptRules(base) ? base : `${base} ${IMAGE_PROMPT_RULES}`
}
