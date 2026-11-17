import { apiSuccess, authorizeRouteWithId, handleRouteError } from '@/lib/api'
import { getStudentTestById } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/student-tests/:testId
 * Retrieves physical test details (`super_admin` or currently assigned active tester).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, {
      field: 'testId',
      label: 'physical test',
      requireAdmin: false,
    })
    if (!preflight.ok) {
      return preflight.response
    }

    const result = await getStudentTestById(preflight.payload, preflight.entityId, preflight.user)

    return apiSuccess(result, 'Physical test fetched successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch physical test.')
  }
}
