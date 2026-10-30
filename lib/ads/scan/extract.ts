import { directivesForbidUse } from './robots'

/**
 * Static HTML -> plain data. No script is ever executed and no DOM library is
 * used: a single linear pass over the tag stream keeps the visible text, the
 * headings, the navigation labels, the links, the title / meta description and the
 * JSON-LD organisation name. Everything that leaves this module has been through
 * `cleanText`, so invisible / bidirectional / control characters (a favourite
 * carrier for hidden prompt-injection text) are gone.
 */

export type PageExtract = {
  language: string | null
  title: string
  description: string
  siteName: string
  organizationNames: string[]
  headings: string[]
  navLabels: string[]
  links: Array<{ href: string; label: string }>
  text: string
  /** The page asked not to be indexed / used (`<meta name="robots" content="noindex">`). */
  noindex: boolean
}

const MAX_RAW_TEXT = 40_000
const MAX_STACK = 512
const MAX_TAG_QUOTE_SCAN = 2048
const MAX_LINKS = 150
const MAX_JSON_LD_BYTES = 200_000

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ccedil: 'ç', Ccedil: 'Ç', ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü',
  gbreve: 'ğ', Gbreve: 'Ğ', scedil: 'ş', Scedil: 'Ş', imath: 'ı', Idot: 'İ',
  eacute: 'é', egrave: 'è', agrave: 'à', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ',
  ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', euro: '€', pound: '£',
}

export function decodeEntities(input: string): string {
  if (!input.includes('&')) return input
  return input.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,10});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return ' '
      return String.fromCodePoint(code)
    }
    return NAMED_ENTITIES[body] ?? match
  })
}

// C0/C1 controls (tab, LF, CR are whitespace and collapse below).
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
// Soft hyphen, combining grapheme joiner, invisible fillers, zero-width and bidi controls, BOM, word joiner.
const INVISIBLE_CHARS =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\uFFF9-\uFFFB]/g
// Unicode "tag" characters and variation selectors supplement: invisible, can encode a whole hidden prompt.
const INVISIBLE_ASTRAL = /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/** Strips control / invisible / bidi characters, collapses whitespace and cuts to `max` without splitting a surrogate pair. */
export function cleanText(input: string, max: number): string {
  const cleaned = input
    .replace(CONTROL_CHARS, ' ')
    .replace(INVISIBLE_CHARS, '')
    .replace(INVISIBLE_ASTRAL, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (cleaned.length <= max) return cleaned
  let cut = cleaned.slice(0, max)
  const last = cut.charCodeAt(cut.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1)
  return cut.trim()
}

const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr',
])
/** Elements whose content is never visible page text. */
const HIDDEN_TAGS = new Set([
  'head', 'noscript', 'template', 'svg', 'iframe', 'object', 'canvas', 'select', 'option', 'math',
])
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure',
  'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre',
  'section', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul', 'button',
])
const ORGANIZATION_TYPES = /^(?:Organization|Corporation|LocalBusiness|Store|WebSite|Restaurant|ProfessionalService|[A-Za-z]*Business|[A-Za-z]*Store)$/

type Attributes = Record<string, string>

function parseAttributes(source: string): Attributes {
  const attributes: Attributes = Object.create(null)
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  let count = 0
  while ((match = pattern.exec(source)) && count < 40) {
    const name = match[1].toLowerCase()
    if (name in attributes) continue
    attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
    count++
  }
  return attributes
}

function isHiddenByAttributes(tag: string, attributes: Attributes): boolean {
  if ('hidden' in attributes) return true
  if (attributes['aria-hidden'] === 'true') return true
  if (tag === 'input' && attributes.type?.toLowerCase() === 'hidden') return true
  const style = attributes.style
  return !!style && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style)
}

function rawEndPattern(tag: string): RegExp {
  return new RegExp(`</${tag}(?=[\\s/>])`, 'gi')
}
const RAW_END: Record<string, RegExp> = {
  script: rawEndPattern('script'),
  style: rawEndPattern('style'),
  title: rawEndPattern('title'),
  textarea: rawEndPattern('textarea'),
}

