import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as listRoute, POST as createRoute } from '@/app/api/teacher-allocations/route'
import { GET as myRoute } from '@/app/api/teacher-allocations/my/route'
import { GET as getRoute, PATCH as patchRoute } from '@/app/api/teacher-allocations/[id]/route'
import { PATCH as statusRoute } from '@/app/api/teacher-allocations/[id]/status/route'

let payload: any
let adminToken = ''
let teacherAToken = ''
let teacherBToken = ''
let noProfileToken = ''
let teacherAProfile: any
let teacherBProfile: any

const TAG = `${Date.now()}`
const PASSWORD = 'Phase7UserPass123!'
const ADMIN_EMAIL = 'phase7-admin-actor@example.com'
const A_EMAIL = 'phase7-teacher-a@example.com'
const B_EMAIL = 'phase7-teacher-b@example.com'
const NP_EMAIL = 'phase7-teacher-noprofile@example.com'
const SUBJECT = `Quasology${TAG}`
const LOCALITY = `Yarnton${TAG}`

const studentIds: number[] = []
const profileIds: number[] = []
const enquiryIds: number[] = []
const userEmails = [ADMIN_EMAIL, A_EMAIL, B_EMAIL, NP_EMAIL]

function req(method: string, token?: string, body?: unknown, query = ''): Request {
  return new Request(`http://localhost:3000/api/x${query}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

async function makeUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  let user = ex.docs[0]
  if (!user) {
    user = await payload.create({
      collection: 'users',
      data: { email, password: PASSWORD, role, status: 'active' },
      overrideAccess: true,
    })
  }
  const token = (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token
  return { user, token }
}

async function makeStudent(over: Record<string, unknown> = {}) {
  const s = await payload.create({
    collection: 'students',
    data: {
      name: `Phase7 Student ${TAG}`,
      phoneNumber: `+91 93${Math.floor(10000000 + Math.random() * 89999999)}`,
      studentClass: 'Class 8',
      subjects: [{ subject: SUBJECT }],
      locality: LOCALITY,
      preferredTiming: 'Evenings',
      ...over,
    },
    overrideAccess: true,
  })
  studentIds.push(Number(s.id))
  return s
}

async function makeProfile(userId: number | null, over: Record<string, any> = {}) {
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Phase7 Teacher ${TAG}`,
      mobileNumber: `+91 92${Math.floor(10000000 + Math.random() * 89999999)}`,
      highestQualification: 'M.Sc',
      teachingExperience: '3 years',
      primarySubject: SUBJECT,
      classLevel: 'Class 6-10',
      teachingLocality: LOCALITY,
      preferredAvailability: 'Evenings',
      agreedToPolicy: true,
    },
    overrideAccess: true,
  })
  enquiryIds.push(Number(e.id))
  const p = await payload.create({
    collection: 'teacher-profiles',
    data: {
      name: `Phase7 Teacher ${TAG}`,
      mobile: e.mobileNumber,
      primarySubject: SUBJECT,
      qualification: 'M.Sc',
      classLevels: 'Class 6-10',
      locality: LOCALITY,
      availability: 'Evenings',
      approvalStatus: 'approved',
      teacherEnquiry: e.id,
      account: { status: 'active' },
      ...(userId ? { user: userId } : {}),
      ...over,
    },
    overrideAccess: true,
  })
  profileIds.push(Number(p.id))
  return p
}

async function allocate(studentId: number, teacherId: number, extra: Record<string, unknown> = {}) {
  return createRoute(
    req('POST', adminToken, { studentId, teacherId, subject: SUBJECT, ...extra }),
  )
}

