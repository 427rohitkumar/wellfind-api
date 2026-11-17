import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { updateTeacherStatus } from '@/services/teacherApprovalService'

/**
 * PATCH /api/teachers/:id/status (`super_admin` only).
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'teacherId',
      label: 'teacher',
    })
    if (!pre.ok) return pre.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const result = await updateTeacherStatus(pre.payload, pre.entityId, body.data, pre.user)
    return apiSuccess(result, 'Teacher status updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update teacher status.')
  }
}
