import 'server-only'
import { authorizeProjectOwner } from '@/lib/store-payments/owner-auth'

export type CustomersPageAccess = 'allowed' | 'login' | 'not_found'

/**
 * Page-level gate for the owner customer directory, on top of the checks inside
 * `listOwnerCustomers`. Only the project owner or an allow-listed admin passes;
 * everyone else gets `not_found`, so the page never reveals that a project exists.
 */
export async function resolveCustomersPageAccess(projectId: string): Promise<CustomersPageAccess> {
  try {
    await authorizeProjectOwner(projectId)
    return 'allowed'
  } catch (err) {
    return err instanceof Error && err.message === 'UNAUTHENTICATED' ? 'login' : 'not_found'
  }
}
