/**
 * Tiny, safe markup for owner-edited legal texts.
 *
 *   ## Heading        -> heading
 *   - item            -> bullet list item
 *   **bold**          -> bold run
 *   [text](https://x) -> link (http/https/mailto/tel/same-site only)
 *   (blank line)      -> paragraph break
 *
 * Raw HTML is never stored or rendered: `sanitizeLegalMarkup` strips every tag
 * (and script/style bodies) on save, and the parsed blocks are rendered as
 * React text nodes, so no input can inject markup or script.
 */

export const LEGAL_BODY_MAX = 40000

export type LegalInline = { text: string; bold: boolean; href?: string }
export type LegalBlock =
  | { type: 'heading'; inline: LegalInline[] }
  | { type: 'paragraph'; inline: LegalInline[] }
  | { type: 'list'; items: LegalInline[][] }

export function sanitizeLegalMarkup(raw: string): string {
  let text = String(raw ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/<\s*(script|style)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '')
    .replace(/<[a-z/!?][^>]*>?/gi, '')
    .replace(/[<>]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
  text = text
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.slice(0, LEGAL_BODY_MAX)
}

/** Only web, mail, phone and same-site links survive; anything else is plain text. */
export function isSafeLegalHref(href: string): boolean {
  const h = href.trim()
  // A backslash is rejected because browsers read "/\evil.com" as "//evil.com".
  if (!h || /[\s\u0000-\u001F\\]/.test(h)) return false
  if (h.startsWith('/') && !h.startsWith('//')) return true
  return /^(https?:\/\/[^\s/]+|mailto:[^\s@]+@[^\s@]+|tel:\+?[\d\s()-]+)/i.test(h)
}

const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g

function splitLinks(text: string, bold: boolean): LegalInline[] {
  const runs: LegalInline[] = []
  let last = 0
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0
    if (start > last) runs.push({ text: text.slice(last, start), bold })
    if (isSafeLegalHref(m[2])) runs.push({ text: m[1], bold, href: m[2].trim() })
    else runs.push({ text: m[1], bold })
    last = start + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), bold })
  return runs
}

export function parseInline(text: string): LegalInline[] {
  return text
    .split('**')
    .flatMap((part, i) => splitLinks(part, i % 2 === 1))
    .filter((r) => r.text !== '')
}

export function parseLegalMarkup(markup: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  let para: string[] = []
  let list: LegalInline[][] = []

  const flushPara = () => {
    if (para.length) blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list.length) blocks.push({ type: 'list', items: list })
    list = []
  }

  for (const rawLine of sanitizeLegalMarkup(markup).split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flushPara()
      flushList()
    } else if (line.startsWith('## ')) {
      flushPara()
      flushList()
      blocks.push({ type: 'heading', inline: parseInline(line.slice(3)) })
    } else if (line.startsWith('- ')) {
      flushPara()
      list.push(parseInline(line.slice(2)))
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks
}

export type MarkupDoc = { sections: { heading: string; paragraphs: string[] }[] }

/** Template document -> editable markup (the editor's starting text). */
export function docToMarkup(doc: MarkupDoc): string {
  return doc.sections
    .map((s) => [`## ${s.heading}`, ...s.paragraphs].join('\n\n'))
    .join('\n\n')
}

export function docToBlocks(doc: MarkupDoc): LegalBlock[] {
  return parseLegalMarkup(docToMarkup(doc))
}
