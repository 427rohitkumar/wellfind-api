import {
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
} from '@/lib/api'
import { createAllocation, listAllocations } from '@/services/teacherAllocationService'

/** POST /api/teacher-allocations — create final allocation (`super_admin` only). */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const created = await createAllocation(auth.payload, body.data, auth.user)
    return apiSuccess(created, 'Teacher allocation created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to create teacher allocation.')
  }
}

/** GET /api/teacher-allocations — list allocations (`super_admin` only). */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const result = await listAllocations(auth.payload, new URL(request.url).searchParams)
    return apiSuccess(result, 'Teacher allocations fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch teacher allocations.')
  }
}
