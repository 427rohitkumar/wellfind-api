import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { updateTeacherAvailability } from '@/services/teacherApprovalService'

/**
 * PATCH /api/teachers/:id/availability (`super_admin` only).
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
    const result = await updateTeacherAvailability(pre.payload, pre.entityId, body.data)
    return apiSuccess(result, 'Teacher availability updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update teacher availability.')
  }
}
