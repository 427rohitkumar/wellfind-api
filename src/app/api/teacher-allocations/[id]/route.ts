import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { getAllocation, updateAllocation } from '@/services/teacherAllocationService'

type Ctx = { params: Promise<{ id: string }> }
const opts = { field: 'allocationId', label: 'allocation' }

/** GET /api/teacher-allocations/:id — admin, or the allocated teacher (own only). */
export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, { ...opts, requireAdmin: false })
    if (!pre.ok) return pre.response
    const result = await getAllocation(pre.payload, pre.entityId, pre.user)
    return apiSuccess(result, 'Teacher allocation fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch teacher allocation.')
  }
}

/** PATCH /api/teacher-allocations/:id — update permitted fields (`super_admin` only). */
export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, opts)
    if (!pre.ok) return pre.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const result = await updateAllocation(pre.payload, pre.entityId, body.data)
    return apiSuccess(result, 'Teacher allocation updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update teacher allocation.')
  }
}
