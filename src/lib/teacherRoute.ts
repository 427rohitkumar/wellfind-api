import type { Payload } from 'payload'
import { apiError, apiSuccess, handleRouteError, parseJsonObject, type AuthUserRecord } from '@/lib/api'
import { parsePositiveIntId } from '@/lib/studentValidation'
import { requireTeacher } from '@/lib/teacherPortalAuth'

type Params = Promise<Record<string, string>>
type Ctx = { payload: Payload; user: AuthUserRecord; id: number; sub: number | null; body: Record<string, unknown>; request: Request }

/** Shared plumbing for the teacher's "My Students" routes: teacher auth, id parsing, JSON body, error mapping. */
export function teacherHandler(opts: { sub?: string; body?: boolean; message: string; status?: number }, fn: (c: Ctx) => Promise<unknown>) {
  return async (request: Request, context: { params: Params }): Promise<Response> => {
    try {
      const auth = await requireTeacher(request)
      if (!auth.ok) return auth.response
      const params = await context.params
      const id = parsePositiveIntId(params.id)
      if (!id) return apiError('Invalid student ID.', 400)
      let sub: number | null = null
      if (opts.sub) {
        sub = parsePositiveIntId(params[opts.sub] ?? '')
        if (!sub) return apiError('Invalid ID.', 400)
      }
      let body: Record<string, unknown> = {}
      if (opts.body) {
        const parsed = await parseJsonObject(request)
        if (!parsed.ok) return parsed.response
        body = parsed.data
      }
      const data = await fn({ payload: auth.payload, user: auth.user, id, sub, body, request })
      return apiSuccess(data, opts.message, opts.status ?? 200)
    } catch (err: unknown) {
      return handleRouteError(err, opts.message)
    }
  }
}
