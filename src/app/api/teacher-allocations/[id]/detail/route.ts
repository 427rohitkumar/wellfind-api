import { teacherHandler } from '@/lib/teacherRoute'
import { getStudentDetail } from '@/services/teachingService'

/** GET /api/teacher-allocations/:id/detail: one allocated student for the signed-in teacher. */
export const GET = teacherHandler({ message: 'Student fetched successfully.' }, ({ payload, user, id }) => getStudentDetail(payload, user, id))
