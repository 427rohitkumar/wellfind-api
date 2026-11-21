import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { teacherPayoutLedger } from '@/services/payoutService'

/** GET /api/teachers/me/payouts: what the signed-in teacher was paid (and is still due) per student, per month. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (auth.user.role !== 'teacher') return apiError('Teacher access required.', 403)
    return apiSuccess(await teacherPayoutLedger(auth.payload, auth.user), 'Payout history fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch payout history.')
  }
}
