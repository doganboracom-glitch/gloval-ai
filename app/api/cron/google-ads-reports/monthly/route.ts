import { handleGoogleAdsReportCron } from '@/lib/ads/google-ads-report-cron'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return handleGoogleAdsReportCron(request, 'monthly')
}
