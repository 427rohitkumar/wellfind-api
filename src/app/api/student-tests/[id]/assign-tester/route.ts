import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { assignPhysicalTestTester } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * PATCH /api/student-tests/:testId/assign-tester
 * Assigns or reassigns an active `teacher` or `super_admin` tester to a paid
 * physical test (`super_admin` only).
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, {
      field: 'testId',
      label: 'physical test',
      requireAdmin: true,
    })
    if (!preflight.ok) {
      return preflight.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const result = await assignPhysicalTestTester(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(result, 'Tester assigned to physical test successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to assign tester to physical test.')
  }
}
