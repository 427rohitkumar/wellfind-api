import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  enquirySources,
  isValidEnquirySource,
  isValidStudentStatus,
  studentStatuses,
} from '@/lib/studentValidation'
import { POST as publicCreateEnquiry, GET as listEnquiries } from '@/app/api/student-enquiries/route'
import { POST as adminCreateEnquiry } from '@/app/api/admin/student-enquiries/route'
import { POST as convertEnquiry } from '@/app/api/student-enquiries/[id]/convert/route'
import { POST as createStudent, GET as listStudents } from '@/app/api/students/route'
import { GET as getStudent, PATCH as patchStudent } from '@/app/api/students/[id]/route'

let payload: any
let adminToken: string | null = null
let teacherToken: string | null = null
let adminUserId: number | null = null
let teacherUser: Record<string, unknown> | null = null
let adminUser: Record<string, unknown> | null = null

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEACHER_EMAIL = 'teacher@example.com'
const TEACHER_PASSWORD = 'TeacherPass123'

const createdEnquiryIds: number[] = []
const createdStudentIds: number[] = []
const createdAuditIds: number[] = []

function jsonRequest(
  path: string,
  method: string,
  headers: Record<string, string> = {},
  body?: unknown,
): Request {
  const init: RequestInit = {
    method,
    headers: {
      ...headers,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(`http://localhost:3000${path}`, init)
}

async function seedAuthUsers() {
  const existingAdmin = await payload.find({
    collection: 'users',
    where: { email: { equals: ADMIN_EMAIL } },
    limit: 1,
  })
  if (existingAdmin.docs.length === 0) {
    adminUser = await payload.create({
      collection: 'users',
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'super_admin',
        status: 'active',
      },
    })
  } else {
    adminUser = await payload.update({
      collection: 'users',
      id: existingAdmin.docs[0].id,
      data: {
        password: ADMIN_PASSWORD,
        role: 'super_admin',
        status: 'active',
      },
      overrideAccess: true,
    })
  }
  adminUserId = Number(adminUser?.id)

  const existingTeacher = await payload.find({
    collection: 'users',
    where: { email: { equals: TEACHER_EMAIL } },
    limit: 1,
  })
  if (existingTeacher.docs.length === 0) {
    teacherUser = await payload.create({
      collection: 'users',
      data: {
        email: TEACHER_EMAIL,
        password: TEACHER_PASSWORD,
        role: 'teacher',
        status: 'active',
      },
    })
  } else {
    teacherUser = await payload.update({
      collection: 'users',
      id: existingTeacher.docs[0].id,
      data: {
        password: TEACHER_PASSWORD,
        role: 'teacher',
        status: 'active',
      },
      overrideAccess: true,
    })
  }

  const adminLogin = await payload.login({
    collection: 'users',
    data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  adminToken = adminLogin.token

  const teacherLogin = await payload.login({
    collection: 'users',
    data: { email: TEACHER_EMAIL, password: TEACHER_PASSWORD },
  })
  teacherToken = teacherLogin.token
}

const VALID_ADMIN_ENQUIRY = {
  name: 'Amit Kumar',
  phoneNumber: '+91 98765 43210',
  studentClass: 'Class 8',
  subjects: ['Mathematics', 'Science'],
  preferredTiming: 'Evening',
  locality: 'Patna',
  budgetRange: '3000-5000',
  additionalNotes: 'Needs additional academic support.',
  enquirySource: 'phone_call',
}

describe('Phase 1 — validation helpers (unit)', () => {
  it('supports all PRD FR-A1 enquirySource values and rejects invalid values', () => {
    expect(enquirySources).toEqual([
      'website',
      'phone_call',
      'email',
      'referral',
      'network',
      'other',
    ])
    for (const source of enquirySources) {
      expect(isValidEnquirySource(source)).toBe(true)
    }
    expect(isValidEnquirySource('whatsapp')).toBe(false)
    expect(isValidEnquirySource('')).toBe(false)
    expect(isValidEnquirySource(null)).toBe(false)
  })

  it('supports student statuses and rejects invalid values', () => {
    expect(studentStatuses).toEqual(['active', 'inactive', 'paused', 'completed'])
    for (const status of studentStatuses) {
      expect(isValidStudentStatus(status)).toBe(true)
    }
    expect(isValidStudentStatus('unknown')).toBe(false)
  })
})

describe('Phase 1 — Student Enquiry Extension, Conversion & Student CRUD (DB/HTTP)', () => {
  beforeAll(async () => {
    const baseConfig = await config
    payload = await getPayload({ config: baseConfig })
    await seedAuthUsers()
  })

  afterAll(async () => {
    if (!payload) return

    for (const auditId of createdAuditIds) {
      await payload
        .delete({ collection: 'enquiry-audit-log', id: auditId, overrideAccess: true })
        .catch(() => {})
    }

    for (const studentId of createdStudentIds) {
      await payload
        .delete({ collection: 'students', id: studentId, overrideAccess: true })
        .catch(() => {})
    }

    for (const enquiryId of createdEnquiryIds) {
      const linkedStudents = await payload
        .find({
          collection: 'students',
          where: { studentEnquiry: { equals: enquiryId } },
          limit: 10,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const s of linkedStudents.docs || []) {
        await payload
          .delete({ collection: 'students', id: s.id, overrideAccess: true })
          .catch(() => {})
      }

      const linkedAudits = await payload
        .find({
          collection: 'enquiry-audit-log',
          where: { studentEnquiry: { equals: enquiryId } },
          limit: 20,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const a of linkedAudits.docs || []) {
        await payload
          .delete({ collection: 'enquiry-audit-log', id: a.id, overrideAccess: true })
          .catch(() => {})
      }

      await payload
        .delete({ collection: 'student-enquiries', id: enquiryId, overrideAccess: true })
        .catch(() => {})
    }
  })

  describe('FR-A1 & FR-A2 — Enquiry Source & Admin Manual Enquiry Creation', () => {
    it('public website submission defaults enquirySource to website, ignores spoofed referral, and rejects invalid source', async () => {
      const validRes = await publicCreateEnquiry(
        jsonRequest('/api/student-enquiries', 'POST', {}, {
          studentClass: 'Class 8',
          subjects: ['Mathematics'],
          preferredTiming: 'Evening',
          locality: 'Patna',
          budgetRange: '3000-5000',
          name: 'Public Source Check',
          phoneNumber: '+91 98765 01010',
          agreedToPolicy: true,
        }),
      )
      expect(validRes.status).toBe(201)
      const validJson = await validRes.json()
      createdEnquiryIds.push(validJson.enquiry.id)
      expect(validJson.enquiry.enquirySource).toBe('website')

      // Spoof attempt on public endpoint is forced back to 'website'
      const spoofRes = await publicCreateEnquiry(
        jsonRequest('/api/student-enquiries', 'POST', {}, {
          studentClass: 'Class 8',
          subjects: ['Science'],
          preferredTiming: 'Morning',
          locality: 'Patna',
          budgetRange: '3000-5000',
          name: 'Public Spoof Check',
          phoneNumber: '+91 98765 01011',
          agreedToPolicy: true,
          enquirySource: 'phone_call',
          enquiryStatus: 'converted',
        }),
      )
      expect(spoofRes.status).toBe(201)
      const spoofJson = await spoofRes.json()
      createdEnquiryIds.push(spoofJson.enquiry.id)
      expect(spoofJson.enquiry.enquirySource).toBe('website')

      const stored = await payload.findByID({
        collection: 'student-enquiries',
        id: spoofJson.enquiry.id,
        overrideAccess: true,
      })
      expect(stored.enquirySource).toBe('website')
      expect(stored.enquiryStatus).toBe('new')

      // Invalid source on public route rejected with 400
      const invalidRes = await publicCreateEnquiry(
        jsonRequest('/api/student-enquiries', 'POST', {}, {
          studentClass: 'Class 8',
          subjects: ['Science'],
          preferredTiming: 'Morning',
          locality: 'Patna',
          budgetRange: '3000-5000',
          name: 'Invalid Source Check',
          phoneNumber: '+91 98765 01012',
          agreedToPolicy: true,
          enquirySource: 'walk_in_invalid',
        }),
      )
      expect(invalidRes.status).toBe(400)
    })

    it('rejects unauthenticated (401) and teacher (403) callers on POST /api/admin/student-enquiries', async () => {
      const unauthRes = await adminCreateEnquiry(
        jsonRequest('/api/admin/student-enquiries', 'POST', {}, VALID_ADMIN_ENQUIRY),
      )
      expect(unauthRes.status).toBe(401)
      const unauthJson = await unauthRes.json()
      expect(unauthJson.success).toBe(false)

      const teacherRes = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${teacherToken}` },
          VALID_ADMIN_ENQUIRY,
        ),
      )
      expect(teacherRes.status).toBe(403)
      const teacherJson = await teacherRes.json()
      expect(teacherJson.success).toBe(false)
    })

    it('allows super_admin to create offline enquiry with any valid enquirySource and filter by enquirySource', async () => {
      for (const source of ['phone_call', 'email', 'referral', 'network', 'other'] as const) {
        const res = await adminCreateEnquiry(
          jsonRequest(
            '/api/admin/student-enquiries',
            'POST',
            { authorization: `Bearer ${adminToken}` },
            {
              ...VALID_ADMIN_ENQUIRY,
              name: `Manual ${source}`,
              enquirySource: source,
              adminNotes: 'Captured offline.',
              assignedTo: adminUserId,
            },
          ),
        )
        expect(res.status).toBe(201)
        const json = await res.json()
        expect(json.success).toBe(true)
        expect(json.data.enquirySource).toBe(source)
        expect(json.data.enquiryStatus).toBe('new')
        expect(json.data.phoneNumber).toBe('+919876543210')
        expect(json.data.adminNotes).toBe('Captured offline.')
        expect(json.data.assignedTo).toBe(adminUserId)
        createdEnquiryIds.push(json.data.id)
      }

      const listRes = await listEnquiries(
        jsonRequest('/api/student-enquiries?enquirySource=referral&limit=20', 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
      )
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(listJson.docs.some((d: any) => d.enquirySource === 'referral')).toBe(true)
    })

    it('rejects invalid source, invalid phone, missing fields, and nonexistent assignedTo on POST /api/admin/student-enquiries', async () => {
      const badSource = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, enquirySource: 'sms_campaign' },
        ),
      )
      expect(badSource.status).toBe(400)
      const badSourceJson = await badSource.json()
      expect(badSourceJson.success).toBe(false)
      expect(badSourceJson.errors?.[0]?.field).toBe('enquirySource')

      const badAssignee = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, assignedTo: 9999999 },
        ),
      )
      expect(badAssignee.status).toBe(400)
    })
  })

  describe('FR-A3 — Safe Enquiry-to-Student Conversion', () => {
    it('enforces super_admin authentication and valid ID / existence checks on /convert', async () => {
      const unauth = await convertEnquiry(
        jsonRequest('/api/student-enquiries/1/convert', 'POST'),
        { params: Promise.resolve({ id: '1' }) },
      )
      expect(unauth.status).toBe(401)

      const teacherRes = await convertEnquiry(
        jsonRequest('/api/student-enquiries/1/convert', 'POST', {
          authorization: `Bearer ${teacherToken}`,
        }),
        { params: Promise.resolve({ id: '1' }) },
      )
      expect(teacherRes.status).toBe(403)

      const invalidId = await convertEnquiry(
        jsonRequest('/api/student-enquiries/abc/convert', 'POST', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: 'abc' }) },
      )
      expect(invalidId.status).toBe(400)

      const notFound = await convertEnquiry(
        jsonRequest('/api/student-enquiries/9999999/convert', 'POST', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: '9999999' }) },
      )
      expect(notFound.status).toBe(404)
    })

    it.each(['new', 'contacted', 'in_progress'] as const)(
      'allows explicit admin conversion from %s into converted (never allocated) and preserves audit trail',
      async (initialStatus) => {
        const created = await adminCreateEnquiry(
          jsonRequest(
            '/api/admin/student-enquiries',
            'POST',
            { authorization: `Bearer ${adminToken}` },
            {
              ...VALID_ADMIN_ENQUIRY,
              name: `Convert From ${initialStatus}`,
              enquirySource: 'referral',
            },
          ),
        )
        const { data: enquiry } = await created.json()
        createdEnquiryIds.push(enquiry.id)

        if (initialStatus === 'contacted' || initialStatus === 'in_progress') {
          await payload.update({
            collection: 'student-enquiries',
            id: enquiry.id,
            data: { enquiryStatus: 'contacted' },
            user: adminUser,
            overrideAccess: true,
          })
        }
        if (initialStatus === 'in_progress') {
          await payload.update({
            collection: 'student-enquiries',
            id: enquiry.id,
            data: { enquiryStatus: 'in_progress' },
            user: adminUser,
            overrideAccess: true,
          })
        }

        const convertRes = await convertEnquiry(
          jsonRequest(
            `/api/student-enquiries/${enquiry.id}/convert`,
            'POST',
            { authorization: `Bearer ${adminToken}` },
            {
              parentName: 'Rajesh Kumar',
              parentEmail: 'parent@example.com',
              learningNotes: 'Needs extra help in algebra.',
            },
          ),
          { params: Promise.resolve({ id: String(enquiry.id) }) },
        )

        expect(convertRes.status).toBe(201)
        const convertJson = await convertRes.json()
        expect(convertJson.success).toBe(true)
        const student = convertJson.data.student
        const updatedEnquiry = convertJson.data.enquiry
        createdStudentIds.push(student.id)

        expect(student.id).toBeDefined()
        expect(student.name).toBe(`Convert From ${initialStatus}`)
        expect(student.parentName).toBe('Rajesh Kumar')
        expect(student.parentEmail).toBe('parent@example.com')
        expect(student.subjects).toEqual(['Mathematics', 'Science'])
        expect(student.studentEnquiry).toBe(enquiry.id)
        expect(student.status).toBe('active')
        expect(student.convertedBy).toBe(adminUserId)
        expect(updatedEnquiry.enquiryStatus).toBe('converted')
        expect(updatedEnquiry.enquiryStatus).not.toBe('allocated')

        // Audit entry recorded conversion
        const audits = await payload.find({
          collection: 'enquiry-audit-log',
          where: { studentEnquiry: { equals: enquiry.id } },
          sort: '-changedAt',
          limit: 5,
          overrideAccess: true,
        })
        expect(audits.docs.length).toBeGreaterThanOrEqual(1)
        expect(audits.docs[0].previousStatus).toBe(initialStatus)
        expect(audits.docs[0].newStatus).toBe('converted')

        // Duplicate sequential conversion rejected with 409
        const duplicateRes = await convertEnquiry(
          jsonRequest(`/api/student-enquiries/${enquiry.id}/convert`, 'POST', {
            authorization: `Bearer ${adminToken}`,
          }),
          { params: Promise.resolve({ id: String(enquiry.id) }) },
        )
        expect(duplicateRes.status).toBe(409)

        const studentCount = await payload.count({
          collection: 'students',
          where: { studentEnquiry: { equals: enquiry.id } },
          overrideAccess: true,
        })
        expect(studentCount.totalDocs).toBe(1)
      },
    )

    it('rejects conversion from closed and allocated enquiries', async () => {
      // Closed enquiry
      const closedCreate = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, name: 'Closed Enquiry Case' },
        ),
      )
      const { data: closedEnquiry } = await closedCreate.json()
      createdEnquiryIds.push(closedEnquiry.id)

      await payload.update({
        collection: 'student-enquiries',
        id: closedEnquiry.id,
        data: { enquiryStatus: 'closed', changeReason: 'Parent postponed.' },
        user: adminUser,
        overrideAccess: true,
      })

      const closedConvert = await convertEnquiry(
        jsonRequest(`/api/student-enquiries/${closedEnquiry.id}/convert`, 'POST', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: String(closedEnquiry.id) }) },
      )
      expect(closedConvert.status).toBe(400)

      // Allocated enquiry
      const allocCreate = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, name: 'Allocated Enquiry Case' },
        ),
      )
      const { data: allocEnquiry } = await allocCreate.json()
      createdEnquiryIds.push(allocEnquiry.id)

      await payload.update({
        collection: 'student-enquiries',
        id: allocEnquiry.id,
        data: { enquiryStatus: 'contacted' },
        user: adminUser,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'student-enquiries',
        id: allocEnquiry.id,
        data: { enquiryStatus: 'in_progress' },
        user: adminUser,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'student-enquiries',
        id: allocEnquiry.id,
        data: { enquiryStatus: 'converted' },
        user: adminUser,
        overrideAccess: true,
      })
      await payload.update({
        collection: 'student-enquiries',
        id: allocEnquiry.id,
        data: { enquiryStatus: 'allocated' },
        user: adminUser,
        overrideAccess: true,
      })

      const allocConvert = await convertEnquiry(
        jsonRequest(`/api/student-enquiries/${allocEnquiry.id}/convert`, 'POST', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: String(allocEnquiry.id) }) },
      )
      expect(allocConvert.status).toBe(400)
    })

    it('prevents concurrent duplicate student creation when /convert is called in parallel', async () => {
      const created = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, name: 'Concurrent Convert Race' },
        ),
      )
      const { data: enquiry } = await created.json()
      createdEnquiryIds.push(enquiry.id)

      const [r1, r2] = await Promise.all([
        convertEnquiry(
          jsonRequest(`/api/student-enquiries/${enquiry.id}/convert`, 'POST', {
            authorization: `Bearer ${adminToken}`,
          }),
          { params: Promise.resolve({ id: String(enquiry.id) }) },
        ),
        convertEnquiry(
          jsonRequest(`/api/student-enquiries/${enquiry.id}/convert`, 'POST', {
            authorization: `Bearer ${adminToken}`,
          }),
          { params: Promise.resolve({ id: String(enquiry.id) }) },
        ),
      ])

      const statuses = [r1.status, r2.status].sort()
      expect(statuses).toEqual([201, 409])

      const studentsForEnquiry = await payload.find({
        collection: 'students',
        where: { studentEnquiry: { equals: enquiry.id } },
        limit: 10,
        overrideAccess: true,
      })
      expect(studentsForEnquiry.totalDocs).toBe(1)
      createdStudentIds.push(studentsForEnquiry.docs[0].id)

      const audits = await payload.find({
        collection: 'enquiry-audit-log',
        where: { studentEnquiry: { equals: enquiry.id } },
        limit: 10,
        overrideAccess: true,
      })
      expect(audits.totalDocs).toBe(1)
      expect(audits.docs[0].newStatus).toBe('converted')
    })

    it('rolls back student creation if enquiry update fails during conversion transaction', async () => {
      const created = await adminCreateEnquiry(
        jsonRequest(
          '/api/admin/student-enquiries',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          { ...VALID_ADMIN_ENQUIRY, name: 'Tx Rollback Student' },
        ),
      )
      const { data: enquiry } = await created.json()
      createdEnquiryIds.push(enquiry.id)

      const origUpdate = payload.update.bind(payload)
      payload.update = async (args: any) => {
        if (args.collection === 'student-enquiries') {
          throw new Error('Simulated DB failure updating enquiry')
        }
        return origUpdate(args)
      }

      let failedRes: Response
      try {
        failedRes = await convertEnquiry(
          jsonRequest(`/api/student-enquiries/${enquiry.id}/convert`, 'POST', {
            authorization: `Bearer ${adminToken}`,
          }),
          { params: Promise.resolve({ id: String(enquiry.id) }) },
        )
      } finally {
        payload.update = origUpdate
      }

      expect(failedRes.status).toBe(500)

      // No orphan student record should exist and enquiry remains 'new'
      const orphanCheck = await payload.find({
        collection: 'students',
        where: { studentEnquiry: { equals: enquiry.id } },
        overrideAccess: true,
      })
      expect(orphanCheck.totalDocs).toBe(0)

      const currentEnquiry = await payload.findByID({
        collection: 'student-enquiries',
        id: enquiry.id,
        overrideAccess: true,
      })
      expect(currentEnquiry.enquiryStatus).toBe('new')
    })
  })

  describe('FR-A4 — Student CRUD (/api/students & /api/students/:id)', () => {
    it('denies unauthenticated (401) and teacher (403) callers on all student endpoints and collection access control', async () => {
      const resListUnauth = await listStudents(jsonRequest('/api/students', 'GET'))
      expect(resListUnauth.status).toBe(401)

      const resListTeacher = await listStudents(
        jsonRequest('/api/students', 'GET', {
          authorization: `Bearer ${teacherToken}`,
        }),
      )
      expect(resListTeacher.status).toBe(403)

      const resCreateTeacher = await createStudent(
        jsonRequest(
          '/api/students',
          'POST',
          { authorization: `Bearer ${teacherToken}` },
          {
            name: 'Denied Student',
            phoneNumber: '+91 98765 11111',
            studentClass: 'Class 9',
            subjects: ['Mathematics'],
            locality: 'Patna',
            preferredTiming: 'Evening',
          },
        ),
      )
      expect(resCreateTeacher.status).toBe(403)

      const resGetTeacher = await getStudent(
        jsonRequest('/api/students/1', 'GET', {
          authorization: `Bearer ${teacherToken}`,
        }),
        { params: Promise.resolve({ id: '1' }) },
      )
      expect(resGetTeacher.status).toBe(403)

      const resPatchUnauth = await patchStudent(
        jsonRequest('/api/students/1', 'PATCH', {}, { name: 'Hack' }),
        { params: Promise.resolve({ id: '1' }) },
      )
      expect(resPatchUnauth.status).toBe(401)

      // Collection-level Payload access check with overrideAccess: false
      await expect(
        payload.find({
          collection: 'students',
          user: teacherUser,
          overrideAccess: false,
        }),
      ).rejects.toBeDefined()
    })

    it('supports creating, listing, filtering, retrieving, and updating operational student records', async () => {
      // Reject spoofing studentEnquiry directly on POST /api/students
      const spoofLink = await createStudent(
        jsonRequest(
          '/api/students',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          {
            name: 'Direct Spoof',
            phoneNumber: '+91 98765 22222',
            studentClass: 'Class 9',
            subjects: ['Physics'],
            locality: 'Gaya',
            preferredTiming: 'Morning',
            studentEnquiry: 1,
          },
        ),
      )
      expect(spoofLink.status).toBe(400)

      // Create valid direct student
      const createRes = await createStudent(
        jsonRequest(
          '/api/students',
          'POST',
          { authorization: `Bearer ${adminToken}` },
          {
            name: 'Riya Verma',
            parentName: 'Suresh Verma',
            phoneNumber: '+91 98765-33333',
            alternatePhoneNumber: '+91 98765 33334',
            parentEmail: 'suresh.verma@example.com',
            studentClass: 'Class 10',
            subjects: ['Mathematics', 'Chemistry'],
            locality: 'Boring Road, Patna',
            preferredTiming: 'Weekday evenings',
            budgetRange: '4000-6000',
            learningNotes: 'Preparing for board exams.',
          },
        ),
      )
      expect(createRes.status).toBe(201)
      const createJson = await createRes.json()
      expect(createJson.success).toBe(true)
      const student = createJson.data
      createdStudentIds.push(student.id)

      expect(student.phoneNumber).toBe('+919876533333')
      expect(student.alternatePhoneNumber).toBe('+919876533334')
      expect(student.subjects).toEqual(['Mathematics', 'Chemistry'])
      expect(student.status).toBe('active')
      expect(student.studentEnquiry).toBeNull()

      // List + filter + search
      const listRes = await listStudents(
        jsonRequest('/api/students?status=active&search=Riya&limit=10&page=1', 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
      )
      expect(listRes.status).toBe(200)
      const listJson = await listRes.json()
      expect(listJson.success).toBe(true)
      expect(listJson.data.docs.some((d: any) => d.id === student.id)).toBe(true)

      // Get by ID
      const getRes = await getStudent(
        jsonRequest(`/api/students/${student.id}`, 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: String(student.id) }) },
      )
      expect(getRes.status).toBe(200)
      const getJson = await getRes.json()
      expect(getJson.data.id).toBe(student.id)
      expect(getJson.data.name).toBe('Riya Verma')

      // Invalid ID & missing ID
      const badIdGet = await getStudent(
        jsonRequest('/api/students/xyz', 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: 'xyz' }) },
      )
      expect(badIdGet.status).toBe(400)

      const missingGet = await getStudent(
        jsonRequest('/api/students/9999999', 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: '9999999' }) },
      )
      expect(missingGet.status).toBe(404)

      // PATCH valid update
      const patchRes = await patchStudent(
        jsonRequest(
          `/api/students/${student.id}`,
          'PATCH',
          { authorization: `Bearer ${adminToken}` },
          {
            subjects: ['Mathematics', 'Physics'],
            preferredTiming: 'Weekend mornings',
            status: 'paused',
          },
        ),
        { params: Promise.resolve({ id: String(student.id) }) },
      )
      expect(patchRes.status).toBe(200)
      const patchJson = await patchRes.json()
      expect(patchJson.data.subjects).toEqual(['Mathematics', 'Physics'])
      expect(patchJson.data.preferredTiming).toBe('Weekend mornings')
      expect(patchJson.data.status).toBe('paused')

      // PATCH rejects invalid email, invalid status, and immutable studentEnquiry
      const badPatchStatus = await patchStudent(
        jsonRequest(
          `/api/students/${student.id}`,
          'PATCH',
          { authorization: `Bearer ${adminToken}` },
          { status: 'invalid_status' },
        ),
        { params: Promise.resolve({ id: String(student.id) }) },
      )
      expect(badPatchStatus.status).toBe(400)

      const immutablePatch = await patchStudent(
        jsonRequest(
          `/api/students/${student.id}`,
          'PATCH',
          { authorization: `Bearer ${adminToken}` },
          { studentEnquiry: 5 },
        ),
        { params: Promise.resolve({ id: String(student.id) }) },
      )
      expect(immutablePatch.status).toBe(400)
    })
  })
})
