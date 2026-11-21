import { apiSuccess, handleRouteError, parseJsonObject, requireSuperAdmin } from '@/lib/api'
import { createTest, listTests } from '@/services/enquiryTestService'

/** GET /api/admin/enquiry-tests?status=&mode=&payment=&search=&page=&limit= */
export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const data = await listTests(auth.payload, new URL(request.url).searchParams)
    return apiSuccess(data, 'Tests fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch tests.')
  }
}

/** POST /api/admin/enquiry-tests  { studentEnquiryId, mode: 'physical'|'digital' } */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireSuperAdmin(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const test = await createTest(auth.payload, body.data, auth.user)
    return apiSuccess(test, 'Test requested successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to request the test.')
  }
}
