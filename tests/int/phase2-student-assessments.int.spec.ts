import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  capabilityLevels,
  isValidCapabilityLevel,
  validateAndBuildAssessmentData,
} from '@/lib/studentValidation'
import { POST as adminCreateEnquiry } from '@/app/api/admin/student-enquiries/route'
import { POST as convertEnquiry } from '@/app/api/student-enquiries/[id]/convert/route'
import { POST as createStudent, GET as getStudents } from '@/app/api/students/route'
import { GET as getStudent } from '@/app/api/students/[id]/route'
import {
  GET as listStudentAssessments,
  POST as createStudentAssessment,
} from '@/app/api/students/[id]/assessments/route'

let payload: any
let adminToken: string | null = null
let teacherToken: string | null = null
let suspendedAdminToken: string | null = null
let adminUserId: number | null = null
let teacherUser: Record<string, unknown> | null = null
let adminUser: Record<string, unknown> | null = null
let suspendedAdminUser: Record<string, unknown> | null = null

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEACHER_EMAIL = 'phase2-teacher@example.com'
const TEACHER_PASSWORD = 'TeacherPass123'
const SUSPENDED_ADMIN_EMAIL = 'phase2-suspended-admin@example.com'
const SUSPENDED_ADMIN_PASSWORD = 'SuspendedPass123'

