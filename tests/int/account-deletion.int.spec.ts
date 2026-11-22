import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as deletePOST } from '@/app/api/account/delete/route'
import { POST as requestPOST } from '@/app/api/data-deletion-requests/route'
import { GET as adminListGET } from '@/app/api/admin/data-deletion-requests/route'
import { POST as processPOST } from '@/app/api/admin/data-deletion-requests/[id]/process/route'
import { POST as rejectPOST } from '@/app/api/admin/data-deletion-requests/[id]/reject/route'
import { POST as loginPOST } from '@/app/api/auth/login/route'

const TAG = `delspec${Date.now()}`
const PASSWORD = 'DeleteSpec123!'
const email = (n: string) => `${TAG}-${n}@example.com`
let payload: any
const tok: Record<string, string> = {}
const ids = { users: [] as number[], enquiries: [] as number[], profiles: [] as number[], students: [] as number[], studentEnquiries: [] as number[], payments: [] as number[], allocations: [] as number[] }

const R = (who: string | null, path: string, body?: unknown, method = 'POST') =>
  new Request(`http://localhost:3000${path}`, {
    method,
    headers: { ...(who ? { Authorization: `Bearer ${tok[who]}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
let ipCounter = 0
/** Public request from a fresh IP, so the per-IP rate limit does not interfere with unrelated tests. */
const PUB = (body: unknown) =>
  new Request('http://localhost:3000/x', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${++ipCounter}` }, body: JSON.stringify(body) })
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
const j = async (r: Response) => ({ s: r.status, b: (await r.json()) as any })

async function mkUser(name: string, role: string) {
  const u = await payload.create({ collection: 'users', data: { email: email(name), password: PASSWORD, role, status: 'active', fullName: `Spec ${name}`, phone: '9811111111' }, overrideAccess: true })
  ids.users.push(u.id)
  tok[name] = (await payload.login({ collection: 'users', data: { email: email(name), password: PASSWORD } })).token
  return u
}

/** A teacher with an application, a profile, a payment and a notification. */
async function mkTeacher(name: string, phone: string) {
  const u = await mkUser(name, 'teacher')
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: { fullName: `Teacher ${name}`, mobileNumber: phone, email: email(name), highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-10', teachingLocality: 'Patna', preferredAvailability: 'Evening', additionalNotes: 'secret note', agreedToPolicy: true, teacherUser: u.id },
    overrideAccess: true,
  })
  ids.enquiries.push(e.id)
  const p = await payload.create({
    collection: 'teacher-profiles',
    data: { name: `Teacher ${name}`, email: email(name), mobile: phone, primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', about: 'about me', approvalStatus: 'approved', user: u.id, teacherEnquiry: e.id },
    overrideAccess: true,
  })
  ids.profiles.push(p.id)
  const pay = await payload.create({
    collection: 'payments',
    data: { category: 'teacher_registration', status: 'paid', amount: 1000, currency: 'INR', gateway: 'razorpay', mode: 'test', receipt: `rcpt-${TAG}-${name}`, payerName: `Teacher ${name}`, payerEmail: email(name), payerPhone: phone, payerUser: u.id, teacherEnquiry: e.id },
    overrideAccess: true,
  })
  ids.payments.push(pay.id)
  await payload.create({ collection: 'notifications', data: { user: u.id, type: 'application_status', title: 't', body: 'b' }, overrideAccess: true })
  return { u, e, p, pay }
}

describe('account and data deletion', { timeout: 120000 }, () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    await mkUser('admin', 'super_admin')
    await mkUser('counselor', 'student_counselor')
    await mkUser('finance', 'finance_manager')
  })

  afterAll(async () => {
    const del = (collection: string, list: number[]) => Promise.all(list.map(id => payload.delete({ collection, id, overrideAccess: true }).catch(() => undefined)))
    await del('teacher-allocations', ids.allocations)
    await del('payments', ids.payments)
    await del('teacher-profiles', ids.profiles)
    await del('teacher-enquiries', ids.enquiries)
    await del('students', ids.students)
    await del('student-enquiries', ids.studentEnquiries)
    await payload.delete({ collection: 'data-deletion-requests', where: { or: [{ email: { contains: TAG } }, { source: { equals: 'app' } }] }, overrideAccess: true }).catch(() => undefined)
    await del('users', ids.users)
  })

  describe('in-app deletion (POST /api/account/delete)', () => {
    it('needs a signed-in user, the typed confirmation and the right password', async () => {
      const t = await mkTeacher('t-guard', '9822000001')
      expect((await deletePOST(R(null, '/x', { password: PASSWORD, confirm: 'DELETE' }))).status).toBe(401)
      expect((await deletePOST(R('t-guard', '/x', { password: PASSWORD, confirm: 'delete' }))).status).toBe(400)
      expect((await deletePOST(R('t-guard', '/x', { confirm: 'DELETE' }))).status).toBe(400)
      expect((await deletePOST(R('t-guard', '/x', { password: 'WrongPass123!', confirm: 'DELETE' }))).status).toBe(401)
      const still = await payload.findByID({ collection: 'users', id: t.u.id, overrideAccess: true })
      expect(still.email).toBe(email('t-guard'))
      expect(still.deletedAt).toBeFalsy()
    })

    it('anonymises a teacher, removes their app data and keeps the payment record', async () => {
      const t = await mkTeacher('t-ok', '9822000002')
      await payload.create({ collection: 'user-devices', data: { user: t.u.id, fcmToken: `fcm-${TAG}-` + 'x'.repeat(40), platform: 'android', environment: 'development' }, overrideAccess: true })
      const r = await j(await deletePOST(R('t-ok', '/x', { password: PASSWORD, confirm: 'DELETE' })))
      expect(r.s).toBe(200)
      expect(r.b.data.deleted).toBe(true)

      const user = await payload.findByID({ collection: 'users', id: t.u.id, overrideAccess: true })
      expect(user.email).toMatch(/@deleted\.invalid$/)
      expect(user.fullName).toBe('Deleted user')
      expect(user.phone).toBeFalsy()
      expect(user.status).toBe('blocked')
      expect(user.deletedAt).toBeTruthy()

      const profile = await payload.findByID({ collection: 'teacher-profiles', id: t.p.id, overrideAccess: true })
      expect(profile.name).toBe('Deleted teacher')
      expect(profile.mobile).toBe('0000000000')
      expect(profile.email).toMatch(/@deleted\.invalid$/)
      expect(profile.about).toBeFalsy()

      const enquiry = await payload.findByID({ collection: 'teacher-enquiries', id: t.e.id, overrideAccess: true })
      expect(enquiry.fullName).toBe('Deleted teacher')
      expect(enquiry.additionalNotes).toBeFalsy()

      // accounting data stays, the person does not
      const pay = await payload.findByID({ collection: 'payments', id: t.pay.id, overrideAccess: true })
      expect(pay.amount).toBe(1000)
      expect(pay.payerEmail).toBeFalsy()
      expect(pay.payerPhone).toBeFalsy()
      expect(pay.payerName).toBe('Deleted user')

      expect((await payload.find({ collection: 'notifications', where: { user: { equals: t.u.id } }, overrideAccess: true })).totalDocs).toBe(0)
      expect((await payload.find({ collection: 'user-devices', where: { user: { equals: t.u.id } }, overrideAccess: true })).totalDocs).toBe(0)

      // the old token no longer works, and the old credentials cannot sign in
      expect((await deletePOST(R('t-ok', '/x', { password: PASSWORD, confirm: 'DELETE' }))).status).toBeGreaterThanOrEqual(401)
      const login = await loginPOST(R(null, '/api/auth/login', { email: email('t-ok'), password: PASSWORD }))
      expect(login.status).toBeGreaterThanOrEqual(400)

      const log = await payload.find({ collection: 'data-deletion-requests', where: { and: [{ source: { equals: 'app' } }, { requesterType: { equals: 'teacher' } }] }, sort: '-createdAt', limit: 1, overrideAccess: true })
      expect(log.docs[0]?.status).toBe('completed')
      expect(JSON.stringify(log.docs[0])).not.toContain(email('t-ok'))
    })

    it('does not delete a teacher who still has active students', async () => {
      const t = await mkTeacher('t-busy', '9822000003')
      const s = await payload.create({
        collection: 'students',
        data: { name: 'Busy Spec Student', phoneNumber: '9822000099', studentClass: 'Class 7', subjects: [{ subject: 'Maths' }], locality: 'Kankarbagh', preferredTiming: 'Evening', parentName: 'Busy Parent' },
        overrideAccess: true,
      })
      ids.students.push(s.id)
      const a = await payload.create({ collection: 'teacher-allocations', data: { student: s.id, teacher: t.p.id, subject: 'Maths', status: 'active', allocatedBy: t.u.id, allocatedAt: new Date().toISOString() }, overrideAccess: true })
      ids.allocations.push(a.id)
      const r = await j(await deletePOST(R('t-busy', '/x', { password: PASSWORD, confirm: 'DELETE' })))
      expect(r.s).toBe(409)
      const user = await payload.findByID({ collection: 'users', id: t.u.id, overrideAccess: true })
      expect(user.email).toBe(email('t-busy'))
      expect(user.status).toBe('active')
    })

    it('lets staff delete themselves but never a super admin', async () => {
      expect((await deletePOST(R('admin', '/x', { password: PASSWORD, confirm: 'DELETE' }))).status).toBe(403)
      const r = await j(await deletePOST(R('counselor', '/x', { password: PASSWORD, confirm: 'DELETE' })))
      expect(r.s).toBe(200)
      const user = await payload.findByID({ collection: 'users', id: (await payload.find({ collection: 'users', where: { deletedAt: { exists: true } }, limit: 50, overrideAccess: true })).docs.find((d: any) => d.role === 'student_counselor' && d.fullName === 'Deleted user')?.id, overrideAccess: true })
      expect(user.email).toMatch(/@deleted\.invalid$/)
    })
  })

  describe('public request (POST /api/data-deletion-requests) and admin processing', () => {
    it('validates input and ignores bots', async () => {
      expect((await requestPOST(PUB({ requesterType: 'student_parent' }))).status).toBe(400)
      expect((await requestPOST(PUB({ email: 'nope' }))).status).toBe(400)
      expect((await requestPOST(PUB({ phone: '123' }))).status).toBe(400)
      const before = (await payload.find({ collection: 'data-deletion-requests', where: { source: { equals: 'web' } }, overrideAccess: true })).totalDocs
      const bot = await j(await requestPOST(PUB({ email: email('bot'), website: 'http://spam' })))
      expect(bot.s).toBe(201)
      expect((await payload.find({ collection: 'data-deletion-requests', where: { source: { equals: 'web' } }, overrideAccess: true })).totalDocs).toBe(before)
    })

    it('records a request once, and a super admin processes it: student and parent data is anonymised', async () => {
      const s = await payload.create({
        collection: 'students',
        data: { name: 'Request Spec Student', parentName: 'Request Parent', phoneNumber: '9833000001', alternatePhoneNumber: '9833000002', parentEmail: email('parent'), studentClass: 'Class 5', subjects: [{ subject: 'Maths' }], locality: 'Danapur', preferredTiming: 'Evening', learningNotes: 'private notes' },
        overrideAccess: true,
      })
      ids.students.push(s.id)
      const enq = await payload.create({
        collection: 'student-enquiries',
        data: { name: 'Request Spec Student', phoneNumber: '9833000001', studentClass: 'Class 5', subjects: [{ subject: 'Maths' }], locality: 'Danapur', preferredTiming: 'Evening', budgetRange: 'GBP 30-50 per hour', agreedToPolicy: true, additionalNotes: 'call after 6' },
        overrideAccess: true,
      })
      ids.studentEnquiries.push(enq.id)

      const first = await j(await requestPOST(PUB({ fullName: 'Request Parent', email: email('parent'), phone: '+91 98330 00001', requesterType: 'student_parent' })))
      expect(first.s).toBe(201)
      expect(first.b.data.reference).toMatch(/^DDR-\d+$/)
      const again = await j(await requestPOST(PUB({ email: email('parent'), requesterType: 'student_parent' })))
      expect(again.b.data.reference).toBe(first.b.data.reference)

      // not an admin: refused
      const requestId = Number(first.b.data.reference.replace('DDR-', ''))
      expect((await adminListGET(R('finance', '/x', undefined, 'GET'))).status).toBe(403)
      expect((await processPOST(R(null, '/x'), ctx(requestId))).status).toBe(401)

      const list = await j(await adminListGET(R('admin', '/x', undefined, 'GET')))
      expect(list.s).toBe(200)
      expect(list.b.data.requests.some((r: any) => r.id === requestId)).toBe(true)

      const done = await j(await processPOST(R('admin', '/x'), ctx(requestId)))
      expect(done.s).toBe(200)
      expect(done.b.data.summary.students).toBeGreaterThanOrEqual(1)
      expect(done.b.data.summary.studentEnquiries).toBeGreaterThanOrEqual(1)

      const student = await payload.findByID({ collection: 'students', id: s.id, overrideAccess: true })
      expect(student.name).toBe('Deleted student')
      expect(student.parentName).toBe('Deleted parent')
      expect(student.phoneNumber).toBe('0000000000')
      expect(student.parentEmail).toBeFalsy()
      expect(student.alternatePhoneNumber).toBeFalsy()
      expect(student.learningNotes).toBeFalsy()
      expect(student.studentClass).toBe('Class 5')

      const enquiry = await payload.findByID({ collection: 'student-enquiries', id: enq.id, overrideAccess: true })
      expect(enquiry.name).toBe('Deleted student')
      expect(enquiry.phoneNumber).toBe('0000000000')

      const closed = await payload.findByID({ collection: 'data-deletion-requests', id: requestId, overrideAccess: true })
      expect(closed.status).toBe('completed')
      expect(closed.email).toBeFalsy()
      expect(closed.phone).toBeFalsy()
      expect((await processPOST(R('admin', '/x'), ctx(requestId))).status).toBe(409)
    })

    it('can reject a request that could not be verified', async () => {
      const r = await j(await requestPOST(PUB({ email: email('reject'), requesterType: 'other' })))
      const id = Number(r.b.data.reference.replace('DDR-', ''))
      expect((await rejectPOST(R('admin', '/x', {}), ctx(id))).status).toBe(400)
      expect((await rejectPOST(R('admin', '/x', { reason: 'Could not verify the requester' }), ctx(id))).status).toBe(200)
      const row = await payload.findByID({ collection: 'data-deletion-requests', id, overrideAccess: true })
      expect(row.status).toBe('rejected')
      expect(row.email).toBeFalsy()
    })
  })
})