describe('Phase 7 — Teacher allocation (`FR-F1`, `FR-F2`)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = (await makeUser(ADMIN_EMAIL, 'super_admin')).token
    const a = await makeUser(A_EMAIL, 'teacher')
    const b = await makeUser(B_EMAIL, 'teacher')
    teacherAToken = a.token
    teacherBToken = b.token
    noProfileToken = (await makeUser(NP_EMAIL, 'teacher')).token
    teacherAProfile = await makeProfile(a.user.id)
    teacherBProfile = await makeProfile(b.user.id)
  })

  afterAll(async () => {
    for (const sid of studentIds) {
      const docs = await payload
        .find({ collection: 'teacher-allocations', where: { student: { equals: sid } }, pagination: false, overrideAccess: true })
        .catch(() => ({ docs: [] }))
      for (const d of docs.docs) {
        await payload.delete({ collection: 'teacher-allocations', id: d.id, overrideAccess: true }).catch(() => {})
      }
      await payload.delete({ collection: 'students', id: sid, overrideAccess: true }).catch(() => {})
    }
    for (const id of profileIds) {
      await payload.delete({ collection: 'teacher-profiles', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of enquiryIds) {
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => {})
    }
    for (const email of userEmails) {
      await payload
        .delete({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
        .catch(() => {})
    }
  })

  it('only admins can create allocations', async () => {
    const s = await makeStudent()
    const body = { studentId: s.id, teacherId: teacherAProfile.id, subject: SUBJECT }
    expect((await createRoute(req('POST', undefined, body))).status).toBe(401)
    expect((await createRoute(req('POST', teacherAToken, body))).status).toBe(403)
    expect((await listRoute(req('GET', teacherAToken))).status).toBe(403)
  })

  it('creates a valid allocation with admin, timestamp and status, and does not mutate the student', async () => {
    const s = await makeStudent()
    const res = await allocate(s.id, teacherAProfile.id, { allocationNotes: ' picked ' })
    expect(res.status).toBe(201)
    const data = (await res.json()).data
    expect(data).toMatchObject({
      studentId: s.id,
      teacherId: teacherAProfile.id,
      subject: SUBJECT,
      status: 'assigned',
      allocationNotes: 'picked',
    })
    expect(data.allocatedBy).toBeTruthy()
    expect(data.allocatedAt).toBeTruthy()
    expect(data.statusHistory).toHaveLength(1)
    expect(JSON.stringify(data)).not.toContain('activeKey')
    const after = await payload.findByID({ collection: 'students', id: s.id, overrideAccess: true })
    expect(after.status).toBe('active')
  })

  it('validates input and rejects unknown/ineligible student or teacher', async () => {
    const s = await makeStudent()
    expect((await createRoute(req('POST', adminToken, {}))).status).toBe(400)
    expect((await createRoute(req('POST', adminToken, { studentId: s.id, teacherId: teacherAProfile.id }))).status).toBe(400)
    expect((await allocate(999999999, teacherAProfile.id)).status).toBe(404)
    expect((await allocate(s.id, 999999999)).status).toBe(404)

    const inactiveStudent = await makeStudent({ status: 'inactive' })
    expect((await allocate(inactiveStudent.id, teacherAProfile.id)).status).toBe(409)

    const pending = await makeProfile(null, { approvalStatus: 'pending' })
    const inactiveTeacher = await makeProfile(null, { account: { status: 'inactive' } })
    expect((await allocate(s.id, pending.id)).status).toBe(409)
    expect((await allocate(s.id, inactiveTeacher.id)).status).toBe(409)
  })

  it('rejects incompatible subject or class', async () => {
    const s = await makeStudent()
    const wrongSubject = await makeProfile(null, { primarySubject: `Other${TAG}` })
    const wrongClass = await makeProfile(null, { classLevels: 'Class 1-3' })
    expect((await allocate(s.id, wrongSubject.id)).status).toBe(409)
    expect((await allocate(s.id, wrongClass.id)).status).toBe(409)
    expect(
      (await createRoute(req('POST', adminToken, { studentId: s.id, teacherId: teacherAProfile.id, subject: `NotRequired${TAG}` })))
        .status,
    ).toBe(409)
  })

  it('prevents duplicate active allocation (sequential and concurrent), and allows re-allocation after cancel', async () => {
    const s = await makeStudent()
    expect((await allocate(s.id, teacherAProfile.id)).status).toBe(201)
    expect((await allocate(s.id, teacherAProfile.id)).status).toBe(409)

    const s2 = await makeStudent()
    const results = await Promise.all([
      allocate(s2.id, teacherBProfile.id),
      allocate(s2.id, teacherBProfile.id),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])

    // cancel frees the slot
    const list = await (await listRoute(req('GET', adminToken, undefined, `?studentId=${s.id}`))).json()
    const id = list.data.docs[0].id
    expect((await statusRoute(req('PATCH', adminToken, { status: 'cancelled', reason: 'changed mind' }), ctx(id))).status).toBe(200)
    expect((await allocate(s.id, teacherAProfile.id)).status).toBe(201)
  })

  it('lists with filters/pagination and rejects bad filters', async () => {
    const s = await makeStudent()
    await allocate(s.id, teacherAProfile.id)
    const res = await listRoute(req('GET', adminToken, undefined, `?studentId=${s.id}&status=assigned&limit=5`))
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.totalDocs).toBe(1)
    expect(data.docs[0].student.name).toContain('Phase7')
    expect(JSON.stringify(data)).not.toContain('phoneNumber')
    expect((await listRoute(req('GET', adminToken, undefined, '?status=bogus'))).status).toBe(400)
    expect((await listRoute(req('GET', adminToken, undefined, '?studentId=abc'))).status).toBe(400)
  })

  it('teacher sees only own allocations via /my and by id', async () => {
    const s = await makeStudent()
    const mineRes = await allocate(s.id, teacherAProfile.id)
    const mine = (await mineRes.json()).data
    const s2 = await makeStudent()
    const theirs = (await (await allocate(s2.id, teacherBProfile.id)).json()).data

    const my = await myRoute(req('GET', teacherAToken))
    expect(my.status).toBe(200)
    const ids = (await my.json()).data.docs.map((d: any) => d.id)
    expect(ids).toContain(mine.id)
    expect(ids).not.toContain(theirs.id)

    expect((await getRoute(req('GET', teacherAToken), ctx(mine.id))).status).toBe(200)
    expect((await getRoute(req('GET', teacherAToken), ctx(theirs.id))).status).toBe(404)
    expect((await getRoute(req('GET', adminToken), ctx(theirs.id))).status).toBe(200)
    expect((await getRoute(req('GET', adminToken), ctx(999999999))).status).toBe(404)
    expect((await getRoute(req('GET', adminToken), ctx('abc'))).status).toBe(400)

    expect((await myRoute(req('GET'))).status).toBe(401)
    expect((await myRoute(req('GET', adminToken))).status).toBe(403)
    expect((await myRoute(req('GET', noProfileToken))).status).toBe(403)
    // a teacher id in the query is ignored
    const spoof = await myRoute(req('GET', teacherAToken, undefined, `?teacherId=${teacherBProfile.id}`))
    const spoofIds = (await spoof.json()).data.docs.map((d: any) => d.id)
    expect(spoofIds).not.toContain(theirs.id)
  })

  it('enforces status transitions and teacher permissions', async () => {
    const s = await makeStudent()
    const alloc = (await (await allocate(s.id, teacherAProfile.id)).json()).data
    const patch = (token: string | undefined, body: unknown, id = alloc.id) =>
      statusRoute(req('PATCH', token, body), ctx(id))

    expect((await patch(undefined, { status: 'accepted' })).status).toBe(401)
    expect((await patch(adminToken, { status: 'bogus' })).status).toBe(400)
    expect((await patch(adminToken, { status: 'completed' })).status).toBe(409) // assigned -> completed
    expect((await patch(adminToken, { status: 'active' })).status).toBe(409) // assigned -> active
    expect((await patch(teacherBToken, { status: 'accepted' })).status).toBe(404) // not theirs
    expect((await patch(teacherAToken, { status: 'active' })).status).toBe(403) // teacher can't activate
    expect((await patch(teacherAToken, { status: 'accepted' })).status).toBe(200)
    expect((await patch(teacherAToken, { status: 'rejected' })).status).toBe(409) // accepted -> rejected invalid
    expect((await patch(adminToken, { status: 'active' })).status).toBe(200)
    expect((await patch(adminToken, { status: 'completed', reason: 'done' })).status).toBe(200)
    const terminal = await patch(adminToken, { status: 'cancelled' })
    expect(terminal.status).toBe(409)

    const final = await (await getRoute(req('GET', adminToken), ctx(alloc.id))).json()
    expect(final.data.status).toBe('completed')
    expect(final.data.statusHistory.map((h: any) => h.toStatus)).toEqual([
      'assigned',
      'accepted',
      'active',
      'completed',
    ])
  })

  it('PATCH allows only allocationNotes', async () => {
    const s = await makeStudent()
    const alloc = (await (await allocate(s.id, teacherAProfile.id)).json()).data
    expect((await patchRoute(req('PATCH', teacherAToken, { allocationNotes: 'x' }), ctx(alloc.id))).status).toBe(403)
    expect((await patchRoute(req('PATCH', adminToken, { subject: 'Hack' }), ctx(alloc.id))).status).toBe(400)
    expect((await patchRoute(req('PATCH', adminToken, {}), ctx(alloc.id))).status).toBe(400)
    const ok = await patchRoute(req('PATCH', adminToken, { allocationNotes: 'updated' }), ctx(alloc.id))
    expect(ok.status).toBe(200)
    expect((await ok.json()).data.allocationNotes).toBe('updated')
    expect((await patchRoute(req('PATCH', adminToken, { allocationNotes: 'x' }), ctx(999999999))).status).toBe(404)
  })

  it('stores fee and commission terms and derives commission and teacher payout', async () => {
    const s = await makeStudent()
    const created = await allocate(s.id, teacherAProfile.id, { monthlyFee: 4000, commissionPercent: 25 })
    expect(created.status).toBe(201)
    const alloc = (await created.json()).data
    expect(alloc.monthlyFee).toBe(4000)
    expect(alloc.commissionAmount).toBe(1000)
    expect(alloc.teacherPayout).toBe(3000)

    const updated = await patchRoute(req('PATCH', adminToken, { commissionPercent: 10 }), ctx(alloc.id))
    expect(updated.status).toBe(200)
    const body = (await updated.json()).data
    expect(body.commissionAmount).toBe(400)
    expect(body.teacherPayout).toBe(3600)

    expect((await patchRoute(req('PATCH', adminToken, { commissionPercent: 150 }), ctx(alloc.id))).status).toBe(400)
    expect((await patchRoute(req('PATCH', adminToken, { monthlyFee: -5 }), ctx(alloc.id))).status).toBe(400)
  })

  it('rejects invalid commercial terms on create', async () => {
    const s = await makeStudent()
    expect((await allocate(s.id, teacherAProfile.id, { monthlyFee: 0, commissionPercent: 20 })).status).toBe(400)
    expect((await allocate(s.id, teacherAProfile.id, { monthlyFee: 3000, commissionPercent: 101 })).status).toBe(400)
    expect((await allocate(s.id, teacherAProfile.id, { monthlyFee: 3000 })).status).toBe(400)
  })

  it('marks the converted enquiry as allocated when a teacher is allocated', async () => {
    const enquiry = await payload.create({
      collection: 'student-enquiries',
      data: {
        name: `Phase7 Enquiry ${TAG}`,
        phoneNumber: `+91 94${Math.floor(10000000 + Math.random() * 89999999)}`,
        studentClass: 'Class 8',
        subjects: [{ subject: SUBJECT }],
        preferredTiming: 'Evenings',
        locality: LOCALITY,
        budgetRange: '3000-4000',
        agreedToPolicy: true,
      },
      overrideAccess: true,
    })
    const s = await makeStudent({ studentEnquiry: enquiry.id })
    await payload.update({
      collection: 'student-enquiries',
      id: enquiry.id,
      data: { enquiryStatus: 'converted' },
      overrideAccess: true,
      context: { isStudentConversion: true },
    })
    const res = await allocate(s.id, teacherBProfile.id, { monthlyFee: 3500, commissionPercent: 20 })
    expect(res.status).toBe(201)
    const after = await payload.findByID({ collection: 'student-enquiries', id: enquiry.id, overrideAccess: true })
    expect(after.enquiryStatus).toBe('allocated')
    await payload.delete({ collection: 'student-enquiries', id: enquiry.id, overrideAccess: true })
  })
})
