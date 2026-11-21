import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { getAllocationFinanceSummary } from '@/services/paymentAnalytics'

/** GET /api/admin/payments/finance — expected monthly fees, commission and teacher payouts from live allocations. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await getAllocationFinanceSummary(auth.payload), 'Finance summary fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch the finance summary.')
  }
}
