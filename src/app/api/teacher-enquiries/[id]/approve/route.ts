import { apiSuccess, authorizeRouteWithId, handleRouteError } from '@/lib/api'
import { approveTeacherEnquiry } from '@/services/teacherApprovalService'

/**
 * POST /api/teacher-enquiries/:id/approve
 * Approves an evaluated teacher application, creating one profile and linking/creating
 * the teacher user account (`super_admin` only). Client-supplied role data is ignored.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'teacherEnquiryId',
      label: 'teacher enquiry',
    })
    if (!pre.ok) return pre.response
    const result = await approveTeacherEnquiry(pre.payload, pre.entityId, pre.user)
    return apiSuccess(result, 'Teacher approved and profile created successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to approve teacher application.')
  }
}
