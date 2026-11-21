import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET, PATCH } from '@/app/api/profile/route'

const PASSWORD = 'ProfileSpecPass123!'
const ADMIN = 'profile-spec-admin@example.com'
const TEACHER = 'profile-spec-teacher@example.com'
let payload: any
let adminToken = ''
let teacherToken = ''
let teacherId = 0
let profileId = 0
let enquiryId = 0

const req = (token: string | null, method: string, body?: unknown) =>
  new Request('http://localhost:3000/api/profile', {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
const call = async (r: Response) => ({ status: r.status, body: (await r.json()) as any })

async function ensureUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  const u = ex.docs[0] ?? (await payload.create({ collection: 'users', data: { email, password: PASSWORD, role, status: 'active' }, overrideAccess: true }))
  const token = (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token as string
  return { id: u.id as number, token }
}

describe('my profile', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = (await ensureUser(ADMIN, 'super_admin')).token
    const t = await ensureUser(TEACHER, 'teacher')
    teacherToken = t.token
    teacherId = t.id
    const e = await payload.create({
      collection: 'teacher-enquiries',
      data: { fullName: 'Profile Spec', mobileNumber: '9876500099', email: 'profile-spec-enq@example.com', highestQualification: 'B.Ed', teachingExperience: '2 years', primarySubject: 'Maths', classLevel: 'Class 6-8', teachingLocality: 'Boring Road', preferredAvailability: 'Evenings', agreedToPolicy: true },
      overrideAccess: true,
    })
    enquiryId = e.id
    const p = await payload.create({
      collection: 'teacher-profiles',
      data: { name: 'Profile Spec', mobile: '9876500099', primarySubject: 'Maths', qualification: 'B.Ed', experienceYears: 2, classLevels: 'Class 6-8', locality: 'Boring Road', availability: 'Evenings', approvalStatus: 'approved', user: teacherId, teacherEnquiry: enquiryId },
      overrideAccess: true,
    })
    profileId = p.id
  })
  afterAll(async () => {
    await payload.delete({ collection: 'teacher-profiles', id: profileId, overrideAccess: true }).catch(() => undefined)
    await payload.delete({ collection: 'teacher-enquiries', id: enquiryId, overrideAccess: true }).catch(() => undefined)
    for (const email of [ADMIN, TEACHER]) {
      const u = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
      if (u.docs[0]) await payload.delete({ collection: 'users', id: u.docs[0].id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('requires sign-in', async () => {
    expect((await call(await GET(req(null, 'GET')))).status).toBe(401)
  })

  it('admin can update name, phone and gender but never the email', async () => {
    const ok = await call(await PATCH(req(adminToken, 'PATCH', { name: 'Asha Verma', phone: '+91 98765 43210', gender: 'female' })))
    expect(ok.status).toBe(200)
    expect(ok.body.data.name).toBe('Asha Verma')
    expect(ok.body.data.gender).toBe('female')
    expect(ok.body.data.email).toBe(ADMIN)
    // email change is refused and the login keeps working
    expect((await call(await PATCH(req(adminToken, 'PATCH', { email: 'someone-else@example.com' })))).status).toBe(400)
    expect((await call(await PATCH(req(adminToken, 'PATCH', { role: 'teacher' })))).status).toBe(400)
    const u = await payload.find({ collection: 'users', where: { email: { equals: ADMIN } }, limit: 1, overrideAccess: true })
    expect(u.docs[0].role).toBe('super_admin')
    // sending the same email is harmless
    expect((await call(await PATCH(req(adminToken, 'PATCH', { email: ADMIN.toUpperCase(), name: 'Asha V' })))).status).toBe(200)
    // validation
    expect((await call(await PATCH(req(adminToken, 'PATCH', { phone: 'abc' })))).status).toBe(400)
    expect((await call(await PATCH(req(adminToken, 'PATCH', { name: '   ' })))).status).toBe(400)
    expect((await call(await PATCH(req(adminToken, 'PATCH', { gender: 'robot' })))).status).toBe(400)
  })

  it('teacher edits basics but not verified credentials', async () => {
    const ok = await call(await PATCH(req(teacherToken, 'PATCH', { name: 'Rina Das', phone: '9876500055', gender: 'female', locality: 'Kankarbagh', availability: 'Mornings', about: 'Friendly and patient.' })))
    expect(ok.status).toBe(200)
    expect(ok.body.data.teacher.locality).toBe('Kankarbagh')
    expect(ok.body.data.teacher.about).toBe('Friendly and patient.')
    // qualification/subject are ignored, never written
    await call(await PATCH(req(teacherToken, 'PATCH', { name: 'Rina Das', qualification: 'PhD', primarySubject: 'Physics' })))
    const p = await payload.findByID({ collection: 'teacher-profiles', id: profileId, overrideAccess: true })
    expect(p.qualification).toBe('B.Ed')
    expect(p.primarySubject).toBe('Maths')
    expect(p.name).toBe('Rina Das')
    expect((await call(await PATCH(req(teacherToken, 'PATCH', { email: 'x@example.com' })))).status).toBe(400)
  })
})
