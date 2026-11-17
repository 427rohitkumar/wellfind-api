import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { getPhysicalTestReport, submitPhysicalTestReport } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ROUTE_OPTIONS = {
  field: 'testId',
  label: 'physical test',
  requireAdmin: false,
}

/**
 * POST /api/student-tests/:testId/report
 * Submits the 1:1 physical test report (`super_admin` or currently assigned active tester).
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

    const result = await submitPhysicalTestReport(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(result, 'Physical test report submitted successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to submit physical test report.')
  }
}

/**
 * GET /api/student-tests/:testId/report
 * Retrieves a physical test report (`super_admin` or currently assigned active tester only).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, ROUTE_OPTIONS)
    if (!preflight.ok) {
      return preflight.response
    }

    const result = await getPhysicalTestReport(
      preflight.payload,
      preflight.entityId,
      preflight.user,
    )

    return apiSuccess(result, 'Physical test report fetched successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch physical test report.')
  }
}
