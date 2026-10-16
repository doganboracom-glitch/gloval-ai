import { detectTextInImage } from '@/lib/image-text-guard'
import type { CoverVerdict } from '@/lib/blog-cover'

const CHECK_TIMEOUT_MS = 8_000

const PEOPLE_PROMPT =
  'Does this image show a human face or a clearly visible person (photographed or drawn), including a close-up of a face or hands? Tiny distant silhouettes do not count. Answer with exactly one word: YES or NO.'

/** Never throws; any failure resolves to 'unknown'. */
export async function detectPeopleInImage(src: string): Promise<CoverVerdict['people']> {
  if (/^(0|false|no|off)$/i.test((process.env.IMAGE_TEXT_CHECK || '').trim())) return 'unknown'
  try {
    const { generateText } = await import('ai')
    const { text } = await generateText({
      model: process.env.IMAGE_TEXT_CHECK_MODEL || 'google/gemini-2.5-flash-lite',
      maxOutputTokens: 5,
      temperature: 0,
      abortSignal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PEOPLE_PROMPT },
            { type: 'image', image: src },
          ],
        },
      ],
    })
    const answer = text.trim().toLowerCase()
    return answer.startsWith('yes') ? 'people' : answer.startsWith('no') ? 'clean' : 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Text check (the shared guard, allowText=false semantics) and people check, run in parallel. */
export async function inspectCover(src: string): Promise<CoverVerdict> {
  const [text, people] = await Promise.all([detectTextInImage(src), detectPeopleInImage(src)])
  return { text, people }
}
