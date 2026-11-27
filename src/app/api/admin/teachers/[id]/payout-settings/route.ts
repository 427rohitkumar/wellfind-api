import { apiError, apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { getTeacherPayoutSettingsById } from '@/services/payoutService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/teachers/[id]/payout-settings
 * Fetches the specific teacher's real database-backed payout settings (bank & UPI accounts).
 */
export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response

    const { id } = await props.params
    const teacherId = Number(id)
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return apiError('Invalid teacher ID.', 400)
    }

    const settings = await getTeacherPayoutSettingsById(auth.payload, teacherId)
    return apiSuccess(settings, 'Teacher payout settings fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch teacher payout settings.')
  }
}
