import {
  apiError,
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
  type AuthUserRecord,
} from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'
import {
  getTeacherEvaluationById,
  updateTeacherEvaluation,
} from '@/services/teacherEvaluationService'
import type { Payload } from 'payload'

interface RouteContext {
  params: Promise<{ id: string; evaluationId: string }>
}

async function authorizeAndParseIds(
  request: Request,
  context: RouteContext,
): Promise<
  | {
      ok: true
      payload: Payload
      user: AuthUserRecord
      teacherEnquiryId: number
      evaluationId: number
    }
  | { ok: false; response: Response }
> {
  const auth = await requireSuperAdmin(request)
  if (!auth.ok) {
    return auth
  }

  const { id, evaluationId: rawEvalId } = await context.params
  const teacherEnquiryId = parsePositiveIntId(id)
  if (!teacherEnquiryId) {
    return {
      ok: false,
      response: apiError('Invalid teacher enquiry ID.', 400, [
        { field: 'teacherEnquiryId', message: 'ID must be a positive integer.' },
      ]),
    }
  }

  const evaluationId = parsePositiveIntId(rawEvalId)
  if (!evaluationId) {
    return {
      ok: false,
      response: apiError('Invalid evaluation ID.', 400, [
        { field: 'evaluationId', message: 'ID must be a positive integer.' },
      ]),
    }
  }

  return {
    ok: true,
    payload: auth.payload,
    user: auth.user,
    teacherEnquiryId,
    evaluationId,
  }
}

/**
 * GET /api/teacher-enquiries/:id/evaluations/:evaluationId
 * Retrieves a single teacher evaluation record (`super_admin` only).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeAndParseIds(request, context)
    if (!preflight.ok) {
      return preflight.response
    }

    const evaluation = await getTeacherEvaluationById(
      preflight.payload,
      preflight.teacherEnquiryId,
      preflight.evaluationId,
    )

    return apiSuccess(evaluation, 'Teacher evaluation fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch teacher evaluation.')
  }
}

/**
 * PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId
 * Authorized update of an evaluation record (`super_admin` only).
 * Requires `changeReason` on completed records, appends an immutable revision
 * snapshot, audits to `enquiry-audit-log`, and recalculates `qualityScore`.
 */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const preflight = await authorizeAndParseIds(request, context)
    if (!preflight.ok) {
      return preflight.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const updated = await updateTeacherEvaluation(
      preflight.payload,
      preflight.teacherEnquiryId,
      preflight.evaluationId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(updated, 'Teacher evaluation updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update teacher evaluation.')
  }
}
