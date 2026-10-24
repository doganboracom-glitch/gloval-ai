import { z } from 'zod'
import { websiteSchema } from '@/lib/website-schema'
import { createClient } from '@/lib/supabase/server'
import { AI_ACTION_COSTS, consumeCredits, getCreditBalance } from '@/lib/ai-credits'
import { getPlanCodeForUser } from '@/lib/billing'
import { toPlanCode } from '@/lib/pricing-config'
import { checkFreeDailyActionLimit, freeDailyLimitResponseBody } from '@/lib/free-daily-limit'
import { resolveAiModel } from '@/lib/ai-models'
import { generateStructured } from '@/lib/ai-structured'
import { detectSector } from '@/lib/sector-profiles'
import { sectorNoun, suggestAboutAlt } from '@/lib/about-media'

export const maxDuration = 60

const altSchema = z.object({ alt: z.string().min(8).max(140) })

/**
 * POST /api/about-alt
 * Suggests a meaningful alt text for an about image from the business name and
 * sector. Charged at the existing text-edit price, only when a suggestion is
 * returned. On model failure the deterministic suggestion is returned for free.
 */
export async function POST(req: Request) {
  const { schema, index, imageIndex } = (await req.json().catch(() => ({}))) as {
    schema?: unknown
    index?: number
    imageIndex?: number
  }
  const parsed = websiteSchema.safeParse(schema)
  if (!parsed.success || typeof index !== 'number') {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  const site = parsed.data
  const section = site.sections[index]
  if (!section || section.type !== 'about') {
    return Response.json({ error: 'Not an about section' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = userData.user.id

  const planCode = toPlanCode(await getPlanCodeForUser(userId))
  const dailyLimit = await checkFreeDailyActionLimit(userId, planCode)
  if (!dailyLimit.allowed) return Response.json(freeDailyLimitResponseBody(dailyLimit), { status: 429 })

  const cost = AI_ACTION_COSTS.edit
  const balance = await getCreditBalance(userId)
  if (balance < cost) return Response.json({ error: 'Out of credits', balance }, { status: 402 })

  const lang = site.meta.language === 'en' ? 'en' : 'tr'
  const fallback = suggestAboutAlt(site, section.title, lang)
  const current = section.media?.images?.[imageIndex ?? 0]
  const sector = detectSector([site.meta.name, site.meta.tagline, site.meta.audience, current?.imagePrompt].filter(Boolean).join(' '))

  try {
    const result = await generateStructured({
      ai: resolveAiModel('sectionEdit', planCode),
      schema: altSchema,
      system:
        'You write concise image alt text for website accessibility. One factual sentence under 120 characters, no "image of" prefix, no quotes, no invented claims, no people descriptions.',
      prompt: [
        `Language: ${lang === 'tr' ? 'Turkish' : 'English'}`,
        `Business name: ${site.meta.name}`,
        `Sector: ${sectorNoun(sector, 'en')}`,
        current?.imagePrompt ? `Image scene: ${current.imagePrompt}` : '',
        'Write the alt text. It MUST contain the business name and make clear what the image shows.',
      ]
        .filter(Boolean)
        .join('\n'),
      recordEvent: false,
    })
    const alt = result.object.alt.trim()
    const charge = await consumeCredits(userId, cost, 'aboutAlt')
    if (!charge.ok) return Response.json({ error: 'Out of credits', balance: charge.balance }, { status: 402 })
    return Response.json({ alt, charged: cost })
  } catch (err) {
    console.log('[v0] about-alt error:', err instanceof Error ? err.message : err)
    return Response.json({ alt: fallback, charged: 0 })
  }
}
