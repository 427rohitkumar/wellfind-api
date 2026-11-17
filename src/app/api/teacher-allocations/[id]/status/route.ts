import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { updateAllocationStatus } from '@/services/teacherAllocationService'

/**
 * PATCH /api/teacher-allocations/:id/status
 * `super_admin`: any valid transition. Teacher: accept/reject their own `assigned` allocation.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'allocationId',
      label: 'allocation',
      requireAdmin: false,
    })
    if (!pre.ok) return pre.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const result = await updateAllocationStatus(pre.payload, pre.entityId, body.data, pre.user)
    return apiSuccess(result, 'Allocation status updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update allocation status.')
  }
}
