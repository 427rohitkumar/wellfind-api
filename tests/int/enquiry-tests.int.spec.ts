import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as listRoute, POST as createRoute } from '@/app/api/admin/enquiry-tests/route'
import { GET as getRoute, PATCH as patchRoute } from '@/app/api/admin/enquiry-tests/[id]/route'
import { GET as testersRoute } from '@/app/api/admin/enquiry-tests/testers/route'

const TAG = `${Date.now()}`
const PASSWORD = 'TestSpecPass123!'
const ADMIN_EMAIL = 'enq-test-spec-admin@example.com'

let payload: any
let token = ''
let adminId = 0
let teacherId = 0
const enquiryIds: number[] = []
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

function req(method = 'GET', body?: unknown, url = 'http://localhost:3000/api/x', auth = true): Request {
  return new Request(url, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
const json = async (r: Response) => ({ status: r.status, body: (await r.json()) as any })

async function makeEnquiry(label: string, status: 'new' | 'in_progress' = 'in_progress') {
  const e = await payload.create({
    collection: 'student-enquiries',
    data: { name: `TestSpec ${label} ${TAG}`, phoneNumber: '9876500000', studentClass: 'Class 8', subjects: [{ subject: 'Maths' }], preferredTiming: 'Weekday evenings', locality: 'Central London', budgetRange: 'GBP 30-50 per hour', agreedToPolicy: true },
    overrideAccess: true,
  })
  enquiryIds.push(e.id)
  if (status === 'in_progress') {
    await payload.update({ collection: 'student-enquiries', id: e.id, data: { enquiryStatus: 'contacted' }, overrideAccess: true })
    await payload.update({ collection: 'student-enquiries', id: e.id, data: { enquiryStatus: 'in_progress' }, overrideAccess: true })
  }
  return e.id as number
}

describe('Enquiry tests module', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const ex = await payload.find({ collection: 'users', where: { email: { equals: ADMIN_EMAIL } }, limit: 1, overrideAccess: true })
    const u = ex.docs[0] ?? (await payload.create({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD, role: 'super_admin', status: 'active' }, overrideAccess: true }))
    adminId = u.id
    token = (await payload.login({ collection: 'users', data: { email: ADMIN_EMAIL, password: PASSWORD } })).token
  })

  afterAll(async () => {
    for (const id of enquiryIds) {
      await payload.delete({ collection: 'enquiry-tests', where: { studentEnquiry: { equals: id } }, overrideAccess: true }).catch(() => undefined)
      await payload.delete({ collection: 'student-enquiries', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const id of [adminId, teacherId]) if (id) await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => undefined)
  })

  it('requires an admin', async () => {
    expect((await json(await listRoute(req('GET', undefined, undefined, false)))).status).toBe(401)
  })

  it('rejects a test for an enquiry that is not verified yet', async () => {
    const id = await makeEnquiry('early', 'new')
    const r = await json(await createRoute(req('POST', { studentEnquiryId: id, mode: 'digital' })))
    expect(r.status).toBe(409)
  })

  it('runs a digital test from request to report and prevents a duplicate', async () => {
    const eid = await makeEnquiry('digital')
    const created = await json(await createRoute(req('POST', { studentEnquiryId: eid, mode: 'digital' })))
    expect(created.status).toBe(201)
    const t = created.body.data
    expect(t.fee).toBe(49)
    expect(t.status).toBe('requested')
    expect(t.payment.status).toBe('pending')

    const enquiry = await payload.findByID({ collection: 'student-enquiries', id: eid, overrideAccess: true })
    expect(enquiry.enquiryStatus).toBe('test')

    expect((await json(await createRoute(req('POST', { studentEnquiryId: eid, mode: 'physical' })))).status).toBe(409)

    // scheduling is blocked until payment is paid or waived
    const when = new Date(Date.now() + 86400000).toISOString()
    const blocked = await json(await patchRoute(req('PATCH', { status: 'scheduled', scheduledAt: when }), ctx(t.id)))
    expect(blocked.status).toBe(409)

    expect((await json(await patchRoute(req('PATCH', { paymentStatus: 'paid' }), ctx(t.id)))).body.data.payment.status).toBe('paid')
    // mode can no longer change once paid
    expect((await json(await patchRoute(req('PATCH', { mode: 'physical' }), ctx(t.id)))).status).toBe(409)

    const sched = await json(await patchRoute(req('PATCH', { status: 'scheduled', scheduledAt: when }), ctx(t.id)))
    expect(sched.body.data.status).toBe('scheduled')

    // cannot finish the report without scores
    expect((await json(await patchRoute(req('PATCH', { status: 'conducted' }), ctx(t.id)))).body.data.status).toBe('conducted')
    const noScores = await json(await patchRoute(req('PATCH', { status: 'report_ready' }), ctx(t.id)))
    expect(noScores.status).toBe(400)

    const bad = await json(await patchRoute(req('PATCH', { report: { iqScore: 140 } }), ctx(t.id)))
    expect(bad.status).toBe(400)

    const done = await json(
      await patchRoute(
        req('PATCH', {
          report: { iqScore: 85, creativityScore: 62, academicScore: 45, recommendation: 'Needs 5 hours a week of foundation work.' },
          status: 'report_ready',
        }),
        ctx(t.id),
      ),
    )
    expect(done.status).toBe(200)
    expect(done.body.data.status).toBe('report_ready')
    expect(done.body.data.report.iqLevel).toBe('excellent')
    expect(done.body.data.report.creativityLevel).toBe('good')
    expect(done.body.data.report.academicLevel).toBe('average')

    // a finished test is locked
    expect((await json(await patchRoute(req('PATCH', { paymentStatus: 'pending' }), ctx(t.id)))).status).toBe(409)

    const got = await json(await getRoute(req(), ctx(t.id)))
    expect(got.body.data.student.name).toContain('TestSpec')
    const list = await json(await listRoute(req('GET', undefined, 'http://localhost:3000/api/x?status=report_ready')))
    expect(list.body.data.docs.some((d: any) => d.id === t.id)).toBe(true)
    expect(list.body.data.counts.reportReady).toBeGreaterThan(0)
  })

  it('requires a tester and venue for a physical test', async () => {
    const eid = await makeEnquiry('physical')
    const t = (await json(await createRoute(req('POST', { studentEnquiryId: eid, mode: 'physical' })))).body.data
    expect(t.fee).toBe(99)
    await patchRoute(req('PATCH', { paymentStatus: 'waived' }), ctx(t.id))
    const when = new Date(Date.now() + 86400000).toISOString()
    const noTester = await json(await patchRoute(req('PATCH', { status: 'scheduled', scheduledAt: when }), ctx(t.id)))
    expect(noTester.status).toBe(400)

    // only teachers can take a physical test
    const teacher = await payload.create({ collection: 'users', data: { email: `enq-test-spec-teacher-${TAG}@example.com`, password: PASSWORD, role: 'teacher', status: 'active' }, overrideAccess: true })
    teacherId = teacher.id
    const testers = await json(await testersRoute(req()))
    expect(testers.body.data.docs.some((x: any) => x.id === teacher.id)).toBe(true)
    expect(testers.body.data.docs.some((x: any) => x.id === adminId)).toBe(false)
    expect((await json(await patchRoute(req('PATCH', { tester: adminId }), ctx(t.id)))).status).toBe(400)

    const ok = await json(await patchRoute(req('PATCH', { tester: teacher.id, venue: '12 Test Street', status: 'scheduled', scheduledAt: when }), ctx(t.id)))
    expect(ok.status).toBe(200)
    expect(ok.body.data.tester.id).toBe(teacher.id)
    const enquiry = await payload.findByID({ collection: 'student-enquiries', id: eid, overrideAccess: true })
    expect(enquiry.testVenue).toBe('12 Test Street')
  })
})
