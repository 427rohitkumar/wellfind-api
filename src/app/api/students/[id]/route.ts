import {
  apiError,
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
} from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'
import { getStudentById, updateStudentById } from '@/services/studentService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * GET /api/students/:id
 * Retrieve a single student record by ID. `super_admin` only.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) {
      return auth.response
    }

    const { id } = await context.params
    const studentId = parsePositiveIntId(id)
    if (!studentId) {
      return apiError('Invalid student ID.', 400, [
        { field: 'id', message: 'ID must be a positive integer.' },
      ])
    }

    const student = await getStudentById(auth.payload, studentId)
    return apiSuccess(student, 'Student retrieved successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to retrieve student.')
  }
}

/**
 * PATCH /api/students/:id
 * Update permitted operational student fields. `super_admin` only.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) {
      return auth.response
    }

    const { id } = await context.params
    const studentId = parsePositiveIntId(id)
    if (!studentId) {
      return apiError('Invalid student ID.', 400, [
        { field: 'id', message: 'ID must be a positive integer.' },
      ])
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const updated = await updateStudentById(
      auth.payload,
      studentId,
      parsedBody.data,
    )
    return apiSuccess(updated, 'Student updated successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update student.')
  }
}
