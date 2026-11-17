import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { recordPhysicalTestPayment } from '@/services/physicalTestService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/student-tests/:testId/payment
 * Records a ₹100 INR payment attempt or confirmed settlement for a physical test (`super_admin` only).
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
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

    const result = await recordPhysicalTestPayment(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(result, 'Physical test payment recorded successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to record physical test payment.')
  }
}
