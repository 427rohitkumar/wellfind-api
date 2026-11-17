import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import { GET as getMatches, POST as saveMatch } from '@/app/api/students/[id]/matches/route'
import { classMatches, parseClassRange } from '@/lib/teacherMatching'

let payload: any
let adminToken = ''
let teacherToken = ''

const ADMIN_EMAIL = 'phase6-admin-actor@example.com'
const TEACHER_EMAIL = 'phase6-teacher-actor@example.com'
const PASSWORD = 'Phase6UserPass123!'
const TAG = `${Date.now()}`
const SUBJECT = `Xenology${TAG}`
const LOCALITY = `Zorbville${TAG}`

const studentIds: number[] = []
const profileIds: number[] = []
const enquiryIds: number[] = []
const userIds: number[] = []

function req(method: string, token?: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/x', {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

async function makeStudent(over: Record<string, unknown> = {}) {
  const s = await payload.create({
    collection: 'students',
    data: {
      name: `Phase6 Student ${TAG}`,
      phoneNumber: `+91 95${Math.floor(10000000 + Math.random() * 89999999)}`,
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

async function makeTeacher(over: Record<string, any> = {}) {
  const e = await payload.create({
    collection: 'teacher-enquiries',
    data: {
      fullName: `Phase6 Teacher ${TAG}`,
      mobileNumber: `+91 94${Math.floor(10000000 + Math.random() * 89999999)}`,
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
      name: `Phase6 Teacher ${TAG}`,
      mobile: e.mobileNumber,
      primarySubject: SUBJECT,
      qualification: 'M.Sc',
      classLevels: 'Class 6-10',
      locality: LOCALITY,
      availability: 'Evenings',
      availabilityStatus: 'free',
      evaluationScore: 70,
      approvalStatus: 'approved',
      teacherEnquiry: e.id,
      account: { status: 'active' },
      ...over,
    },
    overrideAccess: true,
  })
  profileIds.push(Number(p.id))
  return p
}

async function ensureUser(email: string, role: 'super_admin' | 'teacher') {
  const ex = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })
  if (ex.docs.length === 0) {
    const u = await payload.create({
      collection: 'users',
      data: { email, password: PASSWORD, role, status: 'active' },
      overrideAccess: true,
    })
    userIds.push(Number(u.id))
  }
  return (await payload.login({ collection: 'users', data: { email, password: PASSWORD } })).token
}

const ids = async (studentId: number) => {
  const res = await getMatches(req('GET', adminToken), ctx(studentId))
  expect(res.status).toBe(200)
  return (await res.json()).data.matches.map((m: any) => m.teacherId)
}

describe('Phase 6 — class range helpers', () => {
  it('parses and compares class levels', () => {
    expect(parseClassRange('Class 8–10')).toEqual({ min: 8, max: 10 })
    expect(parseClassRange('UKG to Class 5')).toEqual({ min: 0, max: 5 })
    expect(parseClassRange('All Levels')).toBe('all')
    expect(parseClassRange('')).toBeNull()
    expect(classMatches('Class 8', 'Class 6-10')).toBe(true)
    expect(classMatches('Class 3', 'Class 6-10')).toBe(false)
    expect(classMatches('UKG', 'UKG-2')).toBe(true)
    expect(classMatches('Class 4', 'All Levels')).toBe(true)
    expect(classMatches('Class 4', 'unknown')).toBe(false)
  })
})

describe('Phase 6 — Student–teacher matching (`FR-E1`, `FR-E2`)', () => {
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    adminToken = await ensureUser(ADMIN_EMAIL, 'super_admin')
    teacherToken = await ensureUser(TEACHER_EMAIL, 'teacher')
  })

  afterAll(async () => {
    for (const coll of ['teacher-matches']) {
      for (const sid of studentIds) {
        const docs = await payload
          .find({ collection: coll, where: { student: { equals: sid } }, overrideAccess: true, pagination: false })
          .catch(() => ({ docs: [] }))
        for (const d of docs.docs) {
          await payload.delete({ collection: coll, id: d.id, overrideAccess: true }).catch(() => {})
        }
      }
    }
    for (const id of studentIds) {
      await payload.delete({ collection: 'students', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of profileIds) {
      await payload.delete({ collection: 'teacher-profiles', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of enquiryIds) {
      await payload.delete({ collection: 'teacher-enquiries', id, overrideAccess: true }).catch(() => {})
    }
    for (const id of userIds) {
      await payload.delete({ collection: 'users', id, overrideAccess: true }).catch(() => {})
    }
  })

  it('rejects unauthenticated, non-admin and invalid/unknown ids', async () => {
    const s = await makeStudent()
    expect((await getMatches(req('GET'), ctx(s.id))).status).toBe(401)
    expect((await getMatches(req('GET', teacherToken), ctx(s.id))).status).toBe(403)
    expect((await saveMatch(req('POST', teacherToken, {}), ctx(s.id))).status).toBe(403)
    expect((await getMatches(req('GET', adminToken), ctx('abc'))).status).toBe(400)
    expect((await getMatches(req('GET', adminToken), ctx(999999999))).status).toBe(404)
  })

  it('returns an empty list when no teacher is eligible', async () => {
    const s = await makeStudent()
    const res = await getMatches(req('GET', adminToken), ctx(s.id))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.matches).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it('returns compatible teachers ranked by quality and excludes every mismatch', async () => {
    const s = await makeStudent()
    const good = await makeTeacher({ evaluationScore: 70 })
    const better = await makeTeacher({ evaluationScore: 90 })
    const wrongSubject = await makeTeacher({ primarySubject: `Other${TAG}` })
    const wrongClass = await makeTeacher({ classLevels: 'Class 1-3' })
    const wrongLocality = await makeTeacher({ locality: `Elsewhere${TAG}` })
    const unapproved = await makeTeacher({ approvalStatus: 'pending' })
    const inactive = await makeTeacher({ account: { status: 'inactive' } })
    const suspended = await makeTeacher({ account: { status: 'suspended' } })
    const booked = await makeTeacher({ availabilityStatus: 'allocated' })

    const result = await ids(s.id)
    expect(result).toEqual([better.id, good.id])
    for (const excluded of [wrongSubject, wrongClass, wrongLocality, unapproved, inactive, suspended, booked]) {
      expect(result).not.toContain(excluded.id)
    }

    const res = await getMatches(req('GET', adminToken), ctx(s.id))
    const first = (await res.json()).data.matches[0]
    expect(first).toMatchObject({
      teacherId: better.id,
      primarySubject: SUBJECT,
      classLevel: 'Class 6-10',
      locality: LOCALITY,
      qualityScore: 90,
      matchStatus: 'eligible',
    })
  })

  it('does not allocate: student and teacher records are unchanged by matching', async () => {
    const s = await makeStudent()
    const t = await makeTeacher()
    await ids(s.id)
    const saved = await saveMatch(req('POST', adminToken, { teacherId: t.id }), ctx(s.id))
    expect(saved.status).toBe(201)
    const studentAfter = await payload.findByID({ collection: 'students', id: s.id, overrideAccess: true })
    const teacherAfter = await payload.findByID({ collection: 'teacher-profiles', id: t.id, overrideAccess: true })
    expect(studentAfter.status).toBe('active')
    expect(teacherAfter.availabilityStatus).toBe('free')
    expect(teacherAfter.studentAllocation?.status ?? 'unallocated').toBe('unallocated')
  })

  it('saves matching decisions with a snapshot and preserves history', async () => {
    const s = await makeStudent()
    const t = await makeTeacher()
    const r1 = await saveMatch(
      req('POST', adminToken, { teacherId: t.id, adminNotes: ' first pick ' }),
      ctx(s.id),
    )
    expect(r1.status).toBe(201)
    const b1 = (await r1.json()).data
    expect(b1.matchStatus).toBe('shortlisted')
    expect(b1.adminNotes).toBe('first pick')
    expect(b1.criteriaSnapshot.criteria).toEqual({
      subject: true,
      classLevel: true,
      locality: true,
      availability: true,
    })
    expect(b1.createdBy).toBeTruthy()

    const r2 = await saveMatch(req('POST', adminToken, { teacherId: t.id, matchStatus: 'rejected' }), ctx(s.id))
    expect(r2.status).toBe(201)
    const all = await payload.find({
      collection: 'teacher-matches',
      where: { student: { equals: s.id } },
      overrideAccess: true,
    })
    expect(all.docs).toHaveLength(2)
  })

  it('validates decision input and eligibility', async () => {
    const s = await makeStudent()
    const t = await makeTeacher()
    const mismatch = await makeTeacher({ primarySubject: `Other${TAG}` })
    const pending = await makeTeacher({ approvalStatus: 'pending' })
    expect((await saveMatch(req('POST', adminToken, {}), ctx(s.id))).status).toBe(400)
    expect((await saveMatch(req('POST', adminToken, { teacherId: t.id, matchStatus: 'bogus' }), ctx(s.id))).status).toBe(400)
    expect((await saveMatch(req('POST', adminToken, { teacherId: 999999999 }), ctx(s.id))).status).toBe(404)
    expect((await saveMatch(req('POST', adminToken, { teacherId: mismatch.id }), ctx(s.id))).status).toBe(409)
    expect((await saveMatch(req('POST', adminToken, { teacherId: pending.id }), ctx(s.id))).status).toBe(409)
    const rejectedMismatch = await saveMatch(
      req('POST', adminToken, { teacherId: mismatch.id, matchStatus: 'rejected' }),
      ctx(s.id),
    )
    expect(rejectedMismatch.status).toBe(201)
    expect((await saveMatch(req('POST', adminToken, { teacherId: t.id }), ctx(999999999))).status).toBe(404)
  })
})
