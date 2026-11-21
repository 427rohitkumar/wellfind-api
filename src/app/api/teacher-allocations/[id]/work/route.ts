import { teacherHandler } from '@/lib/teacherRoute'
import { createWork, listWork } from '@/services/teachingService'

/** GET /api/teacher-allocations/:id/work  ·  POST: give an assignment or class test. */
export const GET = teacherHandler({ message: 'Work fetched successfully.' }, ({ payload, user, id }) => listWork(payload, user, id))
export const POST = teacherHandler({ body: true, message: 'Added.', status: 201 }, ({ payload, user, id, body }) => createWork(payload, user, id, body))
