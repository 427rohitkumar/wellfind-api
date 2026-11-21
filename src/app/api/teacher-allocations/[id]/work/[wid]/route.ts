import { teacherHandler } from '@/lib/teacherRoute'
import { deleteWork, updateWork } from '@/services/teachingService'

export const PATCH = teacherHandler({ sub: 'wid', body: true, message: 'Updated.' }, ({ payload, user, id, sub, body }) => updateWork(payload, user, id, sub!, body))
export const DELETE = teacherHandler({ sub: 'wid', message: 'Deleted.' }, ({ payload, user, id, sub }) => deleteWork(payload, user, id, sub!))
