import { z } from 'zod'
import { BLOG_AI_LIMITS } from '@/lib/blog-ai'

const answer = z.string().max(BLOG_AI_LIMITS.answer).optional()

/** Client-generated id that makes one AI action charge at most once. */
export const requestIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

export const blogAnswersSchema = z
  .object({ offering: answer, region: answer, difference: answer, audience: answer, contact: answer })
  .default({})
