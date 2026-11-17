import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { listReportShares, recordReportShare } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ROUTE_OPTIONS = {
  field: 'testId',
  label: 'physical test',
  requireAdmin: true,
}

/**
 * POST /api/student-tests/:testId/report/share
 * Logs an operational WhatsApp or phone-call sharing action (`super_admin` only).
 * Does not confirm external message delivery (`externalDeliveryConfirmed: false`).
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

    const result = await recordReportShare(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(
      result,
      'Report sharing action logged locally; external delivery is not integrated or confirmed.',
      201,
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to log report sharing action.')
  }
}

/**
 * GET /api/student-tests/:testId/report/share
 * Lists paginated report sharing logs for a physical test (`super_admin` only).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, ROUTE_OPTIONS)
    if (!preflight.ok) {
      return preflight.response
    }

    const searchParams = new URL(request.url).searchParams
    const result = await listReportShares(preflight.payload, preflight.entityId, searchParams)

    return apiSuccess(result, 'Report share logs fetched successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch report share logs.')
  }
}
