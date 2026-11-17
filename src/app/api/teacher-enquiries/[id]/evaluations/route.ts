import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import {
  createTeacherEvaluation,
  listTeacherEvaluations,
} from '@/services/teacherEvaluationService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/teacher-enquiries/:id/evaluations
 * Records written test and/or interview evaluation results for a teacher
 * enquiry (`super_admin` only). Preserves history across attempts.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, {
      field: 'teacherEnquiryId',
      label: 'teacher enquiry',
      requireAdmin: true,
    })
    if (!preflight.ok) {
      return preflight.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const created = await createTeacherEvaluation(
      preflight.payload,
      preflight.entityId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(created, 'Teacher evaluation recorded successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to record teacher evaluation.')
  }
}

/**
 * GET /api/teacher-enquiries/:id/evaluations
 * Retrieves paginated evaluation history for a teacher enquiry (`super_admin` only).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeRouteWithId(request, context, {
      field: 'teacherEnquiryId',
      label: 'teacher enquiry',
      requireAdmin: true,
    })
    if (!preflight.ok) {
      return preflight.response
    }

    const url = new URL(request.url)
    const result = await listTeacherEvaluations(
      preflight.payload,
      preflight.entityId,
      url.searchParams,
    )

    return apiSuccess(result, 'Teacher evaluations fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch teacher evaluations.')
  }
}
