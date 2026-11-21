import { teacherHandler } from '@/lib/teacherRoute'
import { setTimetable } from '@/services/teachingService'

/** PUT /api/teacher-allocations/:id/timetable  { slots: [{ day: 'mon'..'sun', startTime, endTime }] } */
export const PUT = teacherHandler({ body: true, message: 'Timetable saved.' }, ({ payload, user, id, body }) => setTimetable(payload, user, id, body))
