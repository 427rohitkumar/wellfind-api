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
  createStudentAssessment,
  listStudentAssessments,
} from '@/services/studentAssessmentService'
import type { Payload } from 'payload'

interface RouteContext {
  params: Promise<{ id: string }>
}

async function authorizeAndParseStudentId(
  request: Request,
  context: RouteContext,
): Promise<
  | { ok: true; payload: Payload; user: AuthUserRecord; studentId: number }
  | { ok: false; response: Response }
> {
  const auth = await requireSuperAdmin(request)
  if (!auth.ok) {
    return auth
  }

  const { id } = await context.params
  const studentId = parsePositiveIntId(id)
  if (!studentId) {
    return {
      ok: false,
      response: apiError('Invalid student ID.', 400, [
        { field: 'studentId', message: 'ID must be a positive integer.' },
      ]),
    }
  }

  return {
    ok: true,
    payload: auth.payload,
    user: auth.user,
    studentId,
  }
}

/**
 * POST /api/students/:studentId/assessments
 * Records a capability assessment for an existing student (`super_admin` only).
 * Preserves history across multiple submissions and does not require a physical test.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const preflight = await authorizeAndParseStudentId(request, context)
    if (!preflight.ok) {
      return preflight.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const created = await createStudentAssessment(
      preflight.payload,
      preflight.studentId,
      parsedBody.data,
      preflight.user,
    )

    return apiSuccess(
      created,
      'Student capability assessment recorded successfully.',
      201,
    )
  } catch (err: unknown) {
    return handleRouteError(
      err,
      'Failed to record student capability assessment.',
    )
  }
}

/**
 * GET /api/students/:studentId/assessments
 * Retrieves paginated capability assessment history for a student (`super_admin` only).
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const preflight = await authorizeAndParseStudentId(request, context)
    if (!preflight.ok) {
      return preflight.response
    }

    const url = new URL(request.url)
    const result = await listStudentAssessments(
      preflight.payload,
      preflight.studentId,
      url.searchParams,
    )

    return apiSuccess(
      result,
      'Student capability assessments retrieved successfully.',
      200,
    )
  } catch (err: unknown) {
    return handleRouteError(
      err,
      'Failed to retrieve student capability assessments.',
    )
  }
}
