import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { findTeacherProfileForUser, listAllocations } from '@/services/teacherAllocationService'

/**
 * GET /api/teacher-allocations/my — the logged-in teacher's allocations.
 * Teacher identity is derived from the authenticated user; no teacher id is accepted.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (auth.user.role !== 'teacher') {
      return apiError('Teacher access required.', 403)
    }
    const profile = await findTeacherProfileForUser(auth.payload, auth.user.id)
    if (!profile) {
      return apiError('No teacher profile is linked to this account.', 403)
    }
    const result = await listAllocations(auth.payload, new URL(request.url).searchParams, {
      teacherProfileId: Number(profile.id),
    })
    return apiSuccess(result, 'Your allocations fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch your allocations.')
  }
}
