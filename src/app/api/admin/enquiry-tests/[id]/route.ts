import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { getTest, updateTest } from '@/services/enquiryTestService'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const auth = await authorizeRouteWithId(request, context, { field: 'id', label: 'test' })
    if (!auth.ok) return auth.response
    return apiSuccess(await getTest(auth.payload, auth.entityId), 'Test fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch the test.')
  }
}

export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const auth = await authorizeRouteWithId(request, context, { field: 'id', label: 'test' })
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    return apiSuccess(await updateTest(auth.payload, auth.entityId, body.data, auth.user), 'Test updated successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update the test.')
  }
}
