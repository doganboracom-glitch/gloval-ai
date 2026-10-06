import type { Metadata } from 'next'
import { BlogListClient } from '@/components/content/blog-list-client'

export const metadata: Metadata = {
  title: 'Blog | GLOVAL AI',
  description:
    'GLOVAL AI ve dijital dünya hakkında güncel içerikler: yapay zeka ile web sitesi oluşturma, SEO, alan adı, kurumsal e-posta ve e-ticaret rehberleri.',
  alternates: { canonical: '/blog' },
  openGraph: {
    type: 'website',
    url: '/blog',
    title: 'Blog | GLOVAL AI',
    description:
      'GLOVAL AI ve dijital dünya hakkında güncel, faydalı ve SEO odaklı içerikler.',
  },
}

export default function BlogPage() {
  return <BlogListClient />
}
