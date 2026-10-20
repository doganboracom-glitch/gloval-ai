import { createHash } from 'node:crypto'
import { approvedPosts } from './platform-blog-approved'
import { validateApprovedPost } from './import-platform-blog-approved'
import { blocksToMarkup } from '../lib/blog-markup'
for (const p of approvedPosts) {
  validateApprovedPost(p)
  const b = blocksToMarkup(p.body, 'tr')
  const w = b.replace(/[#*\[\]()]/g, ' ').trim().split(/\s+/).filter(Boolean).length
  console.log(p.slug, p.category, w, createHash('md5').update(b).digest('hex'), p.title.tr)
}
