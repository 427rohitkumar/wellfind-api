import { apiSuccess, handleRouteError } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { listTesterTests } from '@/services/enquiryTestService'

export const dynamic = 'force-dynamic'

/** GET /api/teachers/me/tests: booked physical tests allocated to the signed-in teacher. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await listTesterTests(auth.payload, auth.user), 'Tests fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch your tests.')
  }
}
