import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as adminCreate } from '@/app/api/admin/enquiry-tests/route'
import { GET as adminGet, PATCH as adminPatch } from '@/app/api/admin/enquiry-tests/[id]/route'
import { GET as academicList } from '@/app/api/admin/academic-tests/route'
import { GET as myTests } from '@/app/api/teachers/me/tests/route'
import { GET as myTest, PATCH as saveResult } from '@/app/api/teachers/me/tests/[id]/route'
import { GET as allocationDetail } from '@/app/api/teacher-allocations/[id]/detail/route'
import { POST as createWork } from '@/app/api/teacher-allocations/[id]/work/route'
import { PATCH as updateWork } from '@/app/api/teacher-allocations/[id]/work/[wid]/route'

const TAG = `${Date.now()}`
const PASSWORD = 'TestFlowPass123!'
let payload: any
const tok: Record<string, string> = {}
const uid: Record<string, number> = {}
const made = { enquiry: 0, student: 0, teacherEnquiry: 0, profile: 0, alloc: 0, test: 0 }

const ctx = (id: number, extra: object = {}) => ({ params: Promise.resolve({ id: String(id), ...extra }) }) as any
const req = (who: string | null, method = 'GET', body?: unknown, url = 'http://localhost:3000/api/x') =>
  new Request(url, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
const j = async (r: Response) => ({ s: r.status, b: (await r.json()) as any })

const REPORT = {
  iqScore: 82,
  creativityScore: 64,
  academicScore: 45,
  extraScores: [{ label: 'Memory', score: 71 }, { label: 'Communication', score: 38 }],
  strengths: 'Curious',
  improvementAreas: 'Fractions',
  recommendation: 'Start with the basics, 5 hours a week.',
  hoursPerWeek: 5,
}

describe('physical test flow', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    for (const [key, role] of [['admin', 'super_admin'], ['tester', 'teacher'], ['other', 'teacher']] as const) {
      const email = `test-flow-${key}-${TAG}@example.com`
      const user = await payload.create({ collection: 'users', data: { email, password: PASSWORD, role, status: 'active' }, overrideAccess: true })
      uid[key] = user.id
      tok[key] = (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token
    }
    const e = await payload.create({ collection: 'student-enquiries', data: { name: `Flow Student ${TAG}`, phoneNumber: '9876533201', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], preferredTiming: 'Evening', locality: 'Kankarbagh', budgetRange: '3000-4000', agreedToPolicy: true }, overrideAccess: true })
    made.enquiry = e.id
    for (const enquiryStatus of ['contacted', 'in_progress']) await payload.update({ collection: 'student-enquiries', id: e.id, data: { enquiryStatus }, overrideAccess: true })

    const te = await payload.create({ collection: 'teacher-enquiries', data: { fullName: 'Flow Teacher', mobileNumber: '9876533202', email: `flow-teacher-enq-${TAG}@example.com`, highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-8', teachingLocality: 'Boring Road', preferredAvailability: 'Evenings', agreedToPolicy: true }, overrideAccess: true })
    made.teacherEnquiry = te.id
    const profile = await payload.create({ collection: 'teacher-profiles', data: { name: 'Flow Teacher', mobile: '9876533202', primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', approvalStatus: 'approved', user: uid.tester, teacherEnquiry: te.id }, overrideAccess: true })
    made.profile = profile.id
    const student = await payload.create({ collection: 'students', data: { name: `Flow Student ${TAG}`, phoneNumber: '9876533201', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], locality: 'Kankarbagh', preferredTiming: 'Evening', studentEnquiry: e.id }, overrideAccess: true })
    made.student = student.id
    const alloc = await payload.create({ collection: 'teacher-allocations', data: { student: student.id, teacher: profile.id, subject: 'Maths', status: 'accepted', allocatedBy: uid.admin, allocatedAt: new Date().toISOString(), monthlyFee: 3000, commissionPercent: 25, teacherPayout: 2250, commissionAmount: 750 }, overrideAccess: true })
    made.alloc = alloc.id
  })

  afterAll(async () => {
    const remove = (collection: string, where: object) => payload.delete({ collection, where, overrideAccess: true }).catch(() => undefined)
    await remove('allocation-work', { allocation: { equals: made.alloc } })
    await remove('teacher-allocations', { id: { equals: made.alloc } })
    await remove('enquiry-tests', { studentEnquiry: { equals: made.enquiry } })
    await remove('students', { id: { equals: made.student } })
    await remove('teacher-profiles', { id: { equals: made.profile } })
    await remove('teacher-enquiries', { id: { equals: made.teacherEnquiry } })
    await remove('student-enquiries', { id: { equals: made.enquiry } })
    await remove('users', { id: { in: Object.values(uid) } })
  })

  it('hides a test from the teacher until it is booked', async () => {
    const created = await j(await adminCreate(req('admin', 'POST', { studentEnquiryId: made.enquiry, mode: 'physical' })))
    expect(created.s).toBe(201)
    made.test = created.b.data.id
    await adminPatch(req('admin', 'PATCH', { paymentStatus: 'waived', tester: uid.tester }), ctx(made.test))
    expect((await j(await myTests(req('tester')))).b.data.docs.some((t: any) => t.id === made.test)).toBe(false)
    expect((await myTest(req('tester'), ctx(made.test))).status).toBe(404)

    const booked = await j(await adminPatch(req('admin', 'PATCH', { status: 'scheduled', scheduledAt: new Date(Date.now() + 3600000).toISOString(), venue: '12 Test Street' }), ctx(made.test)))
    expect(booked.b.data.status).toBe('scheduled')
  })

  it('shows it only to the allocated teacher, without payment details', async () => {
    const mine = await j(await myTests(req('tester')))
    const row = mine.b.data.docs.find((t: any) => t.id === made.test)
    expect(row).toMatchObject({ status: 'scheduled', venue: '12 Test Street', canEnterResult: true })
    expect(row.student.phoneNumber).toBeTruthy()
    expect(row.payment).toBeUndefined()
    expect(row.fee).toBeUndefined()

    expect((await j(await myTests(req('other')))).b.data.docs.some((t: any) => t.id === made.test)).toBe(false)
    expect((await myTest(req('other'), ctx(made.test))).status).toBe(404)
    expect((await saveResult(req('other', 'PATCH', { report: REPORT }), ctx(made.test))).status).toBe(404)
    expect((await myTests(req(null))).status).toBe(401)
    expect((await myTests(req('admin'))).status).toBe(403)
  })

  it('does not let staff enter the result of a physical test', async () => {
    expect((await adminPatch(req('admin', 'PATCH', { report: REPORT }), ctx(made.test))).status).toBe(409)
    expect((await adminPatch(req('admin', 'PATCH', { status: 'report_ready' }), ctx(made.test))).status).toBe(409)
  })

  it('lets the teacher save a draft, then submit a complete result once', async () => {
    const invalid = [{ iqScore: 101 }, { extraScores: [{ label: '', score: 10 }] }, { extraScores: [{ label: 'Memory', score: -1 }] }, { extraScores: Array.from({ length: 11 }, (_, i) => ({ label: `S${i}`, score: 1 })) }]
    for (const report of invalid) expect((await saveResult(req('tester', 'PATCH', { report }), ctx(made.test))).status).toBe(400)

    const draft = await j(await saveResult(req('tester', 'PATCH', { report: { iqScore: 82, extraScores: REPORT.extraScores } }), ctx(made.test)))
    expect(draft.s).toBe(200)
    expect(draft.b.data.status).toBe('conducted')
    expect(draft.b.data.conductedAt).toBeTruthy()
    expect(draft.b.data.report.extraScores).toHaveLength(2)

    expect((await saveResult(req('tester', 'PATCH', { submit: true }), ctx(made.test))).status).toBe(400)

    const done = await j(await saveResult(req('tester', 'PATCH', { report: REPORT, submit: true }), ctx(made.test)))
    expect(done.s).toBe(200)
    expect(done.b.data).toMatchObject({ status: 'report_ready', canEnterResult: false })
    expect(done.b.data.student.phoneNumber).toBeNull()
    expect(done.b.data.report.extraScores[0]).toEqual({ label: 'Memory', score: 71, level: 'good' })

    expect((await saveResult(req('tester', 'PATCH', { report: { iqScore: 10 } }), ctx(made.test))).status).toBe(409)

    const staff = await j(await adminGet(req('admin'), ctx(made.test)))
    expect(staff.b.data.report).toMatchObject({ iqScore: 82, recommendation: REPORT.recommendation })
    expect(staff.b.data.report.extraScores).toHaveLength(2)
  })

  it('shows the entry result to the teacher who teaches the student', async () => {
    const d = await j(await allocationDetail(req('tester'), ctx(made.alloc)))
    expect(d.s).toBe(200)
    expect(d.b.data.assessment.report.extraScores.map((x: any) => x.label)).toEqual(['Memory', 'Communication'])
  })

  it('records weekly and monthly academic tests and shows them to staff', async () => {
    const add = (body: object) => createWork(req('tester', 'POST', body), ctx(made.alloc))
    expect((await add({ kind: 'test', title: 'Bad period', period: 'daily' })).status).toBe(400)
    const weekly = await j(await add({ kind: 'test', title: 'Week 1: Fractions', period: 'weekly', dueDate: '2026-11-27', maxMarks: 20 }))
    expect(weekly.s).toBe(201)
    expect(weekly.b.data.period).toBe('weekly')
    const monthly = await j(await add({ kind: 'test', title: 'November test', period: 'monthly', maxMarks: 50 }))
    const plain = await j(await add({ kind: 'test', title: 'Surprise test' }))
    expect(plain.b.data.period).toBe('other')
    const homework = await j(await add({ kind: 'assignment', title: 'Homework' }))
    expect(homework.b.data.period).toBeNull()

    const graded = await updateWork(req('tester', 'PATCH', { status: 'graded', marks: 15 }), ctx(made.alloc, { wid: String(weekly.b.data.id) }))
    expect(graded.status).toBe(200)

    const list = async (query = '') => (await j(await academicList(req('admin', 'GET', undefined, `http://localhost:3000/api/admin/academic-tests?limit=100${query}`)))).b.data.docs as any[]
    const ids = async (query = '') => (await list(query)).map((x) => x.id)
    const all = await list()
    expect(all.some((x) => x.id === homework.b.data.id)).toBe(false)
    expect(all.find((x) => x.id === weekly.b.data.id)).toMatchObject({ period: 'weekly', marks: 15, maxMarks: 20, percentage: 75, testDate: '2026-11-27', subject: 'Maths', teacher: { name: 'Flow Teacher' } })
    expect(await ids('&period=monthly')).toContain(monthly.b.data.id)
    expect(await ids('&period=monthly')).not.toContain(weekly.b.data.id)
    expect(await ids('&period=other')).toContain(plain.b.data.id)

    expect((await academicList(req('tester', 'GET', undefined, 'http://localhost:3000/api/admin/academic-tests'))).status).toBe(403)
    expect((await academicList(req(null, 'GET', undefined, 'http://localhost:3000/api/admin/academic-tests'))).status).toBe(401)
  })
})
