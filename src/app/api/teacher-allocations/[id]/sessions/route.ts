import { teacherHandler } from '@/lib/teacherRoute'
import { createSession, listSessions } from '@/services/teachingService'

/** GET /api/teacher-allocations/:id/sessions?month=YYYY-MM  ·  POST: record or plan a class. */
export const GET = teacherHandler({ message: 'Classes fetched successfully.' }, ({ payload, user, id, request }) =>
  listSessions(payload, user, id, new URL(request.url).searchParams.get('month')),
)
export const POST = teacherHandler({ body: true, message: 'Class saved.', status: 201 }, ({ payload, user, id, body }) => createSession(payload, user, id, body))
