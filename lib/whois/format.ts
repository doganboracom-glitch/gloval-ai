/** Dates are always shown in Turkey time (Europe/Istanbul), whatever the viewer's zone. */
export const WHOIS_TIME_ZONE = 'Europe/Istanbul'

export function formatIstanbulDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: WHOIS_TIME_ZONE,
      dateStyle: 'long',
      timeStyle: 'short',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-GB', { timeZone: WHOIS_TIME_ZONE, dateStyle: 'long', timeStyle: 'short' }).format(date)
  }
}

function istanbulDayNumber(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WHOIS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day')) / 86_400_000
}

/** Whole calendar days (Istanbul) from `now` to `iso`; negative once the date has passed. */
export function daysRemaining(iso: string, now: Date = new Date()): number | null {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return null
  return Math.round(istanbulDayNumber(target) - istanbulDayNumber(now))
}
