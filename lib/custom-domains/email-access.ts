import { isDomainLive, type CustomDomain } from './types'

export function isEmailManagementAvailable(
  domain: CustomDomain,
  publishedProjectIds: ReadonlySet<string>,
): boolean {
  return Boolean(
    domain.websiteProjectId &&
      publishedProjectIds.has(domain.websiteProjectId) &&
      isDomainLive(domain),
  )
}
