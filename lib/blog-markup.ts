import { LEGAL_BODY_MAX, isSafeLegalHref, sanitizeLegalMarkup } from './legal-markup'
import type { BlogBlock } from './content/types'

/**
 * Markup for platform blog posts. A superset of the owner legal markup:
 *
 *   ## Heading / ### Subheading
 *   - item                      bullet list
 *   > quote                     block quote (consecutive lines join)
 *   ![alt](https://…/img.png)   image on its own line (https or same-site only)
 *   **bold**  *italic*  [text](https://x)
 *   (blank line)                paragraph break
 *
 * Raw HTML is stripped on save by `sanitizeLegalMarkup` and the parsed blocks
 * are rendered as React nodes, so no input can inject markup or script.
 */

export const BLOG_BODY_MAX = LEGAL_BODY_MAX

export type BlogInline = { text: string; bold: boolean; italic: boolean; href?: string }
export type BlogMdBlock =
  | { type: 'heading'; level: 2 | 3; inline: BlogInline[] }
  | { type: 'paragraph'; inline: BlogInline[] }
  | { type: 'list'; items: BlogInline[][] }
  | { type: 'quote'; inline: BlogInline[] }
  | { type: 'image'; src: string; alt: string }

export function sanitizeBlogMarkup(raw: string): string {
  return sanitizeLegalMarkup(raw)
}

const INLINE_RE = /\*\*([^*]+)\*\*|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)\s]+)\)/g

export function parseBlogInline(text: string): BlogInline[] {
  const runs: BlogInline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const start = m.index ?? 0
    if (start > last) runs.push({ text: text.slice(last, start), bold: false, italic: false })
    if (m[1] !== undefined) runs.push({ text: m[1], bold: true, italic: false })
    else if (m[2] !== undefined) runs.push({ text: m[2], bold: false, italic: true })
    else if (isSafeLegalHref(m[4])) runs.push({ text: m[3], bold: false, italic: false, href: m[4].trim() })
    else runs.push({ text: m[3], bold: false, italic: false })
    last = start + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold: false, italic: false })
  return runs.filter((r) => r.text !== '')
}

/** Only https or same-site image sources are rendered. */
export function isSafeImageSrc(src: string): boolean {
  const s = src.trim()
  if (!s || /[\s\u0000-\u001F\\]/.test(s)) return false
  if (s.startsWith('/') && !s.startsWith('//')) return true
  return /^https:\/\/[^\s/]+/i.test(s)
}

const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/

export function parseBlogMarkup(markup: string): BlogMdBlock[] {
  const blocks: BlogMdBlock[] = []
  let para: string[] = []
  let quote: string[] = []
  let list: BlogInline[][] = []

  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', inline: parseBlogInline(para.join(' ')) })
    if (quote.length) blocks.push({ type: 'quote', inline: parseBlogInline(quote.join(' ')) })
    if (list.length) blocks.push({ type: 'list', items: list })
    para = []
    quote = []
    list = []
  }

  for (const rawLine of sanitizeBlogMarkup(markup).split('\n')) {
    const line = rawLine.trim()
    const image = IMAGE_LINE_RE.exec(line)
    if (!line) {
      flush()
    } else if (line.startsWith('### ')) {
      flush()
      blocks.push({ type: 'heading', level: 3, inline: parseBlogInline(line.slice(4)) })
    } else if (line.startsWith('## ')) {
      flush()
      blocks.push({ type: 'heading', level: 2, inline: parseBlogInline(line.slice(3)) })
    } else if (image && isSafeImageSrc(image[2])) {
      flush()
      blocks.push({ type: 'image', src: image[2].trim(), alt: image[1].trim() })
    } else if (line.startsWith('- ')) {
      if (para.length || quote.length) flush()
      list.push(parseBlogInline(line.slice(2)))
    } else if (line.startsWith('> ')) {
      if (para.length || list.length) flush()
      quote.push(line.slice(2))
    } else {
      if (quote.length || list.length) flush()
      para.push(line)
    }
  }
  flush()
  return blocks
}

/** Markup stripped to plain words, for reading time and search. */
export function markupToPlainText(markup: string): string {
  return sanitizeBlogMarkup(markup)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^(#{2,3} |- |> )/gm, '')
    .replace(/\*\*?/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function readingTimeMinutes(markup: string): number {
  const words = markupToPlainText(markup).split(' ').filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

/** Static fallback blocks → markup, so one renderer serves both sources. */
export function blocksToMarkup(blocks: BlogBlock[], lang: 'tr' | 'en'): string {
  return blocks
    .map((block) => {
      if (block.type === 'heading') return `## ${block.text[lang] ?? block.text.en}`
      if (block.type === 'list') return (block.items[lang] ?? block.items.en).map((i) => `- ${i}`).join('\n')
      return block.text[lang] ?? block.text.en
    })
    .join('\n\n')
}
