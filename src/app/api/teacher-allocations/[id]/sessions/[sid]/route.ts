import { teacherHandler } from '@/lib/teacherRoute'
import { deleteSession, updateSession } from '@/services/teachingService'

export const PATCH = teacherHandler({ sub: 'sid', body: true, message: 'Class updated.' }, ({ payload, user, id, sub, body }) => updateSession(payload, user, id, sub!, body))
export const DELETE = teacherHandler({ sub: 'sid', message: 'Class deleted.' }, ({ payload, user, id, sub }) => deleteSession(payload, user, id, sub!))
