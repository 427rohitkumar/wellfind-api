import { apiSuccess, authorizeRouteWithId, handleRouteError } from '@/lib/api'
import { undoPayout } from '@/services/payoutService'

/** DELETE /api/admin/payments/payouts/:id: undo a "paid" mark. */
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const auth = await authorizeRouteWithId(request, context, { field: 'id', label: 'payout' })
    if (!auth.ok) return auth.response
    return apiSuccess(await undoPayout(auth.payload, auth.entityId), 'Payout removed.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to remove the payout.')
  }
}
