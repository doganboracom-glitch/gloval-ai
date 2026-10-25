import type { PublishOptions } from '@/lib/free-publish'

/**
 * What the /billing?publish=<id> banner offers. An account without a
 * subscription is on the automatic FREE plan, so it is never told to "pick a
 * plan first": it can publish with FREE (when FREE allows this site) or pick a
 * package below.
 */
export type PublishBanner =
  | { kind: 'free_choice' }
  | { kind: 'blocked'; options: Extract<PublishOptions, { mode: 'packages_only' }> }
  | { kind: 'continue'; paid: boolean }
  | { kind: 'suspended' }

export function resolvePublishBanner(input: {
  hasProject: boolean
  suspended: boolean
  hasPaidSubscription: boolean
  options: PublishOptions | null
}): PublishBanner | null {
  if (!input.hasProject) return null
  if (input.suspended) return { kind: 'suspended' }
  const { options } = input
  if (options?.mode === 'free_choice') return { kind: 'free_choice' }
  if (options?.mode === 'packages_only') return { kind: 'blocked', options }
  return { kind: 'continue', paid: input.hasPaidSubscription }
}
