import { apiSuccess, handleRouteError } from '@/lib/api'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { findOwnApplication, serializeOwnApplication } from '@/services/teacherApplicationService'

/** GET /api/teacher-applications/me — the logged-in teacher's own application, stages and fee. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    const enquiry = await findOwnApplication(auth.payload, auth.user)
    return apiSuccess(await serializeOwnApplication(auth.payload, enquiry), 'Application fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch your application.')
  }
}
