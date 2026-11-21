import { apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { adminPayoutLedger, recordPayout } from '@/services/payoutService'

/** GET /api/admin/payments/payouts?month=YYYY-MM&teacher=<profile id>: monthly teacher payout ledger. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await adminPayoutLedger(auth.payload, new URL(request.url).searchParams), 'Payouts fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch payouts.')
  }
}

/** POST { allocationId, month, amount?, paidAt?, reference?, note? }: mark one student-month as paid to the teacher. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    return apiSuccess(await recordPayout(auth.payload, auth.user, body.data), 'Payout recorded.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to record the payout.')
  }
}
