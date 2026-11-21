import { apiError, apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { AnalyticsError } from '@/services/googleAnalytics'
import { ANALYTICS_PERIODS, getAnalyticsOverview, type AnalyticsPeriod } from '@/services/analyticsOverview'

/** GET /api/admin/analytics/overview?period=28d : all Google Analytics numbers for the CRM page (super_admin only). */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const raw = new URL(request.url).searchParams.get('period') || '28d'
    const period = (ANALYTICS_PERIODS as readonly string[]).includes(raw) ? (raw as AnalyticsPeriod) : '28d'
    return apiSuccess(await getAnalyticsOverview(period), 'Analytics fetched successfully.')
  } catch (err: unknown) {
    if (err instanceof AnalyticsError) {
      return apiError(err.message, err.status, [{ field: err.code, message: err.message }])
    }
    return handleRouteError(err, 'Failed to fetch analytics.')
  }
}
