import {
  apiError,
  apiSuccess,
  handleRouteError,
  parseJsonObject,
  requireSuperAdmin,
} from '@/lib/api'
import { validateAndBuildEnquiryData } from '@/lib/studentValidation'
import { createManualStudentEnquiry } from '@/services/studentService'

/**
 * POST /api/admin/student-enquiries
 * Manual offline/inbound enquiry creation by an authenticated `super_admin`.
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

    const validated = validateAndBuildEnquiryData(parsedBody.data, {
      requireExplicitPolicy: false,
      defaultSource: 'website',
      forceWebsiteSource: false,
    })

    if (!validated.ok) {
      return apiError(validated.message, 400, [
        { field: validated.field, message: validated.message },
      ])
    }

    const created = await createManualStudentEnquiry(
      auth.payload,
      validated.data,
      {
        adminNotes: parsedBody.data.adminNotes,
        assignedTo: parsedBody.data.assignedTo,
        markAsRead: parsedBody.data.markAsRead,
      },
      auth.user,
    )

    return apiSuccess(created, 'Student enquiry created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to create student enquiry.')
  }
}
