import { apiError, apiSuccess, handleRouteError, parseJsonObject } from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'
import { requireTeacher } from '@/lib/teacherPortalAuth'
import { getTesterTest, saveTesterResult } from '@/services/enquiryTestService'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    const id = parsePositiveIntId((await context.params).id)
    if (!id) return apiError('Invalid test ID.', 400)
    return apiSuccess(await getTesterTest(auth.payload, auth.user, id), 'Test fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch the test.')
  }
}

/** PATCH { report?: { iqScore, creativityScore, academicScore, extraScores, ... }, submit?: boolean } */
export async function PATCH(request: Request, context: Ctx): Promise<Response> {
  try {
    const auth = await requireTeacher(request)
    if (!auth.ok) return auth.response
    const id = parsePositiveIntId((await context.params).id)
    if (!id) return apiError('Invalid test ID.', 400)
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const test = await saveTesterResult(auth.payload, auth.user, id, body.data)
    return apiSuccess(test, test.status === 'report_ready' ? 'Result submitted.' : 'Draft saved.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to save the result.')
  }
}
