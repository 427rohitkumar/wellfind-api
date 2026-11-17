import { apiSuccess, authorizeRouteWithId, handleRouteError, parseJsonObject } from '@/lib/api'
import { findMatchingTeachers, saveMatchDecision } from '@/services/teacherMatchingService'

type Ctx = { params: Promise<{ id: string }> }

/** GET /api/students/:id/matches — eligible teachers (`super_admin`). Does not allocate. */
export async function GET(request: Request, context: Ctx): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'studentId',
      label: 'student',
    })
    if (!pre.ok) return pre.response
    const result = await findMatchingTeachers(pre.payload, pre.entityId)
    return apiSuccess(result, 'Matching teachers fetched successfully.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to fetch matching teachers.')
  }
}

/** POST /api/students/:id/matches — save a matching decision (`super_admin`). */
export async function POST(request: Request, context: Ctx): Promise<Response> {
  try {
    const pre = await authorizeRouteWithId(request, context, {
      field: 'studentId',
      label: 'student',
    })
    if (!pre.ok) return pre.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const saved = await saveMatchDecision(pre.payload, pre.entityId, body.data, pre.user)
    return apiSuccess(saved, 'Matching decision saved successfully.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to save matching decision.')
  }
}
