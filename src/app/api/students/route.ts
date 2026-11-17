import {
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
} from '@/lib/api'
import { createStudentRecord, listStudents } from '@/services/studentService'

/**
 * POST /api/students
 * Direct operational student creation by an authenticated `super_admin`.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) {
      return auth.response
    }

    const parsedBody = await parseJsonObject(request)
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const student = await createStudentRecord(auth.payload, parsedBody.data)
    return apiSuccess(student, 'Student record created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to create student record.')
  }
}

/**
 * GET /api/students
 * Paginated list of operational student records. `super_admin` only.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) {
      return auth.response
    }

    const url = new URL(request.url)
    const result = await listStudents(auth.payload, url.searchParams)
    return apiSuccess(result, 'Students retrieved successfully.', 200)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to retrieve students.')
  }
}
