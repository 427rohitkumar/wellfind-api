import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { initiateRazorpayPayout } from '@/services/payoutService'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/payments/payouts/razorpay
 * Initiates an automated Razorpay UPI Payout for a teacher's monthly allocation.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response

    const body = await parseJsonObject(request)
    if (!body.ok) return body.response

    const result = await initiateRazorpayPayout(auth.payload, auth.user, body.data)
    return apiSuccess(result, result.message)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to initiate Razorpay UPI payout.')
  }
}
