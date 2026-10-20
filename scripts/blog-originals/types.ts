export type OriginalPost = {
  slug: string
  title: string
  excerpt: string
  category: 'ai' | 'web-design' | 'seo' | 'marketing' | 'ecommerce' | 'gloval' | 'guides'
  seoTitle: string
  seoDescription: string
  tags: string[]
  /** Blog markup: `## Heading`, `- item`, `> quote`, `**bold**`, blank-line paragraphs. */
  body: string
}
