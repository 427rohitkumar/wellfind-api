import { getPayload } from 'payload'
import config from '@/payload.config'
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { GET as getTeachers } from '@/app/api/teachers/route'
import { GET as getTeacherById } from '@/app/api/teachers/[id]/route'

let payload: any
const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'

describe('Teachers Module API Endpoints (/api/teachers)', () => {
  let adminToken: string = ''
  let testAppId: number
  let testProfileId: number

  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })

    // Login as admin
    const loginRes = await payload.login({
      collection: 'users',
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    })
    adminToken = loginRes.token

    // Create an approved teacher enquiry
    const app = await payload.create({
      collection: 'teacher-enquiries',
      data: {
        fullName: 'Dr. Debabrata Banerjee',
        mobileNumber: '+91 98301 24510',
        email: 'debabrata.b@wellfind.academic',
        highestQualification: 'Ph.D. in Applied Mathematics',
        teachingExperience: '10 years',
        primarySubject: 'Mathematics',
        classLevel: 'Classes 11–12 & JEE Advanced',
        teachingLocality: 'Salt Lake, Sector 2, Kolkata',
        preferredAvailability: 'Mon-Fri: 5:00 PM – 8:30 PM',
        agreedToPolicy: true,
      },
    })
    testAppId = app.id

    // Advance through valid transitions: new -> under_review -> shortlisted -> approved
    await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: { applicationStatus: 'under_review' },
    })
    await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: { applicationStatus: 'shortlisted' },
    })
    const approved = await payload.update({
      collection: 'teacher-enquiries',
      id: app.id,
      data: {
        applicationStatus: 'approved',
      },
    })

    const profiles = await payload.find({
      collection: 'teacher-profiles',
      where: { teacherEnquiry: { equals: app.id } },
    })
    testProfileId = profiles.docs[0].id
  })

  it('should deny unauthenticated callers from listing teachers', async () => {
    const req = new Request('http://localhost:3000/api/teachers')
    const res = await getTeachers(req)
    expect(res.status).toBe(403)
  })

  it('should allow super_admin to list approved teachers', async () => {
    const req = new Request('http://localhost:3000/api/teachers', {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const res = await getTeachers(req)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.docs)).toBe(true)
    expect(json.totalDocs).toBeGreaterThanOrEqual(1)
    const match = json.docs.find((d: any) => d.id === testProfileId || d.name === 'Dr. Debabrata Banerjee')
    expect(match).toBeDefined()
    expect(match.name).toBe('Dr. Debabrata Banerjee')
    expect(match.approvalStatus).toBe('approved')
  })

  it('should allow super_admin to get teacher details by profile ID', async () => {
    const req = new Request(`http://localhost:3000/api/teachers/${testProfileId}`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    })
    const res = await getTeacherById(req, { params: Promise.resolve({ id: String(testProfileId) }) })
    expect(res.status).toBe(200)
    const doc = await res.json()
    expect(doc.id).toBe(testProfileId)
    expect(doc.name).toBe('Dr. Debabrata Banerjee')
    expect(doc.primarySubject).toBe('Mathematics')
  })

  afterAll(async () => {
    try {
      if (testProfileId) {
        await payload.delete({ collection: 'teacher-profiles', id: testProfileId })
      }
      if (testAppId) {
        await payload.delete({ collection: 'teacher-enquiries', id: testAppId })
      }
    } catch {
      // Ignore
    }
  })
})
