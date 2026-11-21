import { apiError, requireActiveUser, type AuthUserRecord } from '@/lib/api'
import type { Payload } from 'payload'

/** Authenticates the request and requires an active `teacher` account. */
export async function requireTeacher(
  request: Request,
): Promise<{ ok: true; payload: Payload; user: AuthUserRecord } | { ok: false; response: Response }> {
  const auth = await requireActiveUser(request)
  if (!auth.ok) return auth
  if (auth.user.role !== 'teacher') {
    return { ok: false, response: apiError('This area is for teacher accounts only.', 403) }
  }
  return auth
}
