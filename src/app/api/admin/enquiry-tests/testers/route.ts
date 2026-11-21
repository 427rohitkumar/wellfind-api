import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { listTesters } from '@/services/enquiryTestService'

/** GET /api/admin/enquiry-tests/testers: active users who can conduct a physical test. */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess({ docs: await listTesters(auth.payload) }, 'Testers fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch testers.')
  }
}