function organizationNamesFromJsonLd(raw: string): string[] {
  const names: string[] = []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return names
  }
  const visit = (node: unknown, depth: number) => {
    if (depth > 4 || node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 20)) visit(item, depth + 1)
      return
    }
    const record = node as Record<string, unknown>
    const type = record['@type']
    const types = Array.isArray(type) ? type : [type]
    if (typeof record.name === 'string' && types.some((t) => typeof t === 'string' && ORGANIZATION_TYPES.test(t))) {
      names.push(record.name)
    }
    if (Array.isArray(record['@graph'])) visit(record['@graph'], depth + 1)
  }
  visit(data, 0)
  return names
}

export function extractPage(html: string): PageExtract {
  const length = html.length
  const stack: string[] = []
  let hiddenFrom = -1
  let navFrom = -1

  const textParts: string[] = []
  let textLength = 0
  let heading: { name: string; parts: string[] } | null = null
  let link: { href: string; parts: string[]; inNav: boolean } | null = null

  let language: string | null = null
  let title = ''
  let description = ''
  let ogDescription = ''
  let ogTitle = ''
  let siteName = ''
  let noindex = false
  const organizationNames: string[] = []
  const headings: string[] = []
  const navLabels: string[] = []
  const links: Array<{ href: string; label: string }> = []

  const addText = (raw: string) => {
    if (hiddenFrom !== -1 || !raw) return
    const decoded = decodeEntities(raw)
    if (textLength < MAX_RAW_TEXT) {
      textParts.push(decoded)
      textLength += decoded.length
    }
    heading?.parts.push(decoded)
    link?.parts.push(decoded)
  }

  const finishHeading = () => {
    if (!heading) return
    const value = cleanText(heading.parts.join(''), 120)
    heading = null
    if (value && headings.length < 20 && !headings.includes(value)) headings.push(value)
  }
  const finishLink = () => {
    if (!link) return
    const { href, parts, inNav } = link
    link = null
    const label = cleanText(parts.join(''), 80)
    if (links.length < MAX_LINKS) links.push({ href: href.slice(0, 2048), label })
    if (inNav && label && label.length <= 60 && navLabels.length < 20 && !navLabels.includes(label)) {
      navLabels.push(label)
    }
  }

  let nextGt = -1
  const noGt = length + 1

  const findTagEnd = (from: number): number => {
    let quote = 0
    let lastSignificant = 0
    const limit = Math.min(length, from + MAX_TAG_QUOTE_SCAN)
    for (let k = from; k < limit; k++) {
      const c = html.charCodeAt(k)
      if (quote) {
        if (c === quote) quote = 0
        continue
      }
      if ((c === 34 || c === 39) && lastSignificant === 61) {
        quote = c
        lastSignificant = c
        continue
      }
      if (c === 62) return k
      if (c > 32) lastSignificant = c
    }
    return -1
  }

  const skipRaw = (tag: string, from: number, cap: number): { content: string; next: number } => {
    const pattern = RAW_END[tag]
    pattern.lastIndex = from
    const match = pattern.exec(html)
    if (!match) return { content: html.slice(from, from + cap), next: length }
    const close = html.indexOf('>', match.index)
    return { content: html.slice(from, Math.min(match.index, from + cap)), next: close === -1 ? length : close + 1 }
  }

  let i = 0
  let jsonLdScripts = 0
  while (i < length) {
    if (html.charCodeAt(i) !== 60) {
      let end = html.indexOf('<', i)
      if (end === -1) end = length
      addText(html.slice(i, end))
      i = end
      continue
    }

    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4)
      i = end === -1 ? length : end + 3
      continue
    }
    const next = html[i + 1]
    if (next === '!' || next === '?') {
      const end = html.indexOf('>', i)
      i = end === -1 ? length : end + 1
      continue
    }

    const head = /^(\/?)([a-zA-Z][a-zA-Z0-9:-]{0,40})/.exec(html.slice(i + 1, i + 44))
    if (!head) {
      addText('<')
      i++
      continue
    }

    let end = findTagEnd(i + 1)
    if (end === -1) {
      if (nextGt < i) {
        const found = html.indexOf('>', i)
        nextGt = found === -1 ? noGt : found
      }
      end = nextGt === noGt ? -1 : nextGt
    }
    if (end === -1) {
      addText(html.slice(i))
      break
    }

    const closing = head[1] === '/'
    const name = head[2].toLowerCase()
    const attributeSource = html.slice(i + 1 + head[0].length, end)
    i = end + 1

    if (closing) {
      const index = stack.lastIndexOf(name)
      if (index !== -1) {
        const popped = stack.slice(index)
        if (popped.includes('a')) finishLink()
        if (heading && popped.includes(heading.name)) finishHeading()
        stack.length = index
        if (hiddenFrom !== -1 && stack.length <= hiddenFrom) hiddenFrom = -1
        if (navFrom !== -1 && stack.length <= navFrom) navFrom = -1
      }
      if (BLOCK_TAGS.has(name)) addText(' ')
      continue
    }

    const attributes = parseAttributes(attributeSource)

    if (name === 'html') {
      const lang = attributes.lang?.trim().toLowerCase()
      if (lang && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(lang)) language = lang.split('-')[0]
    } else if (name === 'meta') {
      const key = (attributes.name ?? attributes.property ?? '').toLowerCase()
      const content = attributes.content ?? ''
      if (key === 'description' && !description) description = content
      else if (key === 'og:description' && !ogDescription) ogDescription = content
      else if (key === 'og:title' && !ogTitle) ogTitle = content
      else if (key === 'og:site_name' && !siteName) siteName = content
      else if (key === 'robots' || key === 'glovaladsbot') {
        const tokens = content.toLowerCase().split(',').map((token) => token.trim())
        if (directivesForbidUse(tokens)) noindex = true
      }
    }

    if (name === 'script') {
      const isJsonLd = /ld\+json/i.test(attributes.type ?? '')
      const raw = skipRaw('script', i, isJsonLd ? MAX_JSON_LD_BYTES : 0)
      i = raw.next
      if (isJsonLd && jsonLdScripts < 5 && raw.content.length < MAX_JSON_LD_BYTES) {
        jsonLdScripts++
        organizationNames.push(...organizationNamesFromJsonLd(raw.content))
      }
      continue
    }
    if (name === 'style' || name === 'textarea') {
      i = skipRaw(name, i, 0).next
      continue
    }
    if (name === 'title') {
      const raw = skipRaw('title', i, 1000)
      i = raw.next
      if (!title && !stack.includes('svg')) title = decodeEntities(raw.content)
      continue
    }

    if (VOID_TAGS.has(name)) {
      if (BLOCK_TAGS.has(name)) addText(' ')
      continue
    }

    if (stack.length >= MAX_STACK) break

    const hidden = HIDDEN_TAGS.has(name) || isHiddenByAttributes(name, attributes)
    if (hidden && hiddenFrom === -1) hiddenFrom = stack.length
    const visible = hiddenFrom === -1

    if (visible) {
      if ((name === 'nav' || name === 'header') && navFrom === -1) navFrom = stack.length
      if (name === 'h1' || name === 'h2') {
        finishHeading()
        heading = { name, parts: [] }
      }
      if (name === 'a' && attributes.href) {
        finishLink()
        link = { href: attributes.href, parts: [], inNav: navFrom !== -1 }
      }
    }
    stack.push(name)
    if (BLOCK_TAGS.has(name)) addText(' ')
  }
  finishLink()
  finishHeading()

  const cleanedOrganizations = [...new Set(organizationNames.map((n) => cleanText(n, 120)).filter(Boolean))].slice(0, 3)

  return {
    language,
    title: cleanText(title || ogTitle, 160),
    description: cleanText(description || ogDescription, 300),
    siteName: cleanText(siteName, 80),
    organizationNames: cleanedOrganizations,
    headings,
    navLabels,
    links,
    text: cleanText(textParts.join(''), MAX_RAW_TEXT),
    noindex,
  }
}
