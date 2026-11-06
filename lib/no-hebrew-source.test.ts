import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')
const SCAN_DIRS = ['app', 'components', 'lib', 'content', 'hooks', 'scripts', 'types']
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.md', '.mdx', '.css'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git'])
const HEBREW = /[\u0590-\u05FF]/

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
    if (statSync(full).isDirectory()) walk(full, out)
    else if (TEXT_EXT.has(path.extname(name))) out.push(full)
  }
  return out
}

describe('source language', () => {
  it('contains no Hebrew characters in source folders', () => {
    const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)))
    expect(files.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (HEBREW.test(line)) offenders.push(`${path.relative(ROOT, file)}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
