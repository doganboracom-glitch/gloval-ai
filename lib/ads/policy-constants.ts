export const ADS_POLICY_BLOCK_GLOBAL_SUBJECT = 'ads:policy:global'
export const ADS_POLICY_BLOCK_RESERVATION_ID_PREFIX = 'policy_'

export const ADS_POLICY_BLOCK_LIMITS = {
  identityPerDay: 3,
  ipPerDay: 10,
  globalPerDayDefault: 60,
} as const
