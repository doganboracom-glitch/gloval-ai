/**
 * Tiny, safe markup for owner-edited legal texts.
 *
 *   ## Heading        -> heading
 *   - item            -> bullet list item
 *   **bold**          -> bold run
 *   (blank line)      -> paragraph break
 *
 * Raw HTML is never stored or rendered: `sanitizeLegalMarkup` strips every tag
 * (and script/style bodies) on save, and the parsed blocks are rendered as
 * React text nodes, so no input can inject markup or script.
 */

export const LEGAL_BODY_MAX = 40000

export type LegalInline = { text: string; bold: boolean }
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

export function parseInline(text: string): LegalInline[] {
  return text
    .split('**')
    .map((part, i) => ({ text: part, bold: i % 2 === 1 }))
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
