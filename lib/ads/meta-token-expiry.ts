import {
  buildMetaTokenExpiredEmail,
  buildMetaTokenExpiringEmail,
} from '@/lib/email/ads-mail'
import type { ExpiringMetaConnection } from '@/lib/ads/meta-connections'

export const META_EXPIRY_WARNING_DAYS = 7
const DAY_MS = 86_400_000

export type MetaExpiryNotice = {
  kind: 'expiring' | 'expired'
  connection: ExpiringMetaConnection
  daysLeft: number
  /** One mail per connection + token expiry date: reconnecting issues a new expiry and so re-arms the notice. */
  dedupeKey: string
}

export function planMetaExpiryNotices(connections: readonly ExpiringMetaConnection[], now = Date.now()): MetaExpiryNotice[] {
  return connections.flatMap((connection): MetaExpiryNotice[] => {
    const expiresAt = Date.parse(connection.tokenExpiresAt)
    if (!Number.isFinite(expiresAt)) return []
    const day = connection.tokenExpiresAt.slice(0, 10)
    if (expiresAt <= now) {
      return [{ kind: 'expired' as const, connection, daysLeft: 0, dedupeKey: `meta_token_expired_${connection.id}_${day}` }]
    }
    const daysLeft = Math.ceil((expiresAt - now) / DAY_MS)
    if (daysLeft > META_EXPIRY_WARNING_DAYS) return []
    return [{ kind: 'expiring' as const, connection, daysLeft, dedupeKey: `meta_token_expiring_${connection.id}_${day}` }]
  })
}

export function buildMetaExpiryMail(notice: MetaExpiryNotice) {
  const accountName = notice.connection.accountName ?? notice.connection.externalAccountId
  return notice.kind === 'expired'
    ? buildMetaTokenExpiredEmail({ accountName })
    : buildMetaTokenExpiringEmail({ daysLeft: notice.daysLeft, accountName })
}