const createdEnquiryIds: number[] = []
const createdStudentIds: number[] = []
const createdAssessmentIds: number[] = []
const tempUserIds: number[] = []

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
    tempUserIds.push(Number(teacherUser?.id))
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

  // Create suspended admin actively first so Payload login succeeds, then suspend it
  const existingSuspended = await payload.find({
    collection: 'users',
    where: { email: { equals: SUSPENDED_ADMIN_EMAIL } },
    limit: 1,
  })
  if (existingSuspended.docs.length === 0) {
    suspendedAdminUser = await payload.create({
      collection: 'users',
      data: {
        email: SUSPENDED_ADMIN_EMAIL,
        password: SUSPENDED_ADMIN_PASSWORD,
        role: 'super_admin',
        status: 'active',
      },
    })
    tempUserIds.push(Number(suspendedAdminUser?.id))
  } else {
    suspendedAdminUser = await payload.update({
      collection: 'users',
      id: existingSuspended.docs[0].id,
      data: {
        password: SUSPENDED_ADMIN_PASSWORD,
        role: 'super_admin',
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

  const suspendedLogin = await payload.login({
    collection: 'users',
    data: { email: SUSPENDED_ADMIN_EMAIL, password: SUSPENDED_ADMIN_PASSWORD },
  })
  suspendedAdminToken = suspendedLogin.token

  suspendedAdminUser = await payload.update({
    collection: 'users',
    id: suspendedAdminUser?.id,
    data: { status: 'suspended' },
    overrideAccess: true,
  })
}

async function createTestStudent(nameSuffix: string): Promise<number> {
  const res = await createStudent(
    jsonRequest(
      '/api/students',
      'POST',
      { authorization: `Bearer ${adminToken}` },
      {
        name: `Assessment Student ${nameSuffix}`,
        parentName: `Parent ${nameSuffix}`,
        phoneNumber: '+91 98765 55501',
        studentClass: 'Class 8',
        subjects: ['Mathematics', 'Science'],
        locality: 'Patna',
        preferredTiming: 'Evening',
        budgetRange: '3000-5000',
      },
    ),
  )
  expect(res.status).toBe(201)
  const json = await res.json()
  const studentId = Number(json.data.id)
  createdStudentIds.push(studentId)
  return studentId
}

const VALID_ASSESSMENT_PAYLOAD = {
  assessmentType: 'initial_review',
  previousPerformance: {
    summary: 'Average academic performance',
    details: 'Needs improvement in Mathematics.',
  },
  currentCapability: 'needs_improvement',
  strengths: ['English'],
  weaknesses: ['Mathematics', 'Science'],
  adminNotes: 'Requires individual attention.',
}

describe('Phase 2 — FR-B1 Capability Assessment validation (unit)', () => {
  it('recognizes all PRD FR-B1 capabilityLevels and rejects unsupported values', () => {
    expect(capabilityLevels).toEqual([
      'excellent',
      'good',
      'average',
      'needs_improvement',
      'weak',
    ])
    for (const level of capabilityLevels) {
      expect(isValidCapabilityLevel(level)).toBe(true)
    }
    expect(isValidCapabilityLevel('poor')).toBe(false)
    expect(isValidCapabilityLevel('')).toBe(false)
    expect(isValidCapabilityLevel(123)).toBe(false)
  })

  it('validates assessment payloads, defaults assessmentType, and rejects invalid/missing fields', () => {
    const valid = validateAndBuildAssessmentData(VALID_ASSESSMENT_PAYLOAD, 5)
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.data.assessmentType).toBe('initial_review')
      expect(valid.data.currentCapability).toBe('needs_improvement')
      expect(valid.data.strengths).toEqual([{ item: 'English' }])
      expect(valid.data.weaknesses).toEqual([
        { item: 'Mathematics' },
        { item: 'Science' },
      ])
    }

    const defaulted = validateAndBuildAssessmentData({
      previousPerformance: { summary: 'Consistent effort' },
      currentCapability: 'good',
      strengths: ['History'],
      weaknesses: [],
    })
    expect(defaulted.ok).toBe(true)
    if (defaulted.ok) {
      expect(defaulted.data.assessmentType).toBe('initial_review')
      expect(defaulted.data.weaknesses).toEqual([])
    }

    const mismatch = validateAndBuildAssessmentData(
      { ...VALID_ASSESSMENT_PAYLOAD, studentId: 99 },
      5,
    )
    expect(mismatch.ok).toBe(false)
    if (!mismatch.ok) {
      expect(mismatch.field).toBe('studentId')
    }
  })
})

describe('Phase 2 — FR-B1 Student Capability Assessments (DB/HTTP)', () => {
  beforeAll(async () => {
    const baseConfig = await config
    payload = await getPayload({ config: baseConfig })
    await seedAuthUsers()
  })

  afterAll(async () => {
    if (!payload) return

    for (const assessmentId of createdAssessmentIds) {
      await payload
        .delete({
          collection: 'student-assessments',
          id: assessmentId,
          overrideAccess: true,
        })
        .catch(() => {})
    }

    for (const studentId of createdStudentIds) {
      const remaining = await payload
        .find({
          collection: 'student-assessments',
          where: { student: { equals: studentId } },
          limit: 50,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const a of remaining.docs || []) {
        await payload
          .delete({
            collection: 'student-assessments',
            id: a.id,
            overrideAccess: true,
          })
          .catch(() => {})
      }

      await payload
        .delete({ collection: 'students', id: studentId, overrideAccess: true })
        .catch(() => {})
    }

    for (const userId of tempUserIds) {
      await payload
        .delete({ collection: 'users', id: userId, overrideAccess: true })
        .catch(() => {})
    }

    for (const enquiryId of createdEnquiryIds) {
      const audits = await payload
        .find({
          collection: 'enquiry-audit-log',
          where: { studentEnquiry: { equals: enquiryId } },
          limit: 20,
          overrideAccess: true,
        })
        .catch(() => ({ docs: [] }))
      for (const a of audits.docs || []) {
        await payload
          .delete({ collection: 'enquiry-audit-log', id: a.id, overrideAccess: true })
          .catch(() => {})
      }

      await payload
        .delete({ collection: 'student-enquiries', id: enquiryId, overrideAccess: true })
        .catch(() => {})
    }
  })

  it('creates a capability assessment without a physical test, persists links/strings, and ignores client-supplied assessedBy', async () => {
    const studentId = await createTestStudent('Create')

    const res = await createStudentAssessment(
      jsonRequest(
        `/api/students/${studentId}/assessments`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          assessedBy: teacherUser?.id,
        },
      ),
      { params: Promise.resolve({ id: String(studentId) }) },
    )

    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.id).toBeDefined()
    createdAssessmentIds.push(Number(json.data.id))

    expect(json.data.student).toBe(studentId)
    expect(json.data.assessmentType).toBe('initial_review')
    expect(json.data.previousPerformance).toEqual({
      summary: 'Average academic performance',
      details: 'Needs improvement in Mathematics.',
    })
    expect(json.data.currentCapability).toBe('needs_improvement')
    expect(json.data.strengths).toEqual(['English'])
    expect(json.data.weaknesses).toEqual(['Mathematics', 'Science'])
    expect(json.data.adminNotes).toBe('Requires individual attention.')
    expect(json.data.assessedBy).toBe(adminUserId)
    expect(typeof json.data.assessedAt).toBe('string')

    // Verify persisted in PostgreSQL directly
    const persisted = await payload.findByID({
      collection: 'student-assessments',
      id: json.data.id,
      overrideAccess: true,
    })
    expect(persisted).toBeDefined()
    expect(persisted.currentCapability).toBe('needs_improvement')
  })

  it('preserves full assessment history across multiple submissions and scopes GET results per student', async () => {
    const studentA = await createTestStudent('History-A')
    const studentB = await createTestStudent('History-B')

    const payloads = [
      {
        assessmentType: 'initial_review',
        previousPerformance: { summary: 'Initial baseline', details: 'Struggles with algebra' },
        currentCapability: 'weak',
        strengths: [],
        weaknesses: ['Algebra'],
        adminNotes: 'First assessment',
      },
      {
        assessmentType: 'periodic_review',
        previousPerformance: { summary: 'Shows steady improvement' },
        currentCapability: 'average',
        strengths: ['Arithmetic'],
        weaknesses: ['Geometry'],
        adminNotes: 'Second assessment',
      },
      {
        assessmentType: 'reassessment',
        previousPerformance: { summary: 'Strong recent quiz scores' },
        currentCapability: 'good',
        strengths: ['Mathematics', 'English'],
        weaknesses: [],
        adminNotes: 'Third assessment',
      },
    ]

    for (const item of payloads) {
      const postRes = await createStudentAssessment(
        jsonRequest(
          `/api/students/${studentA}/assessments`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          item,
        ),
        { params: Promise.resolve({ id: String(studentA) }) },
      )
      expect(postRes.status).toBe(201)
      const postJson = await postRes.json()
      createdAssessmentIds.push(Number(postJson.data.id))
    }

    // Create assessment on studentB to ensure strict isolation
    const bRes = await createStudentAssessment(
      jsonRequest(
        `/api/students/${studentB}/assessments`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          assessmentType: 'initial_review',
          previousPerformance: { summary: 'High achiever' },
          currentCapability: 'excellent',
          strengths: ['Physics'],
          weaknesses: [],
        },
      ),
      { params: Promise.resolve({ id: String(studentB) }) },
    )
    expect(bRes.status).toBe(201)
    const bJson = await bRes.json()
    createdAssessmentIds.push(Number(bJson.data.id))

    const listRes = await listStudentAssessments(
      jsonRequest(
        `/api/students/${studentA}/assessments?page=1&limit=2&sort=id`,
        'GET',
        { authorization: `Bearer ${adminToken}` },
      ),
      { params: Promise.resolve({ id: String(studentA) }) },
    )
    expect(listRes.status).toBe(200)
    const listJson = await listRes.json()
    expect(listJson.success).toBe(true)
    expect(listJson.data.totalDocs).toBe(3)
    expect(listJson.data.totalPages).toBe(2)
    expect(listJson.data.hasNextPage).toBe(true)
    expect(listJson.data.docs).toHaveLength(2)
    expect(listJson.data.docs.every((d: any) => d.student === studentA)).toBe(true)
    expect(listJson.data.docs[0].currentCapability).toBe('weak')
    expect(listJson.data.docs[1].currentCapability).toBe('average')

    const filteredRes = await listStudentAssessments(
      jsonRequest(
        `/api/students/${studentA}/assessments?currentCapability=good`,
        'GET',
        { authorization: `Bearer ${adminToken}` },
      ),
      { params: Promise.resolve({ id: String(studentA) }) },
    )
    expect(filteredRes.status).toBe(200)
    const filteredJson = await filteredRes.json()
    expect(filteredJson.data.totalDocs).toBe(1)
    expect(filteredJson.data.docs[0].assessmentType).toBe('reassessment')
    expect(filteredJson.data.docs[0].strengths).toEqual(['Mathematics', 'English'])
  })

  it('rejects invalid student IDs (400) and nonexistent student references (404) on POST and GET', async () => {
    for (const invalidId of ['abc', '0', '-4']) {
      const postRes = await createStudentAssessment(
        jsonRequest(
          `/api/students/${invalidId}/assessments`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          VALID_ASSESSMENT_PAYLOAD,
        ),
        { params: Promise.resolve({ id: invalidId }) },
      )
      expect(postRes.status).toBe(400)
      const postJson = await postRes.json()
      expect(postJson.success).toBe(false)

      const getRes = await listStudentAssessments(
        jsonRequest(`/api/students/${invalidId}/assessments`, 'GET', {
          authorization: `Bearer ${adminToken}`,
        }),
        { params: Promise.resolve({ id: invalidId }) },
      )
      expect(getRes.status).toBe(400)
    }

    const nonexistentPost = await createStudentAssessment(
      jsonRequest(
        '/api/students/99999999/assessments',
        'POST',
        { authorization: `Bearer ${adminToken}` },
        VALID_ASSESSMENT_PAYLOAD,
      ),
      { params: Promise.resolve({ id: '99999999' }) },
    )
    expect(nonexistentPost.status).toBe(404)
    const npJson = await nonexistentPost.json()
    expect(npJson.success).toBe(false)
    expect(npJson.message).toBe('Student does not exist.')

    const nonexistentGet = await listStudentAssessments(
      jsonRequest('/api/students/99999999/assessments', 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      { params: Promise.resolve({ id: '99999999' }) },
    )
    expect(nonexistentGet.status).toBe(404)
  })

  it('rejects missing required fields, invalid capability values, malformed inputs, and invalid query filters', async () => {
    const studentId = await createTestStudent('Validation')

    const invalidBodies: Array<[string, Record<string, unknown>]> = [
      [
        'missing previousPerformance',
        {
          currentCapability: 'good',
          strengths: ['Math'],
          weaknesses: ['English'],
        },
      ],
      [
        'missing previousPerformance.summary',
        {
          previousPerformance: { details: 'Only details provided' },
          currentCapability: 'good',
          strengths: ['Math'],
          weaknesses: ['English'],
        },
      ],
      [
        'missing currentCapability',
        {
          previousPerformance: { summary: 'Average' },
          strengths: ['Math'],
          weaknesses: ['English'],
        },
      ],
      [
        'invalid currentCapability',
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          currentCapability: 'super_smart',
        },
      ],
      [
        'missing strengths',
        {
          previousPerformance: { summary: 'Average' },
          currentCapability: 'average',
          weaknesses: ['Science'],
        },
      ],
      [
        'non-array strengths',
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          strengths: 'English',
        },
      ],
      [
        'blank element in weaknesses',
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          weaknesses: ['   '],
        },
      ],
      [
        'blank assessmentType',
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          assessmentType: '   ',
        },
      ],
      [
        'mismatched body studentId',
        {
          ...VALID_ASSESSMENT_PAYLOAD,
          studentId: studentId + 1,
        },
      ],
    ]

    for (const [, payloadBody] of invalidBodies) {
      const res = await createStudentAssessment(
        jsonRequest(
          `/api/students/${studentId}/assessments`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          payloadBody,
        ),
        { params: Promise.resolve({ id: String(studentId) }) },
      )
      expect(res.status).toBe(400)
      const json = await res.json()
      expect(json.success).toBe(false)
      expect(Array.isArray(json.errors)).toBe(true)
    }

    const emptyBodyRes = await createStudentAssessment(
      new Request(`http://localhost:3000/api/students/${studentId}/assessments`, {
        method: 'POST',
        headers: { authorization: `Bearer ${adminToken}` },
      }),
      { params: Promise.resolve({ id: String(studentId) }) },
    )
    expect(emptyBodyRes.status).toBe(400)

    const badFilterRes = await listStudentAssessments(
      jsonRequest(
        `/api/students/${studentId}/assessments?currentCapability=invalid_level`,
        'GET',
        { authorization: `Bearer ${adminToken}` },
      ),
      { params: Promise.resolve({ id: String(studentId) }) },
    )
    expect(badFilterRes.status).toBe(400)
  })

  it('enforces authentication (401), active super_admin role (403), collection access control, and immutability', async () => {
    const studentId = await createTestStudent('Security')

    // Unauthenticated -> 401
    expect(
      (
        await createStudentAssessment(
          jsonRequest(
            `/api/students/${studentId}/assessments`,
            'POST',
            {},
            VALID_ASSESSMENT_PAYLOAD,
          ),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(401)
    expect(
      (
        await listStudentAssessments(
          jsonRequest(`/api/students/${studentId}/assessments`, 'GET'),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(401)

    // Teacher -> 403
    expect(
      (
        await createStudentAssessment(
          jsonRequest(
            `/api/students/${studentId}/assessments`,
            'POST',
            { authorization: `Bearer ${teacherToken}` },
            VALID_ASSESSMENT_PAYLOAD,
          ),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await listStudentAssessments(
          jsonRequest(`/api/students/${studentId}/assessments`, 'GET', {
            authorization: `Bearer ${teacherToken}`,
          }),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(403)

    // Suspended admin -> 403
    expect(
      (
        await createStudentAssessment(
          jsonRequest(
            `/api/students/${studentId}/assessments`,
            'POST',
            { authorization: `Bearer ${suspendedAdminToken}` },
            VALID_ASSESSMENT_PAYLOAD,
          ),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(403)
    expect(
      (
        await listStudentAssessments(
          jsonRequest(`/api/students/${studentId}/assessments`, 'GET', {
            authorization: `Bearer ${suspendedAdminToken}`,
          }),
          { params: Promise.resolve({ id: String(studentId) }) },
        )
      ).status,
    ).toBe(403)

    // Direct Payload collection access control
    await expect(
      payload.find({
        collection: 'student-assessments',
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await expect(
      payload.find({
        collection: 'student-assessments',
        user: teacherUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    await expect(
      payload.create({
        collection: 'student-assessments',
        data: {
          student: studentId,
          assessmentType: 'initial_review',
          previousPerformance: { summary: 'Bypass attempt' },
          currentCapability: 'good',
          strengths: [],
          weaknesses: [],
        },
        user: suspendedAdminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Valid active super_admin collection access & immutable student relation check
    const createdViaCollection = await payload.create({
      collection: 'student-assessments',
      data: {
        student: studentId,
        assessmentType: 'initial_review',
        previousPerformance: { summary: 'Collection test' },
        currentCapability: 'good',
        strengths: [{ item: 'Biology' }],
        weaknesses: [],
      },
      user: adminUser,
      overrideAccess: false,
    })
    createdAssessmentIds.push(Number(createdViaCollection.id))

    const otherStudentId = await createTestStudent('Other')
    await expect(
      payload.update({
        collection: 'student-assessments',
        id: createdViaCollection.id,
        data: { student: otherStudentId },
        user: adminUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow(/Student reference/i)

    // Confirm Phase 1 student GET/list still unaffected
    const studentGetRes = await getStudent(
      jsonRequest(`/api/students/${studentId}`, 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      { params: Promise.resolve({ id: String(studentId) }) },
    )
    expect(studentGetRes.status).toBe(200)
    const studentsListRes = await getStudents(
      jsonRequest('/api/students?limit=5', 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
    )
    expect(studentsListRes.status).toBe(200)
  })

  it('integrates cleanly after Phase 1 enquiry conversion without requiring any physical test', async () => {
    const enquiryRes = await adminCreateEnquiry(
      jsonRequest(
        '/api/admin/student-enquiries',
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          name: 'Phase 2 Flow Student',
          phoneNumber: '+91 98765 44444',
          studentClass: 'Class 9',
          subjects: ['Mathematics', 'Physics'],
          preferredTiming: 'Morning',
          locality: 'Kankarbagh, Patna',
          budgetRange: '4000-5000',
          enquirySource: 'referral',
        },
      ),
    )
    expect(enquiryRes.status).toBe(201)
    const enquiryJson = await enquiryRes.json()
    const enquiryId = Number(enquiryJson.data.id)
    createdEnquiryIds.push(enquiryId)

    const convertRes = await convertEnquiry(
      jsonRequest(`/api/student-enquiries/${enquiryId}/convert`, 'POST', {
        authorization: `Bearer ${adminToken}`,
      }),
      { params: Promise.resolve({ id: String(enquiryId) }) },
    )
    expect(convertRes.status).toBe(201)
    const convertJson = await convertRes.json()
    const studentId = Number(convertJson.data.student.id)
    createdStudentIds.push(studentId)

    const assessRes = await createStudentAssessment(
      jsonRequest(
        `/api/students/${studentId}/assessments`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        VALID_ASSESSMENT_PAYLOAD,
      ),
      { params: Promise.resolve({ id: String(studentId) }) },
    )
    expect(assessRes.status).toBe(201)
    const assessJson = await assessRes.json()
    createdAssessmentIds.push(Number(assessJson.data.id))
    expect(assessJson.data.student).toBe(studentId)
    expect(assessJson.data.currentCapability).toBe('needs_improvement')
  })
})
