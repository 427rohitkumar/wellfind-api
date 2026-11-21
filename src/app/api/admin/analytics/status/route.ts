import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { checkGaConnection } from '@/services/googleAnalytics'

/** GET /api/admin/analytics/status: is Google Analytics configured and reachable? (super_admin only; never returns secrets) */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await checkGaConnection(), 'Google Analytics status fetched.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to check Google Analytics.')
  }
}
