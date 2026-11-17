import {
  apiError,
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
} from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'
import { convertStudentEnquiry } from '@/services/studentService'

interface RouteContext {
  params: Promise<{ id: string }>
}

/**
 * POST /api/student-enquiries/:id/convert
 * Atomically converts an eligible enquiry (`new`, `contacted`, `in_progress`)
 * into a single Student record and transitions enquiryStatus to `converted`.
 */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) {
      return auth.response
    }

    const { id } = await context.params
    const enquiryId = parsePositiveIntId(id)
    if (!enquiryId) {
      return apiError('Invalid student enquiry ID.', 400, [
        { field: 'id', message: 'ID must be a positive integer.' },
      ])
    }

    const parsedBody = await parseJsonObject(request, { allowEmpty: true })
    if (!parsedBody.ok) {
      return parsedBody.response
    }

    const result = await convertStudentEnquiry(
      auth.payload,
      enquiryId,
      parsedBody.data,
      auth.user,
    )

    return apiSuccess(
      result,
      'Student enquiry converted to student record successfully.',
      201,
    )
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to convert student enquiry.')
  }
}
