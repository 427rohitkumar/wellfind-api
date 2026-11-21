import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as detailGET } from '@/app/api/teacher-allocations/[id]/detail/route'
import { PUT as timetablePUT } from '@/app/api/teacher-allocations/[id]/timetable/route'
import { GET as sessionsGET, POST as sessionsPOST } from '@/app/api/teacher-allocations/[id]/sessions/route'
import { PATCH as sessionPATCH, DELETE as sessionDELETE } from '@/app/api/teacher-allocations/[id]/sessions/[sid]/route'
import { GET as workGET, POST as workPOST } from '@/app/api/teacher-allocations/[id]/work/route'
import { PATCH as workPATCH } from '@/app/api/teacher-allocations/[id]/work/[wid]/route'

const PASSWORD = 'TeachSpecPass123!'
const T1 = 'teach-spec-1@example.com'
const T2 = 'teach-spec-2@example.com'
let payload: any
const tok: Record<string, string> = {}
const ids: { users: number[]; profiles: number[]; enquiries: number[]; student: number; alloc: number } = { users: [], profiles: [], enquiries: [], student: 0, alloc: 0 }

const ctx = (p: Record<string, string | number>) => ({ params: Promise.resolve(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]))) })
const req = (who: string, method = 'GET', body?: unknown, url = 'http://localhost:3000/api/x') =>
  new Request(url, { method, headers: { Authorization: `Bearer ${tok[who]}`, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
const j = async (r: Response) => ({ s: r.status, b: (await r.json()) as any })

async function mkTeacher(email: string, mobile: string) {
  const u = await payload.create({ collection: 'users', data: { email, password: PASSWORD, role: 'teacher', status: 'active' }, overrideAccess: true })
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: { fullName: email, mobileNumber: mobile, email: `enq-${email}`, highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-8', teachingLocality: 'Boring Road', preferredAvailability: 'Evenings', agreedToPolicy: true },
    overrideAccess: true,
  })
  const p = await payload.create({
    collection: 'teacher-profiles',
    data: { name: email, mobile, primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', approvalStatus: 'approved', user: u.id, teacherEnquiry: e.id },
    overrideAccess: true,
  })
  ids.users.push(u.id)
  ids.profiles.push(p.id)
  ids.enquiries.push(e.id)
  tok[email] = (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token
  return { u, p }
}

describe('teacher: my students', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const t1 = await mkTeacher(T1, '9876511001')
    await mkTeacher(T2, '9876511002')
    const s = await payload.create({
      collection: 'students',
      data: { name: 'Teach Spec Student', phoneNumber: '9876511003', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], locality: 'Kankarbagh', preferredTiming: 'Evening', parentName: 'Parent Spec', learningNotes: 'Weak in fractions' },
      overrideAccess: true,
    })
    ids.student = s.id
    const a = await payload.create({
      collection: 'teacher-allocations',
      data: { student: s.id, teacher: t1.p.id, subject: 'Maths', status: 'assigned', allocatedBy: t1.u.id, allocatedAt: new Date().toISOString() },
      overrideAccess: true,
    })
    ids.alloc = a.id
  })
  afterAll(async () => {
    for (const col of ['teaching-sessions', 'allocation-work']) await payload.delete({ collection: col, where: { allocation: { equals: ids.alloc } }, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-allocations', id: ids.alloc, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'students', id: ids.student, overrideAccess: true }).catch(() => undefined)
    for (const id of ids.profiles) await payload.delete({ collection: 'teacher-profiles', id, overrideAccess: true }).catch(() => undefined)
    for (const id of ids.enquiries) await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => undefined)
    for (const id of ids.users) await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  })

  it('hides contact until accepted and refuses other teachers', async () => {
    const d = await j(await detailGET(req(T1), ctx({ id: ids.alloc })))
    expect(d.s).toBe(200)
    expect(d.b.data.student.name).toBe('Teach Spec Student')
    expect(d.b.data.student.phoneNumber).toBeNull()
    expect(d.b.data.canRecord).toBe(false)
    expect((await j(await detailGET(req(T2), ctx({ id: ids.alloc })))).s).toBe(404)
    const early = await j(await sessionsPOST(req(T1, 'POST', { day: '2026-12-01', startTime: '17:00', endTime: '18:00' }), ctx({ id: ids.alloc })))
    expect(early.s).toBe(409)
  })

  it('timetable, calendar and work after acceptance', { timeout: 30000 }, async () => {
    await payload.update({ collection: 'teacher-allocations', id: ids.alloc, data: { status: 'accepted' }, overrideAccess: true })
    const d = await j(await detailGET(req(T1), ctx({ id: ids.alloc })))
    expect(d.b.data.student.phoneNumber).toBe('9876511003')

    expect((await j(await timetablePUT(req(T1, 'PUT', { slots: [{ day: 'mon', startTime: '18:00', endTime: '17:00' }] }), ctx({ id: ids.alloc })))).s).toBe(400)
    const tt = await j(await timetablePUT(req(T1, 'PUT', { slots: [{ day: 'mon', startTime: '17:00', endTime: '18:00' }, { day: 'thu', startTime: '17:00', endTime: '18:00' }] }), ctx({ id: ids.alloc })))
    expect(tt.s).toBe(200)

    // 2026-12-07 is a Monday: planned from the timetable until a class is logged
    const month = () => new Request('http://localhost:3000/api/x?month=2026-12', { headers: { Authorization: `Bearer ${tok[T1]}` } })
    const cal = await j(await sessionsGET(month(), ctx({ id: ids.alloc })))
    expect(cal.b.data.planned.some((p: any) => p.day === '2026-12-07')).toBe(true)

    const made = await j(await sessionsPOST(req(T1, 'POST', { day: '2026-12-07', startTime: '17:00', endTime: '18:00', status: 'taught', topic: 'Fractions' }), ctx({ id: ids.alloc })))
    expect(made.s).toBe(201)
    expect((await j(await sessionsPOST(req(T1, 'POST', { day: '2026-12-07', startTime: '17:00', endTime: '18:00' }), ctx({ id: ids.alloc })))).s).toBe(409)
    const cal2 = await j(await sessionsGET(month(), ctx({ id: ids.alloc })))
    expect(cal2.b.data.planned.some((p: any) => p.day === '2026-12-07')).toBe(false)
    expect(cal2.b.data.sessions).toHaveLength(1)
    const upd = await j(await sessionPATCH(req(T1, 'PATCH', { status: 'missed' }), ctx({ id: ids.alloc, sid: made.b.data.id })))
    expect(upd.b.data.status).toBe('missed')
    expect((await j(await sessionPATCH(req(T2, 'PATCH', { status: 'taught' }), ctx({ id: ids.alloc, sid: made.b.data.id })))).s).toBe(404)
    expect((await j(await sessionDELETE(req(T1, 'DELETE'), ctx({ id: ids.alloc, sid: made.b.data.id })))).s).toBe(200)

    const w = await j(await workPOST(req(T1, 'POST', { kind: 'test', title: 'Fractions test', maxMarks: 20, dueDate: '2026-12-10' }), ctx({ id: ids.alloc })))
    expect(w.s).toBe(201)
    expect((await j(await workPATCH(req(T1, 'PATCH', { status: 'graded' }), ctx({ id: ids.alloc, wid: w.b.data.id })))).s).toBe(400)
    expect((await j(await workPATCH(req(T1, 'PATCH', { status: 'graded', marks: 25 }), ctx({ id: ids.alloc, wid: w.b.data.id })))).s).toBe(400)
    const g = await j(await workPATCH(req(T1, 'PATCH', { status: 'graded', marks: 16, feedback: 'Good' }), ctx({ id: ids.alloc, wid: w.b.data.id })))
    expect(g.b.data.marks).toBe(16)
    const list = await j(await workGET(req(T1), ctx({ id: ids.alloc })))
    expect(list.b.data.docs).toHaveLength(1)
    const d2 = await j(await detailGET(req(T1), ctx({ id: ids.alloc })))
    expect(d2.b.data.stats.gradedWork).toBe(1)
    expect(d2.b.data.timetable).toHaveLength(2)
  })

  it('completed allocations are read-only', async () => {
    await payload.update({ collection: 'teacher-allocations', id: ids.alloc, data: { status: 'completed' }, overrideAccess: true })
    expect((await j(await workPOST(req(T1, 'POST', { title: 'x' }), ctx({ id: ids.alloc })))).s).toBe(409)
    expect((await j(await workGET(req(T1), ctx({ id: ids.alloc })))).s).toBe(200)
  })
})
