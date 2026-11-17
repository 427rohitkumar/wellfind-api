import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as approveRoute } from '@/app/api/teacher-enquiries/[id]/approve/route'
import { POST as createEvaluation } from '@/app/api/teacher-enquiries/[id]/evaluations/route'
import { PATCH as availabilityRoute } from '@/app/api/teachers/[id]/availability/route'
import { PATCH as statusRoute } from '@/app/api/teachers/[id]/status/route'

let payload: any
let adminToken = ''
let teacherToken = ''

const ADMIN_EMAIL = 'phase5-admin-actor@example.com'
const TEACHER_EMAIL = 'phase5-teacher-actor@example.com'
const TEST_PASSWORD = 'Phase5UserPass123!'

const enquiryIds: number[] = []
const userEmails: string[] = []
const tempUserIds: number[] = []

function req(path: string, method: string, token?: string, body?: unknown): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

async function makeEnquiry(opts: { email?: string | null; status?: string } = {}) {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const email = opts.email === undefined ? `phase5-${suffix}@example.com` : opts.email
  const created = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Phase 5 Teacher ${suffix}`,
      mobileNumber: `+91 97${Math.floor(10000000 + Math.random() * 89999999)}`,
      ...(email ? { email } : {}),
      highestQualification: 'M.Sc. Mathematics',
      teachingExperience: '6 years',
      primarySubject: 'Mathematics',
      classLevel: 'Class 8-10',
      teachingLocality: 'Salt Lake',
      preferredAvailability: 'Weekday evenings',
      agreedToPolicy: true,
    },
    overrideAccess: true,
  })
  enquiryIds.push(Number(created.id))
  if (email) userEmails.push(String(email).toLowerCase())
  const target = opts.status ?? 'shortlisted'
  for (const s of ['under_review', 'shortlisted']) {
    await payload.update({
      collection: 'teacher-enquiries',
      id: created.id,
      data: { applicationStatus: s },
      overrideAccess: true,
    })
    if (s === target) break
  }
  return created
}

async function evaluate(id: number) {
  const res = await createEvaluation(
    req(`/api/teacher-enquiries/${id}/evaluations`, 'POST', adminToken, {
      writtenTest: { marksObtained: 75, totalMarks: 100 },
      interview: { marksObtained: 80, totalMarks: 100 },
    }),
    ctx(id),
  )
  expect(res.status).toBe(201)
  return (await res.json()).data
}

describe('Phase 5 — Teacher approval, profile and account (`FR-D1`–`FR-D3`)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    const adminExisting = await payload.find({
      collection: 'users',
      where: { email: { equals: ADMIN_EMAIL } },
      limit: 1,
      overrideAccess: true,
    })
    if (adminExisting.docs.length === 0) {
      const a = await payload.create({
        collection: 'users',
        data: { email: ADMIN_EMAIL, password: TEST_PASSWORD, role: 'super_admin', status: 'active' },
        overrideAccess: true,
      })
      tempUserIds.push(Number(a.id))
    }
    adminToken = (
      await payload.login({
        collection: 'users',
        data: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
      })
    ).token
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: TEACHER_EMAIL } },
      limit: 1,
      overrideAccess: true,
    })
    if (existing.docs.length === 0) {
      const u = await payload.create({
        collection: 'users',
        data: { email: TEACHER_EMAIL, password: TEST_PASSWORD, role: 'teacher', status: 'active' },
        overrideAccess: true,
      })
      tempUserIds.push(Number(u.id))
    }
    teacherToken = (
      await payload.login({
        collection: 'users',
        data: { email: TEACHER_EMAIL, password: TEST_PASSWORD },
      })
    ).token
  })

  afterAll(async () => {
    for (const id of enquiryIds) {
      const profiles = await payload
        .find({ collection: 'teacher-profiles', where: { teacherEnquiry: { equals: id } }, overrideAccess: true })
        .catch(() => ({ docs: [] }))
      for (const p of profiles.docs) {
        await payload.delete({ collection: 'teacher-profiles', id: p.id, overrideAccess: true }).catch(() => {})
      }
      for (const coll of ['teacher-evaluations', 'enquiry-audit-log']) {
        const docs = await payload
          .find({ collection: coll, where: { teacherEnquiry: { equals: id } }, overrideAccess: true })
          .catch(() => ({ docs: [] }))
        for (const d of docs.docs) {
          await payload.delete({ collection: coll, id: d.id, overrideAccess: true }).catch(() => {})
        }
      }
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => {})
    }
    for (const email of userEmails) {
      await payload
        .delete({ collection: 'users', where: { email: { equals: email } }, overrideAccess: true })
        .catch(() => {})
    }
    for (const id of tempUserIds) {
      await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => {})
    }
  })

  it('rejects unauthenticated and non-admin callers', async () => {
    const e = await makeEnquiry()
    expect((await approveRoute(req(`/x`, 'POST'), ctx(e.id))).status).toBe(401)
    expect((await approveRoute(req(`/x`, 'POST', teacherToken), ctx(e.id))).status).toBe(403)
  })

  it('rejects invalid id and unknown application', async () => {
    expect((await approveRoute(req(`/x`, 'POST', adminToken), ctx('abc'))).status).toBe(400)
    expect((await approveRoute(req(`/x`, 'POST', adminToken), ctx(999999999))).status).toBe(404)
  })

  it('cannot approve an application without a completed evaluation', async () => {
    const e = await makeEnquiry()
    const res = await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))
    expect(res.status).toBe(409)
    const profiles = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: e.id } },
      overrideAccess: true,
    })
    expect(profiles.docs).toHaveLength(0)
  })

  it('cannot approve an in-progress (incomplete) evaluation', async () => {
    const e = await makeEnquiry()
    const r = await createEvaluation(
      req(`/x`, 'POST', adminToken, { writtenTest: { marksObtained: 50, totalMarks: 100 } }),
      ctx(e.id),
    )
    expect(r.status).toBe(201)
    expect((await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))).status).toBe(409)
  })

  it('cannot approve when required application data (email) is missing', async () => {
    const e = await makeEnquiry({ email: null })
    await evaluate(e.id)
    const res = await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.errors.some((x: any) => x.field === 'email')).toBe(true)
  })

  it('approves once: one profile, one teacher account, role server-side, no password leak', async () => {
    const e = await makeEnquiry()
    const ev = await evaluate(e.id)
    const res = await approveRoute(
      // client-supplied role must be ignored
      req(`/x`, 'POST', adminToken, { role: 'super_admin' }),
      ctx(e.id),
    )
    expect(res.status).toBe(201)
    const text = await res.text()
    expect(text).not.toMatch(/password/i)
    const body = JSON.parse(text)
    expect(body.data.user.role).toBe('teacher')
    expect(body.data.user.created).toBe(true)
    expect(body.data.qualityScore).toBe(77.5)
    expect(body.data.profile.evaluationScore).toBe(77.5)
    expect(body.data.profile.teacherEnquiry).toBe(e.id)
    expect(body.data.profile.user).toBe(body.data.user.id)
    expect(body.data.profile.evaluation).toBe(ev.id)
    expect(body.data.profile.approvedAt).toBeTruthy()

    const enquiry = await payload.findByID({
      collection: 'teacher-enquiries',
      id: e.id,
      overrideAccess: true,
    })
    expect(enquiry.applicationStatus).toBe('approved')

    // Duplicate approval
    const again = await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))
    expect(again.status).toBe(409)
    const profiles = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: e.id } },
      overrideAccess: true,
    })
    expect(profiles.docs).toHaveLength(1)
    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: String(enquiry.email).toLowerCase() } },
      overrideAccess: true,
    })
    expect(users.docs).toHaveLength(1)
  })

  it('concurrent approval creates a single profile and account', async () => {
    const e = await makeEnquiry()
    await evaluate(e.id)
    const results = await Promise.all([
      approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id)),
      approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id)),
    ])
    const statuses = results.map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    const profiles = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: e.id } },
      overrideAccess: true,
    })
    expect(profiles.docs).toHaveLength(1)
  })

  it('links an existing teacher account safely and refuses a super_admin email', async () => {
    const e = await makeEnquiry({ email: `phase5-existing-${Date.now()}@example.com` })
    const existingEmail = String(e.email).toLowerCase()
    const u = await payload.create({
      collection: 'users',
      data: { email: existingEmail, password: TEST_PASSWORD, role: 'teacher', status: 'active' },
      overrideAccess: true,
    })
    await evaluate(e.id)
    const res = await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.data.user.created).toBe(false)
    expect(body.data.user.id).toBe(u.id)

    const e2 = await makeEnquiry({ email: ADMIN_EMAIL })
    await evaluate(e2.id)
    const res2 = await approveRoute(req(`/x`, 'POST', adminToken), ctx(e2.id))
    expect(res2.status).toBe(409)
    const refreshed = await payload.findByID({
      collection: 'teacher-enquiries',
      id: e2.id,
      overrideAccess: true,
    })
    expect(refreshed.applicationStatus).toBe('evaluation_completed')
  })

  it('updates availability and status, mirroring suspension to the login account', async () => {
    const e = await makeEnquiry()
    await evaluate(e.id)
    const approved = await (await approveRoute(req(`/x`, 'POST', adminToken), ctx(e.id))).json()
    const teacherId = approved.data.profile.id
    const userId = approved.data.user.id

    expect((await availabilityRoute(req(`/x`, 'PATCH', undefined, {}), ctx(teacherId))).status).toBe(401)
    expect((await availabilityRoute(req(`/x`, 'PATCH', teacherToken, { availability: 'x' }), ctx(teacherId))).status).toBe(403)
    expect((await availabilityRoute(req(`/x`, 'PATCH', adminToken, {}), ctx(teacherId))).status).toBe(400)
    expect(
      (await availabilityRoute(req(`/x`, 'PATCH', adminToken, { availabilityStatus: 'busy' }), ctx(teacherId))).status,
    ).toBe(400)
    const av = await availabilityRoute(
      req(`/x`, 'PATCH', adminToken, { availability: 'Weekends', availabilityStatus: 'allocated' }),
      ctx(teacherId),
    )
    expect(av.status).toBe(200)
    const avBody = await av.json()
    expect(avBody.data.availability).toBe('Weekends')
    expect(avBody.data.availabilityStatus).toBe('allocated')

    expect((await statusRoute(req(`/x`, 'PATCH', adminToken, { status: 'bogus' }), ctx(teacherId))).status).toBe(400)
    expect((await statusRoute(req(`/x`, 'PATCH', adminToken, { status: 'active' }), ctx(999999999))).status).toBe(404)
    const sus = await statusRoute(req(`/x`, 'PATCH', adminToken, { status: 'suspended' }), ctx(teacherId))
    expect(sus.status).toBe(200)
    expect((await sus.json()).data.accountStatus).toBe('suspended')
    let user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true })
    expect(user.status).toBe('suspended')

    await statusRoute(req(`/x`, 'PATCH', adminToken, { status: 'active' }), ctx(teacherId))
    user = await payload.findByID({ collection: 'users', id: userId, overrideAccess: true })
    expect(user.status).toBe('active')
  })

  it('private teacher documents stay private and legacy submission remains compatible', async () => {
    const created = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Phase 5 Legacy',
        mobileNumber: `+91 96${Math.floor(10000000 + Math.random() * 89999999)}`,
        highestQualification: 'B.Ed',
        teachingExperience: 'Fresher',
        primarySubject: 'English',
        classLevel: 'Class 1-5',
        teachingLocality: 'Patna',
        preferredAvailability: 'Mornings',
        agreedToPolicy: true,
      },
    })
    enquiryIds.push(Number(created.id))
    expect(created.applicationStatus).toBe('new')
    await expect(
      payload.find({ collection: 'teacher-enquiries', overrideAccess: false }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
