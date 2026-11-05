import { z } from 'zod'
import { cleanText } from '@/lib/ads/scan/extract'
import type { SiteSnapshot } from '@/lib/ads/scan/scan-site'

function manualText(max: number, required: boolean) {
  return z
    .string()
    .max(max)
    .transform((value) => cleanText(value, max))
    .refine((value) => !required || value.length > 0)
}

export const manualPlanSchema = z.object({
  businessName: manualText(80, true),
  industry: manualText(80, true),
  services: manualText(500, true),
  location: manualText(120, false).optional().default(''),
  language: z.enum(['tr', 'en']),
})

export type ManualPlanInput = z.infer<typeof manualPlanSchema>

export function buildManualSnapshot(host: string, input: ManualPlanInput): SiteSnapshot {
  const businessName = cleanText(input.businessName, 80)
  const industry = cleanText(input.industry, 80)
  const services = cleanText(input.services, 500)
  const location = cleanText(input.location, 120)
  const serviceHeadings = services
    .split(/[;,|]/)
    .map((service) => cleanText(service, 80))
    .filter(Boolean)
    .slice(0, 7)
  const text = [
    `Business name: ${businessName}`,
    `Industry: ${industry}`,
    `Products or services: ${services}`,
    location ? `Service area: ${location}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return {
    host,
    finalHost: host,
    language: input.language,
    title: businessName,
    description: cleanText(`${industry}. ${services}`, 400),
    siteName: businessName,
    organizationNames: [businessName],
    headings: [industry, ...serviceHeadings].slice(0, 8),
    navLabels: [],
    text: cleanText(text, 1600),
    pages: [{ path: '/', title: 'Business details provided by the user' }],
  }
}
