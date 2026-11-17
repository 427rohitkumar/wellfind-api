import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { createOrSkipPhysicalTest, listStudentTests } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ROUTE_OPTIONS = {
  field: 'studentId',
  label: 'student',
  requireAdmin: true,
}

/**
 * POST /api/students/:studentId/tests
 * Requests an optional ₹100 INR physical test when `parentSelected: true`, or
 * records an explicit skip without persisting a test when `parentSelected: false` (`super_admin` only).
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, ROUTE_OPTIONS)
    if (!preflight.ok) {
      return preflight.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const result = await createOrSkipPhysicalTest(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    if (result.skipped) {
      return apiSuccess(
        result,
        'Physical test skipped per parent preference; no physical test record created.',
        200,
      )
    }

    return apiSuccess(result, 'Physical test request created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to process physical test request.')
  }
}

/**
 * GET /api/students/:studentId/tests
 * Lists physical test requests for an existing student (`super_admin` only).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, ROUTE_OPTIONS)
    if (!preflight.ok) {
      return preflight.response
    }

    const searchParams = new URL(request.url).searchParams
    const result = await listStudentTests(preflight.payload, preflight.entityId, searchParams)

    return apiSuccess(result, 'Student physical tests fetched successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch student physical tests.')
  }
}
