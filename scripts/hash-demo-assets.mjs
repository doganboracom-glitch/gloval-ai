#!/usr/bin/env node
/**
 * Content-hash the demo images under `public/demos` and rewrite every
 * reference to them.
 *
 * Why: demo images are served with a long browser cache. If an image is
 * replaced under the SAME url, browsers keep showing the old bytes. Every file
 * is therefore named `<name>.<sha256-8>.webp`, so changing the content changes
 * the url.
 *
 * Workflow when you replace or add a demo image:
 *   1. Drop the new file in `public/demos/...` (any name, hashed or not).
 *   2. Run `node scripts/hash-demo-assets.mjs`.
 *   3. Commit the renames + rewritten references.
 *
 * `lib/demo-assets.test.ts` fails if a file's hash no longer matches its
 * content or a reference points at a missing file.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const demosDir = join(root, 'public', 'demos')
const HASH_SUFFIX = /\.[0-9a-f]{8}$/
const SOURCE_DIRS = ['app', 'components', 'lib']
const SOURCE_EXT = /\.(ts|tsx|md|mjs)$/

function walk(dir, accept) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full, accept))
    else if (accept(full)) out.push(full)
  }
  return out
}

// logical url (no hash) -> final url
const logicalToFinal = new Map()
for (const file of walk(demosDir, (f) => f.endsWith('.webp'))) {
  const rel = relative(demosDir, file).split('\\').join('/')
  const stem = rel.slice(0, -'.webp'.length).replace(HASH_SUFFIX, '')
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)
  const finalRel = `${stem}.${hash}.webp`
  if (finalRel !== rel) {
    renameSync(file, join(demosDir, finalRel))
    console.log(`renamed  ${rel} -> ${finalRel}`)
  }
  logicalToFinal.set(`/demos/${stem}`, `/demos/${finalRel}`)
}

const REF = /\/demos\/([\w\-/]+?)(?:\.[0-9a-f]{8})?\.webp/g
let rewritten = 0
const unknown = new Set()
const sources = SOURCE_DIRS.flatMap((d) => walk(join(root, d), (f) => SOURCE_EXT.test(f)))
sources.push(join(root, 'README.md'))
for (const file of sources) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(REF, (match, stem) => {
    const next = logicalToFinal.get(`/demos/${stem}`)
    if (!next) {
      unknown.add(match)
      return match
    }
    return next
  })
  if (after !== before) {
    writeFileSync(file, after)
    rewritten++
    console.log(`updated  ${relative(root, file)}`)
  }
}

if (unknown.size) {
  console.error('\nReferences to files that do not exist:')
  for (const u of unknown) console.error(`  ${u}`)
  process.exitCode = 1
}
console.log(`\n${logicalToFinal.size} demo images hashed, ${rewritten} source files rewritten.`)
