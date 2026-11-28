import { apiSuccess, handleRouteError, requireSuperAdmin } from '@/lib/api'
import { listAcademicTests } from '@/services/academicTestService'

export const dynamic = 'force-dynamic'

/** GET /api/admin/academic-tests?period=&status=&page=&limit= (needs `tests` read access) */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    return apiSuccess(await listAcademicTests(auth.payload, new URL(request.url).searchParams), 'Academic tests fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch academic tests.')
  }
}
