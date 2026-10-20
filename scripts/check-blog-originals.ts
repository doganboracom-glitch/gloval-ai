import { originalPosts } from './blog-originals'

const allowedInternalPaths = new Set(['/blog', '/blog/yapay-zeka-ile-urun-aciklamasi-yazma'])
const categories = ['ai', 'web-design', 'seo', 'marketing', 'ecommerce', 'gloval', 'guides']
const linkPattern = /\]\((\/[^)\s]+)\)/g

const wordCount = (body: string) => body.replace(/[#*\[\]()]/g, ' ').trim().split(/\s+/).filter(Boolean).length

const sentencesOf = (body: string) =>
  body
    .split('\n')
    .filter((line) => !line.startsWith('#'))
    .flatMap((line) => line.replace(/^(- |> )/, '').split(/(?<=[.!?])\s+/))
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.split(/\s+/).length >= 6)

const problems: string[] = []
const slugs = new Set<string>()
const sentenceOwners = new Map<string, Set<string>>()

for (const post of originalPosts) {
  if (slugs.has(post.slug)) problems.push(`${post.slug}: duplicate slug`)
  slugs.add(post.slug)
  if (!categories.includes(post.category)) problems.push(`${post.slug}: invalid category`)
  const words = wordCount(post.body)
  if (words < 800 || words > 1200) problems.push(`${post.slug}: ${words} words (need 800-1200)`)
  if (/^##\s+##/m.test(post.body)) problems.push(`${post.slug}: doubled heading marker`)
  if (/e-ticaret işletmesi için/i.test(post.body) && post.category !== 'ecommerce') problems.push(`${post.slug}: stray template phrase`)
  for (const m of post.body.matchAll(linkPattern)) {
    if (!allowedInternalPaths.has(m[1])) problems.push(`${post.slug}: invalid internal link ${m[1]}`)
  }
  for (const s of new Set(sentencesOf(post.body))) {
    if (!sentenceOwners.has(s)) sentenceOwners.set(s, new Set())
    sentenceOwners.get(s)!.add(post.slug)
  }
}

let repeatedPerPost = new Map<string, number>()
let totals = new Map<string, number>()
for (const post of originalPosts) totals.set(post.slug, new Set(sentencesOf(post.body)).size)
for (const [sentence, owners] of sentenceOwners) {
  if (owners.size > 1) {
    for (const slug of owners) repeatedPerPost.set(slug, (repeatedPerPost.get(slug) ?? 0) + 1)
    if (owners.size > 2) problems.push(`sentence in ${owners.size} posts: "${sentence.slice(0, 90)}"`)
  }
}
for (const post of originalPosts) {
  const share = (repeatedPerPost.get(post.slug) ?? 0) / (totals.get(post.slug) || 1)
  if (share > 0.05) problems.push(`${post.slug}: ${(share * 100).toFixed(1)}% of sentences are shared with other posts`)
}

const wordStats = originalPosts.map((p) => wordCount(p.body))
console.log(JSON.stringify({ posts: originalPosts.length, minWords: Math.min(...wordStats), maxWords: Math.max(...wordStats), problems: problems.length }))
for (const p of problems) console.log(' -', p)
if (problems.length || originalPosts.length !== 30) process.exit(1)
