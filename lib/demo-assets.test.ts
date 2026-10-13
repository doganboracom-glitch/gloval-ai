import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { demoImages } from '@/lib/demo-images'

const root = process.cwd()
const demosDir = join(root, 'public', 'demos')
const HASHED = /^(.+)\.([0-9a-f]{8})\.webp$/

function walk(dir: string, accept: (f: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, accept))
    else if (accept(full)) out.push(full)
  }
  return out
}

const imageFiles = walk(demosDir, (f) => f.endsWith('.webp'))

describe('demo image assets', () => {
  it('every demo image carries the sha256 prefix of its own content', () => {
    const stale = imageFiles.filter((file) => {
      const match = HASHED.exec(file.split('/').pop()!)
      if (!match) return true
      const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)
      return match[2] !== hash
    })
    // Fix with: node scripts/hash-demo-assets.mjs
    expect(stale.map((f) => relative(root, f))).toEqual([])
  })

  it('every /demos/*.webp reference in source points at an existing file', () => {
    const sources = ['app', 'components', 'lib'].flatMap((d) =>
      walk(join(root, d), (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.test.ts')),
    )
    const broken: string[] = []
    let refs = 0
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\/demos\/[\w\-/.]+?\.webp/g)) {
        refs++
        if (!existsSync(join(root, 'public', m[0]))) broken.push(`${relative(root, file)}: ${m[0]}`)
      }
    }
    expect(refs).toBeGreaterThan(50)
    expect(broken).toEqual([])
  })

  it('every image in the demo image map exists on disk', () => {
    const urls = Object.values(demoImages).flatMap((set) =>
      Object.values(set).flatMap((v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v : [])),
    )
    expect(urls.length).toBeGreaterThan(20)
    const missing = urls.filter((u) => u.startsWith('/demos/') && !existsSync(join(root, 'public', u)))
    expect(missing).toEqual([])
  })

  it('the e-commerce slider slides are wide images, not the old 1024x1024 squares', () => {
    const slides = demoImages.eticaret.slides ?? []
    expect(slides).toHaveLength(3)
    for (const url of slides) {
      const buf = readFileSync(join(root, 'public', url))
      // VP8 lossy: 14-bit width/height at bytes 26..29 of the RIFF container.
      const width = buf.readUInt16LE(26) & 0x3fff
      const height = buf.readUInt16LE(28) & 0x3fff
      expect(width / height).toBeGreaterThan(1.7)
    }
  })
})
