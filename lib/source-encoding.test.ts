import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'content', 'scripts', 'supabase', 'types']
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.mdx', '.sql', '.css'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])

const REPLACEMENT_CHAR = '\uFFFD'
// Classic UTF-8 -> Latin-1 mojibake sequences (e.g. "Ã¼", "Ä±", "ÅŸ", "â€™").
const MOJIBAKE = /Ã[\u0080-\u00BF]|Ä[±\u009F°]|Å[\u009E\u009F]|â€/

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (TEXT_EXT.has(path.extname(name))) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => f !== __filename)

describe('source encoding', () => {
  it('scans a meaningful number of files', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('contains no U+FFFD replacement characters', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (line.includes(REPLACEMENT_CHAR)) {
          offenders.push(`${path.relative(ROOT, file)}:${i + 1}`)
        }
      })
    }
    expect(offenders).toEqual([])
  })

  it('contains no UTF-8 mojibake sequences', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (MOJIBAKE.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
