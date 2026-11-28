import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { testPeriods } from '@/collections/AllocationWork'
import { extractRelationId, extractSubjectNames } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'
import { findTeacherProfileForUser } from '@/services/teacherAllocationService'

/**
 * "My Students" for a teacher: one allocation = one student the teacher teaches.
 * Every call proves the allocation belongs to the signed-in teacher; other teachers' allocations look like "not found".
 */

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const WRITABLE = ['accepted', 'active']
const CONTACT_VISIBLE = ['accepted', 'active', 'completed']
const bad = (field: string, message: string) => new ServiceError(message, 400, [{ field, message }])

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)

async function ownAllocation(payload: Payload, user: AuthUserRecord, id: number) {
  if (user.role !== 'teacher') throw new ServiceError('Teacher access required.', 403)
  const profile = await findTeacherProfileForUser(payload, user.id)
  if (!profile) throw new ServiceError('No teacher profile is linked to this account.', 403)
  const doc = (await (payload as any).findByID({ collection: 'teacher-allocations', id, depth: 1, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!doc || extractRelationId(doc.teacher) !== profile.id) throw new ServiceError('Student not found.', 404)
  return doc
}

function canWrite(doc: Record<string, any>) {
  if (!WRITABLE.includes(doc.status)) {
    throw new ServiceError('Accept the allocation first. Classes and work can be recorded for accepted or active students.', 409)
  }
}

export async function getStudentDetail(payload: Payload, user: AuthUserRecord, id: number) {
  const a = await ownAllocation(payload, user, id)
  const s = (a.student && typeof a.student === 'object' ? a.student : {}) as Record<string, any>
  const visible = CONTACT_VISIBLE.includes(a.status)

  // Assessment test for this student (set up by the Wellfind team).
  let assessment: Record<string, any> | null = null
  const enquiryId = extractRelationId(s.studentEnquiry)
  if (enquiryId) {
    const t = await (payload as any).find({
      collection: 'enquiry-tests',
      where: { and: [{ studentEnquiry: { equals: enquiryId } }, { status: { not_equals: 'cancelled' } }] },
      sort: '-createdAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    const test = t.docs[0] as Record<string, any> | undefined
    if (test) {
      const r = (test.report ?? {}) as Record<string, any>
      const level = (n: unknown) => (typeof n !== 'number' ? null : n >= 80 ? 'excellent' : n >= 60 ? 'good' : n >= 40 ? 'average' : 'needs_support')
      assessment = {
        mode: test.mode,
        status: test.status,
        conductedAt: test.conductedAt ?? null,
        report:
          test.status === 'report_ready'
            ? {
                iqScore: r.iqScore, creativityScore: r.creativityScore, academicScore: r.academicScore,
                iqLevel: level(r.iqScore), creativityLevel: level(r.creativityScore), academicLevel: level(r.academicScore),
                extraScores: (Array.isArray(r.extraScores) ? r.extraScores : []).map((x: any) => ({ label: x.label, score: x.score, level: level(x.score) })),
                strengths: r.strengths ?? null, improvementAreas: r.improvementAreas ?? null,
                recommendation: r.recommendation ?? null, hoursPerWeek: r.hoursPerWeek ?? null,
              }
            : null,
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const count = (collection: string, where: Record<string, any>) =>
    (payload as any).count({ collection, where: { and: [{ allocation: { equals: id } }, where] }, overrideAccess: true }).then((r: any) => r.totalDocs as number)
  const [taught, missed, upcoming, pendingWork, gradedWork] = await Promise.all([
    count('teaching-sessions', { status: { equals: 'taught' } }),
    count('teaching-sessions', { status: { equals: 'missed' } }),
    count('teaching-sessions', { and: [{ status: { equals: 'scheduled' } }, { day: { greater_than_equal: today } }] }),
    count('allocation-work', { status: { in: ['assigned', 'submitted'] } }),
    count('allocation-work', { status: { equals: 'graded' } }),
  ])

  return {
    id: a.id,
    status: a.status,
    subject: a.subject,
    allocatedAt: a.allocatedAt,
    notes: a.allocationNotes ?? null,
    timetable: Array.isArray(a.timetable) ? a.timetable.map((t: any) => ({ day: t.day, startTime: t.startTime, endTime: t.endTime })) : [],
    canRecord: WRITABLE.includes(a.status),
    student: {
      name: s.name,
      gender: s.studentGender ?? null,
      studentClass: s.studentClass,
      subjects: extractSubjectNames(s.subjects),
      customSubject: s.customSubject ?? null,
      locality: s.locality,
      customLocality: s.customLocality ?? null,
      preferredTiming: s.preferredTiming,
      learningNotes: s.learningNotes ?? null,
      // Contact details are shared only once the teacher has accepted.
      parentName: visible ? s.parentName ?? null : null,
      phoneNumber: visible ? s.phoneNumber ?? null : null,
    },
    assessment,
    stats: { taught, missed, upcoming, pendingWork, gradedWork },
  }
}

export async function setTimetable(payload: Payload, user: AuthUserRecord, id: number, body: Record<string, unknown>) {
  const a = await ownAllocation(payload, user, id)
  canWrite(a)
  const raw = body.slots
  if (!Array.isArray(raw)) throw bad('slots', 'slots must be a list.')
  if (raw.length > 14) throw bad('slots', 'At most 14 weekly slots.')
  const seen = new Set<string>()
  const slots = raw.map((s: any, i) => {
    if (!DAYS.includes(s?.day)) throw bad(`slots.${i}.day`, 'Choose a weekday.')
    if (!isTime(s?.startTime) || !isTime(s?.endTime)) throw bad(`slots.${i}.startTime`, 'Use HH:MM times.')
    if (s.endTime <= s.startTime) throw bad(`slots.${i}.endTime`, 'End time must be after the start time.')
    const key = `${s.day}-${s.startTime}`
    if (seen.has(key)) throw bad(`slots.${i}`, 'Duplicate slot.')
    seen.add(key)
    return { day: s.day, startTime: s.startTime, endTime: s.endTime }
  })
  await (payload as any).update({ collection: 'teacher-allocations', id, data: { timetable: slots }, overrideAccess: true })
  return { timetable: slots }
}

const serializeSession = (d: Record<string, any>) => ({ id: d.id, day: d.day, startTime: d.startTime, endTime: d.endTime, status: d.status, topic: d.topic ?? null, notes: d.notes ?? null })

/** Sessions of a month plus the recurring timetable slots that still have no logged class. */
export async function listSessions(payload: Payload, user: AuthUserRecord, id: number, month: string | null) {
  const a = await ownAllocation(payload, user, id)
  const now = new Date()
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const from = `${m}-01`
  const to = `${m}-31`
  const res = await (payload as any).find({
    collection: 'teaching-sessions',
    where: { and: [{ allocation: { equals: id } }, { day: { greater_than_equal: from } }, { day: { less_than_equal: to } }] },
    sort: 'day',
    limit: 200,
    depth: 0,
    overrideAccess: true,
  })
  const sessions = (res.docs as Record<string, any>[]).map(serializeSession)
  const logged = new Set(sessions.map((s) => `${s.day}-${s.startTime}`))
  const [y, mo] = m.split('-').map(Number)
  const planned: { day: string; startTime: string; endTime: string }[] = []
  const slots = (Array.isArray(a.timetable) ? a.timetable : []) as { day: string; startTime: string; endTime: string }[]
  const dim = new Date(y!, mo!, 0).getDate()
  for (let d = 1; d <= dim; d++) {
    const date = new Date(Date.UTC(y!, mo! - 1, d))
    const key = DAYS[(date.getUTCDay() + 6) % 7]
    for (const s of slots) {
      const day = `${m}-${String(d).padStart(2, '0')}`
      if (s.day === key && !logged.has(`${day}-${s.startTime}`)) planned.push({ day, startTime: s.startTime, endTime: s.endTime })
    }
  }
  return { month: m, sessions, planned, canRecord: WRITABLE.includes(a.status) }
}

function parseSession(body: Record<string, unknown>, partial: boolean) {
  const data: Record<string, unknown> = {}
  const need = (k: string) => !partial || body[k] !== undefined
  if (need('day')) { if (!isDay(body.day)) throw bad('day', 'Choose a valid date.'); data.day = body.day }
  if (need('startTime')) { if (!isTime(body.startTime)) throw bad('startTime', 'Use HH:MM.'); data.startTime = body.startTime }
  if (need('endTime')) { if (!isTime(body.endTime)) throw bad('endTime', 'Use HH:MM.'); data.endTime = body.endTime }
  if (body.status !== undefined) {
    if (!['scheduled', 'taught', 'missed', 'cancelled'].includes(String(body.status))) throw bad('status', 'Invalid status.')
    data.status = body.status
  }
  for (const k of ['topic', 'notes'] as const) {
    if (body[k] !== undefined) {
      if (typeof body[k] !== 'string' || (body[k] as string).length > (k === 'topic' ? 200 : 2000)) throw bad(k, `${k} is too long.`)
      data[k] = (body[k] as string).trim()
    }
  }
  return data
}

export async function createSession(payload: Payload, user: AuthUserRecord, id: number, body: Record<string, unknown>) {
  const a = await ownAllocation(payload, user, id)
  canWrite(a)
  const data = parseSession(body, false)
  if ((data.endTime as string) <= (data.startTime as string)) throw bad('endTime', 'End time must be after the start time.')
  const clash = await (payload as any).find({
    collection: 'teaching-sessions',
    where: { and: [{ allocation: { equals: id } }, { day: { equals: data.day } }, { startTime: { equals: data.startTime } }] },
    limit: 1, depth: 0, overrideAccess: true,
  })
  if (clash.docs.length > 0) throw new ServiceError('A class is already recorded for that day and time.', 409)
  const created = await (payload as any).create({ collection: 'teaching-sessions', data: { allocation: id, status: 'scheduled', ...data }, overrideAccess: true })
  return serializeSession(created)
}

async function ownSession(payload: Payload, user: AuthUserRecord, id: number, sid: number) {
  const a = await ownAllocation(payload, user, id)
  const s = (await (payload as any).findByID({ collection: 'teaching-sessions', id: sid, depth: 0, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!s || extractRelationId(s.allocation) !== id) throw new ServiceError('Class not found.', 404)
  return { a, s }
}

export async function updateSession(payload: Payload, user: AuthUserRecord, id: number, sid: number, body: Record<string, unknown>) {
  const { a, s } = await ownSession(payload, user, id, sid)
  canWrite(a)
  const data = parseSession(body, true)
  const start = (data.startTime ?? s.startTime) as string
  const end = (data.endTime ?? s.endTime) as string
  if (end <= start) throw bad('endTime', 'End time must be after the start time.')
  if (Object.keys(data).length === 0) throw bad('body', 'Nothing to update.')
  return serializeSession(await (payload as any).update({ collection: 'teaching-sessions', id: sid, data, overrideAccess: true }))
}

export async function deleteSession(payload: Payload, user: AuthUserRecord, id: number, sid: number) {
  const { a } = await ownSession(payload, user, id, sid)
  canWrite(a)
  await (payload as any).delete({ collection: 'teaching-sessions', id: sid, overrideAccess: true })
  return { id: sid }
}

const serializeWork = (d: Record<string, any>) => ({
  id: d.id, kind: d.kind, period: d.kind === 'test' ? d.period ?? 'other' : null, title: d.title, description: d.description ?? null, dueDate: d.dueDate ?? null, status: d.status,
  marks: d.marks ?? null, maxMarks: d.maxMarks ?? null, feedback: d.feedback ?? null, submittedAt: d.submittedAt ?? null, gradedAt: d.gradedAt ?? null, createdAt: d.createdAt,
})

export async function listWork(payload: Payload, user: AuthUserRecord, id: number) {
  await ownAllocation(payload, user, id)
  const res = await (payload as any).find({ collection: 'allocation-work', where: { allocation: { equals: id } }, sort: '-createdAt', limit: 200, depth: 0, overrideAccess: true })
  return { docs: (res.docs as Record<string, any>[]).map(serializeWork) }
}

function parseWork(body: Record<string, unknown>, existing?: Record<string, any>) {
  const data: Record<string, unknown> = {}
  if (body.kind !== undefined) { if (!['assignment', 'test'].includes(String(body.kind))) throw bad('kind', "kind must be 'assignment' or 'test'."); data.kind = body.kind }
  if (body.period !== undefined && body.period !== null) {
    if (!(testPeriods as readonly string[]).includes(String(body.period))) throw bad('period', "period must be 'weekly', 'monthly' or 'other'.")
    data.period = body.period
  }
  if (body.title !== undefined || !existing) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200) throw bad('title', 'Add a title (up to 200 characters).')
    data.title = body.title.trim()
  }
  if (body.description !== undefined) { if (typeof body.description !== 'string' || body.description.length > 3000) throw bad('description', 'Description is too long.'); data.description = body.description.trim() }
  if (body.dueDate !== undefined) { if (body.dueDate !== null && body.dueDate !== '' && !isDay(body.dueDate)) throw bad('dueDate', 'Choose a valid date.'); data.dueDate = body.dueDate || null }
  if (body.maxMarks !== undefined) { if (body.maxMarks !== null && (typeof body.maxMarks !== 'number' || body.maxMarks < 1)) throw bad('maxMarks', 'Maximum marks must be at least 1.'); data.maxMarks = body.maxMarks }
  if (body.feedback !== undefined) { if (typeof body.feedback !== 'string' || body.feedback.length > 2000) throw bad('feedback', 'Feedback is too long.'); data.feedback = body.feedback.trim() }
  if (body.marks !== undefined) { if (body.marks !== null && (typeof body.marks !== 'number' || body.marks < 0)) throw bad('marks', 'Marks must be 0 or more.'); data.marks = body.marks }
  if (body.status !== undefined) {
    if (!['assigned', 'submitted', 'graded', 'missed'].includes(String(body.status))) throw bad('status', 'Invalid status.')
    data.status = body.status
  }
  const max = (data.maxMarks ?? existing?.maxMarks) as number | undefined
  const marks = (data.marks ?? existing?.marks) as number | undefined
  if (typeof marks === 'number' && typeof max === 'number' && marks > max) throw bad('marks', 'Marks cannot be more than the maximum.')
  if (data.status === 'graded' && typeof marks !== 'number') throw bad('marks', 'Enter the marks to grade this.')
  if (data.status === 'submitted' && !existing?.submittedAt) data.submittedAt = new Date().toISOString()
  if (data.status === 'graded') data.gradedAt = new Date().toISOString()
  return data
}

export async function createWork(payload: Payload, user: AuthUserRecord, id: number, body: Record<string, unknown>) {
  const a = await ownAllocation(payload, user, id)
  canWrite(a)
  const data = parseWork(body)
  const created = await (payload as any).create({ collection: 'allocation-work', data: { allocation: id, kind: 'assignment', status: 'assigned', ...data }, overrideAccess: true })
  return serializeWork(created)
}

async function ownWork(payload: Payload, user: AuthUserRecord, id: number, wid: number) {
  const a = await ownAllocation(payload, user, id)
  const w = (await (payload as any).findByID({ collection: 'allocation-work', id: wid, depth: 0, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!w || extractRelationId(w.allocation) !== id) throw new ServiceError('Item not found.', 404)
  return { a, w }
}

export async function updateWork(payload: Payload, user: AuthUserRecord, id: number, wid: number, body: Record<string, unknown>) {
  const { a, w } = await ownWork(payload, user, id, wid)
  canWrite(a)
  const data = parseWork(body, w)
  if (Object.keys(data).length === 0) throw bad('body', 'Nothing to update.')
  return serializeWork(await (payload as any).update({ collection: 'allocation-work', id: wid, data, overrideAccess: true }))
}

export async function deleteWork(payload: Payload, user: AuthUserRecord, id: number, wid: number) {
  const { a } = await ownWork(payload, user, id, wid)
  canWrite(a)
  await (payload as any).delete({ collection: 'allocation-work', id: wid, overrideAccess: true })
  return { id: wid }
}
