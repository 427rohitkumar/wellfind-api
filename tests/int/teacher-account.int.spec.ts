import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { POST as createAccountRoute } from '@/app/api/teacher-enquiries/[id]/create-account/route'
import { generateTemporaryPassword } from '@/lib/passwords'

let payload: any
let adminToken = ''
let teacherToken = ''
const TAG = `${Date.now()}`
const ADMIN_EMAIL = 'teacher-account-admin@example.com'
const TEACHER_EMAIL = 'teacher-account-teacher@example.com'
const PASSWORD = 'AccountSpecPass123!'
const enquiryIds: number[] = []
const emails: string[] = [ADMIN_EMAIL, TEACHER_EMAIL]

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })
function req(token: string | undefined, body?: unknown): Request {
  return new Request('http://localhost:3000/api/x', {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function makeUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
  if (!ex.docs[0]) {
    await payload.create({ collection: 'users', data: { email, password: PASSWORD, role, status: 'active' }, overrideAccess: true })
  }
  return (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token as string
}

async function makeEnquiry(email: string, status: string) {
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Account Spec ${TAG}`,
      mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
      email,
      highestQualification: 'B.Ed',
      teachingExperience: '2 years',
      primarySubject: 'Maths',
      classLevel: 'Class 6-10',
      teachingLocality: 'Patna',
      preferredAvailability: 'Evening',
      agreedToPolicy: true,
    },
  })
  enquiryIds.push(Number(e.id))
  const path = ['under_review', 'shortlisted']
  for (const st of path) {
    await payload.update({ collection: 'teacher-enquiries', id: e.id, data: { applicationStatus: st } })
    if (st === status) break
  }
  return e
}

describe('Teacher account creation at shortlisting', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = await makeUser(ADMIN_EMAIL, 'super_admin')
    teacherToken = await makeUser(TEACHER_EMAIL, 'teacher')
  })

  afterAll(async () => {
    for (const id of enquiryIds) {
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => undefined)
    }
    for (const email of emails) {
      const found = await payload.find({ collection: 'users', where: { email: { equals: email } }, limit: 1, overrideAccess: true })
      if (found.docs[0]) await payload.delete({ collection: 'users', id: found.docs[0].id, overrideAccess: true }).catch(() => undefined)
    }
  })

  it('generates alphanumeric passwords with mixed character classes', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateTemporaryPassword()
      expect(pw).toMatch(/^[A-Za-z0-9]{12}$/)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[0-9]/)
    }
  })

  it('is admin only', async () => {
    const e = await makeEnquiry(`acct-auth-${TAG}@example.com`, 'shortlisted')
    expect((await createAccountRoute(req(undefined, {}), ctx(e.id))).status).toBe(401)
    expect((await createAccountRoute(req(teacherToken, {}), ctx(e.id))).status).toBe(403)
  })

  it('creates a teacher login with a generated password and records it on the enquiry', async () => {
    const email = `acct-gen-${TAG}@example.com`
    emails.push(email)
    const e = await makeEnquiry(email, 'shortlisted')
    const res = await createAccountRoute(req(adminToken, {}), ctx(e.id))
    expect(res.status).toBe(201)
    const data = (await res.json()).data
    expect(data.user.email).toBe(email)
    expect(data.passwordGenerated).toBe(true)
    expect(data.password).toMatch(/^[A-Za-z0-9]{12}$/)
    // SMTP is not configured in tests: the account exists but the email is reported as not sent.
    expect(data.email.sent).toBe(false)

    const login = await payload.login({ collection: 'users', data: { email, password: data.password } })
    expect(login.token).toBeTruthy()
    expect(login.user.role).toBe('teacher')

    const after = await payload.findByID({ collection: 'teacher-enquiries', id: e.id, overrideAccess: true, depth: 0 })
    expect(after.teacherUser).toBe(login.user.id)
    expect(after.credentialsEmailStatus).toBe('failed')

    // Second attempt is rejected.
    expect((await createAccountRoute(req(adminToken, {}), ctx(e.id))).status).toBe(409)
  })

  it('accepts an admin-chosen password and rejects weak or duplicate input', async () => {
    const email = `acct-manual-${TAG}@example.com`
    emails.push(email)
    const e = await makeEnquiry(email, 'under_review')
    expect((await createAccountRoute(req(adminToken, { password: 'short' }), ctx(e.id))).status).toBe(400)
    const ok = await createAccountRoute(req(adminToken, { password: 'MyChosenPass42' }), ctx(e.id))
    expect(ok.status).toBe(201)
    expect((await ok.json()).data.passwordGenerated).toBe(false)
    expect((await payload.login({ collection: 'users', data: { email, password: 'MyChosenPass42' } })).token).toBeTruthy()

    // An email that already belongs to another user cannot be reused.
    const dup = await makeEnquiry(`acct-dup-${TAG}@example.com`, 'shortlisted')
    expect((await createAccountRoute(req(adminToken, { email: TEACHER_EMAIL }), ctx(dup.id))).status).toBe(409)
  })

  it('refuses accounts for applications that are still new', async () => {
    const e = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: `Account Spec New ${TAG}`,
        mobileNumber: `9${Math.floor(100000000 + Math.random() * 899999999)}`,
        email: `acct-new-${TAG}@example.com`,
        highestQualification: 'B.Ed',
        teachingExperience: '1 year',
        primarySubject: 'Maths',
        classLevel: 'Class 6-10',
        teachingLocality: 'Patna',
        preferredAvailability: 'Evening',
        agreedToPolicy: true,
      },
    })
    enquiryIds.push(Number(e.id))
    expect((await createAccountRoute(req(adminToken, {}), ctx(e.id))).status).toBe(409)
  })
})
