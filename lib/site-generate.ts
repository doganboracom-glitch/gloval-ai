import { websiteGenerationSchema, type WebsiteSchema } from '@/lib/website-schema'
import { buildSiteGenerateSystem } from '@/lib/site-generate-prompt'
import { siteNameFromPrompt, siteRepairOptions } from '@/lib/site-repair'
import { deriveSeoTitle, detectSector, isEcommerceIntent } from '@/lib/sector-profiles'
import { stripInventedStoreSections } from '@/lib/corporate-products'
import { capPagesToLimit } from '@/lib/page-limits'
import { sanitizeGeneratedProofContent } from '@/lib/proof-content'
import type { AiModelSelection } from '@/lib/ai-models'
import { generateStructured, type GenerateFn, type StructuredResult } from '@/lib/ai-structured'

export type SiteGenerateRequest = {
  ai: AiModelSelection
  prompt: string
  lang: 'tr' | 'en'
  pageLimit: number
  abortSignal?: AbortSignal
  /** Test seam; production never sets it. */
  generate?: GenerateFn
}

/**
 * The text-generation half of `/api/generate` in website mode, shared by the
 * route and by `scripts/ai-model-compare.ts` so the benchmark runs exactly what
 * production runs: model call, repair, one retry, page cap and SEO title.
 * Image attachment and the deterministic post-processing (contact section,
 * footer links, ...) happen in the route afterwards and cannot fail the model
 * result. Throws `StructuredGenerationError` when the AI path gives up.
 */
export async function generateSiteObject(
  request: SiteGenerateRequest,
): Promise<StructuredResult<WebsiteSchema> & { site: WebsiteSchema }> {
  const { ai, prompt, lang, pageLimit } = request
  const result = await generateStructured({
    ai,
    schema: websiteGenerationSchema,
    system: buildSiteGenerateSystem(prompt, lang, pageLimit),
    prompt: prompt.slice(0, 800),
    abortSignal: request.abortSignal,
    generate: request.generate,
    repair: siteRepairOptions({ lang, siteName: siteNameFromPrompt(prompt), trimSections: true }),
  })

  // The prompt asks for at most `pageLimit` pages, but the model can still
  // overshoot; hard-cap the generated site so it never exceeds the plan.
  const capped = sanitizeGeneratedProofContent(capPagesToLimit(result.object as WebsiteSchema, pageLimit))
  // A brief that did not ask for an online store never gets invented products.
  const site = isEcommerceIntent(prompt) ? capped : stripInventedStoreSections(capped)

  // A skipped or blank SEO title falls back to the deterministic keyword
  // derivation so a new site is never published without one.
  if (!site.meta.seoTitle?.trim()) {
    site.meta.seoTitle = deriveSeoTitle(prompt, detectSector(prompt), lang)
  }
  return { ...result, site }
}
