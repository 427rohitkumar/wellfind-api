import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getPayload } from 'payload'
import config from '@/payload.config'
import {
  PHYSICAL_TEST_CURRENCY,
  PHYSICAL_TEST_FEE_INR,
  parseIsoTimestampWithOffset,
  validateAssignTesterInput,
  validateCreatePhysicalTestInput,
  validateReportShareInput,
  validateSubmitTestReportInput,
  validateTestPaymentInput,
} from '@/lib/physicalTestValidation'
import { POST as createStudent } from '@/app/api/students/route'
import {
  GET as listStudentAssessments,
  POST as createStudentAssessment,
} from '@/app/api/students/[id]/assessments/route'
import {
  GET as listStudentTests,
  POST as createOrSkipStudentTest,
} from '@/app/api/students/[id]/tests/route'
import { GET as getStudentTestById } from '@/app/api/student-tests/[id]/route'
import { POST as recordStudentTestPayment } from '@/app/api/student-tests/[id]/payment/route'
import { PATCH as assignStudentTestTester } from '@/app/api/student-tests/[id]/assign-tester/route'
import {
  GET as getStudentTestReport,
  POST as submitStudentTestReport,
} from '@/app/api/student-tests/[id]/report/route'
import {
  GET as listStudentTestReportShares,
  POST as shareStudentTestReport,
} from '@/app/api/student-tests/[id]/report/share/route'

let payload: any
let adminToken = ''
let teacherAToken = ''
let teacherBToken = ''
let suspendedTeacherToken = ''
let suspendedAdminToken = ''

let adminUser: Record<string, unknown>
let teacherAUser: Record<string, unknown>
let teacherBUser: Record<string, unknown>
let suspendedTeacherUser: Record<string, unknown>
let suspendedAdminUser: Record<string, unknown>

const ADMIN_EMAIL = '427rohit@gmail.com'
const ADMIN_PASSWORD = '427rohit@'
const TEACHER_A_EMAIL = 'phase3-teacher-a@example.com'
const TEACHER_B_EMAIL = 'phase3-teacher-b@example.com'
const SUSPENDED_TEACHER_EMAIL = 'phase3-suspended-teacher@example.com'
const SUSPENDED_ADMIN_EMAIL = 'phase3-suspended-admin@example.com'
const TEST_USER_PASSWORD = 'Phase3UserPass123!'

const createdStudentIds: number[] = []
const createdAssessmentIds: number[] = []
const createdTestIds: number[] = []
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

function idCtx(id: number | string) {
  return { params: Promise.resolve({ id: String(id) }) }
}

async function ensureUserAndToken(
  email: string,
  role: 'super_admin' | 'teacher',
  finalStatus: 'active' | 'suspended',
): Promise<{ user: Record<string, unknown>; token: string }> {
  const existing = await payload.find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    overrideAccess: true,
  })

  let userDoc: Record<string, unknown>
  if (existing.docs.length === 0) {
    userDoc = await payload.create({
      collection: 'users',
      data: {
        email,
        password: TEST_USER_PASSWORD,
        role,
        status: 'active',
      },
      overrideAccess: true,
    })
    if (email !== ADMIN_EMAIL) {
      tempUserIds.push(Number(userDoc.id))
    }
  } else {
    userDoc = await payload.update({
      collection: 'users',
      id: existing.docs[0].id,
      data: {
        password: email === ADMIN_EMAIL ? ADMIN_PASSWORD : TEST_USER_PASSWORD,
        role,
        status: 'active',
      },
      overrideAccess: true,
    })
  }

  const login = await payload.login({
    collection: 'users',
    data: {
      email,
      password: email === ADMIN_EMAIL ? ADMIN_PASSWORD : TEST_USER_PASSWORD,
    },
  })

  if (finalStatus !== 'active') {
    userDoc = await payload.update({
      collection: 'users',
      id: userDoc.id,
      data: { status: finalStatus },
      overrideAccess: true,
    })
  }

  return { user: userDoc, token: login.token }
}

async function createTestStudent(suffix: string): Promise<number> {
  const res = await createStudent(
    jsonRequest(
      '/api/students',
      'POST',
      { authorization: `Bearer ${adminToken}` },
      {
        name: `Phase3 Student ${suffix}`,
        parentName: `Phase3 Parent ${suffix}`,
        phoneNumber: '+91 98765 44100',
        studentClass: 'Class 9',
        subjects: ['Mathematics', 'Science'],
        locality: 'Kankarbagh, Patna',
        preferredTiming: 'Evening',
        budgetRange: '4000-6000',
      },
    ),
  )
  expect(res.status).toBe(201)
  const json = await res.json()
  const id = Number(json.data.id)
  createdStudentIds.push(id)
  return id
}

async function createAndPayTest(studentId: number, txRefSuffix: string): Promise<number> {
  const createRes = await createOrSkipStudentTest(
    jsonRequest(
      `/api/students/${studentId}/tests`,
      'POST',
      { authorization: `Bearer ${adminToken}` },
      {
        parentSelected: true,
        location: 'Wellfind Center, Patna',
      },
    ),
    idCtx(studentId),
  )
  expect(createRes.status).toBe(201)
  const createJson = await createRes.json()
  const testId = Number(createJson.data.test.id)
  createdTestIds.push(testId)

  const payRes = await recordStudentTestPayment(
    jsonRequest(
      `/api/student-tests/${testId}/payment`,
      'POST',
      { authorization: `Bearer ${adminToken}` },
      {
        amount: 100,
        currency: 'INR',
        paymentMethod: 'upi',
        paymentStatus: 'paid',
        transactionReference: `TXN-${txRefSuffix}`,
      },
    ),
    idCtx(testId),
  )
  expect(payRes.status).toBe(201)
  return testId
}

const VALID_REPORT_BODY = {
  marksObtained: 84,
  totalMarks: 100,
  capability: 'good',
  subjectResults: [
    { subject: 'Mathematics', marksObtained: 44, totalMarks: 50 },
    { subject: 'Science', marksObtained: 40, totalMarks: 50 },
  ],
  remarks: 'Strong analytical foundation; minor calculation speed practice needed.',
}

beforeAll(async () => {
  payload = await getPayload({ config })

  const admin = await ensureUserAndToken(ADMIN_EMAIL, 'super_admin', 'active')
  adminUser = admin.user
  adminToken = admin.token

  const teacherA = await ensureUserAndToken(TEACHER_A_EMAIL, 'teacher', 'active')
  teacherAUser = teacherA.user
  teacherAToken = teacherA.token

  const teacherB = await ensureUserAndToken(TEACHER_B_EMAIL, 'teacher', 'active')
  teacherBUser = teacherB.user
  teacherBToken = teacherB.token

  const suspTeacher = await ensureUserAndToken(SUSPENDED_TEACHER_EMAIL, 'teacher', 'suspended')
  suspendedTeacherUser = suspTeacher.user
  suspendedTeacherToken = suspTeacher.token

  const suspAdmin = await ensureUserAndToken(SUSPENDED_ADMIN_EMAIL, 'super_admin', 'suspended')
  suspendedAdminUser = suspAdmin.user
  suspendedAdminToken = suspAdmin.token
})

afterAll(async () => {
  // Delete in strict PostgreSQL foreign-key dependency order
  for (const testId of createdTestIds) {
    const shares = await payload.find({
      collection: 'student-test-report-shares',
      where: { studentTest: { equals: testId } },
      limit: 100,
      overrideAccess: true,
    })
    for (const share of shares.docs) {
      await payload.delete({
        collection: 'student-test-report-shares',
        id: share.id,
        overrideAccess: true,
      })
    }

    const reports = await payload.find({
      collection: 'student-test-reports',
      where: { studentTest: { equals: testId } },
      limit: 10,
      overrideAccess: true,
    })
    for (const report of reports.docs) {
      await payload.delete({
        collection: 'student-test-reports',
        id: report.id,
        overrideAccess: true,
      })
    }

    const payments = await payload.find({
      collection: 'student-test-payments',
      where: { studentTest: { equals: testId } },
      limit: 100,
      overrideAccess: true,
    })
    for (const payment of payments.docs) {
      await payload.delete({
        collection: 'student-test-payments',
        id: payment.id,
        overrideAccess: true,
      })
    }

    await payload
      .delete({
        collection: 'student-tests',
        id: testId,
        overrideAccess: true,
      })
      .catch(() => {})
  }

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
    await payload
      .delete({
        collection: 'students',
        id: studentId,
        overrideAccess: true,
      })
      .catch(() => {})
  }

  for (const userId of tempUserIds) {
    await payload
      .delete({
        collection: 'users',
        id: userId,
        overrideAccess: true,
      })
      .catch(() => {})
  }
})

describe('Phase 3 — Physical Student Test Validation Units (FR-B2 to FR-B6)', () => {
  it('parses ISO-8601 timestamps with explicit offsets to UTC without fixed shifts and rejects naive strings', () => {
    const ist = parseIsoTimestampWithOffset('2026-11-25T10:30:00+05:30')
    expect(ist.ok).toBe(true)
    if (ist.ok) {
      expect(ist.data).toBe('2026-11-25T05:00:00.000Z')
    }

    const utc = parseIsoTimestampWithOffset('2026-11-25T05:00:00Z')
    expect(utc.ok).toBe(true)
    if (utc.ok) {
      expect(utc.data).toBe('2026-11-25T05:00:00.000Z')
    }

    const naive = parseIsoTimestampWithOffset('2026-11-25T10:30:00')
    expect(naive.ok).toBe(false)
  })

  it('validates create vs skip physical test inputs and strict ₹100 INR fee', () => {
    const skipped = validateCreatePhysicalTestInput({ parentSelected: false }, 12)
    expect(skipped.ok).toBe(true)
    if (skipped.ok) {
      expect(skipped.data.skipped).toBe(true)
    }

    const wrongFee = validateCreatePhysicalTestInput(
      {
        parentSelected: true,
        feeAmount: 50,
        currency: 'INR',
        location: 'Patna Center',
      },
      12,
    )
    expect(wrongFee.ok).toBe(false)

    const wrongCurrency = validateCreatePhysicalTestInput(
      {
        parentSelected: true,
        feeAmount: 100,
        currency: 'USD',
        location: 'Patna Center',
      },
      12,
    )
    expect(wrongCurrency.ok).toBe(false)

    const valid = validateCreatePhysicalTestInput(
      {
        parentSelected: true,
        location: ' Patna Center ',
        scheduledAt: '2026-11-26T09:00:00+05:30',
      },
      12,
    )
    expect(valid.ok).toBe(true)
    if (valid.ok) {
      expect(valid.data.feeAmount).toBe(PHYSICAL_TEST_FEE_INR)
      expect(valid.data.currency).toBe(PHYSICAL_TEST_CURRENCY)
      expect(valid.data.location).toBe('Patna Center')
      expect(valid.data.scheduledAt).toBe('2026-11-26T03:30:00.000Z')
    }
  })

  it('validates payment inputs, tester IDs, report bounds, and truthful share statuses', () => {
    expect(
      validateTestPaymentInput({
        amount: 99,
        currency: 'INR',
        paymentMethod: 'upi',
        paymentStatus: 'paid',
        transactionReference: 'REF-1',
      }).ok,
    ).toBe(false)

    expect(
      validateTestPaymentInput({
        amount: 100,
        currency: 'INR',
        paymentMethod: 'upi',
        paymentStatus: 'refunded',
        transactionReference: 'REF-1',
      }).ok,
    ).toBe(false)

    expect(validateAssignTesterInput({ testerUserId: 0 }).ok).toBe(false)
    expect(validateAssignTesterInput({ testerUserId: '15' }).ok).toBe(true)

    expect(
      validateSubmitTestReportInput({
        ...VALID_REPORT_BODY,
        marksObtained: 101,
        totalMarks: 100,
      }).ok,
    ).toBe(false)

    expect(
      validateSubmitTestReportInput({
        ...VALID_REPORT_BODY,
        subjectResults: [{ subject: 'Math', marksObtained: 55, totalMarks: 50 }],
      }).ok,
    ).toBe(false)

    expect(
      validateReportShareInput({
        channel: 'whatsapp',
        recipient: '+91 9876543210',
        status: 'delivered',
      }).ok,
    ).toBe(false)

    expect(
      validateReportShareInput({
        channel: 'whatsapp',
        recipient: '+91 9876543210',
        status: 'read',
      }).ok,
    ).toBe(false)

    const validShare = validateReportShareInput({
      channel: 'whatsapp',
      recipient: '+91 98765 43210',
      status: 'sent',
    })
    expect(validShare.ok).toBe(true)
    if (validShare.ok) {
      expect(validShare.data.recipient).toBe('+919876543210')
    }
  })
})

describe('Phase 3 — FR-B2 Optional Physical Test & Independence from Assessments', () => {
  it('allows skipping physical test without creating a DB row and keeps Phase 2 assessments independent', async () => {
    const studentId = await createTestStudent('SkipAndAssess')

    // Skip physical test
    const skipRes = await createOrSkipStudentTest(
      jsonRequest(
        `/api/students/${studentId}/tests`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        { parentSelected: false },
      ),
      idCtx(studentId),
    )
    expect(skipRes.status).toBe(200)
    const skipJson = await skipRes.json()
    expect(skipJson.success).toBe(true)
    expect(skipJson.data.skipped).toBe(true)
    expect(skipJson.data.recordCreated).toBe(false)
    expect(skipJson.data.test).toBeNull()

    // Confirm zero rows persisted in student-tests
    const dbTests = await payload.find({
      collection: 'student-tests',
      where: { student: { equals: studentId } },
      overrideAccess: true,
    })
    expect(dbTests.totalDocs).toBe(0)

    // Phase 2 capability assessment still succeeds without any physical test (BR-04, BR-18)
    const assessRes = await createStudentAssessment(
      jsonRequest(
        `/api/students/${studentId}/assessments`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          assessmentType: 'initial_review',
          previousPerformance: { summary: 'Scored 82% in Class 8.' },
          currentCapability: 'good',
          strengths: ['Algebra'],
          weaknesses: ['Trigonometry'],
          adminNotes: 'Parent skipped physical test; academic assessment recorded normally.',
        },
      ),
      idCtx(studentId),
    )
    expect(assessRes.status).toBe(201)
    const assessJson = await assessRes.json()
    createdAssessmentIds.push(Number(assessJson.data.id))

    const listAssessRes = await listStudentAssessments(
      jsonRequest(`/api/students/${studentId}/assessments`, 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx(studentId),
    )
    expect(listAssessRes.status).toBe(200)
    const listAssessJson = await listAssessRes.json()
    expect(listAssessJson.data.totalDocs).toBe(1)
  })

  it('creates ₹100 INR physical test request when parentSelected: true, converts timezone to UTC, and lists tests', async () => {
    const studentId = await createTestStudent('CreatePaidReq')

    // Reject wrong fee & wrong currency
    const badFeeRes = await createOrSkipStudentTest(
      jsonRequest(
        `/api/students/${studentId}/tests`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          parentSelected: true,
          feeAmount: 250,
          currency: 'INR',
          location: 'Patna Main Center',
        },
      ),
      idCtx(studentId),
    )
    expect(badFeeRes.status).toBe(400)

    // Create valid test request
    const createRes = await createOrSkipStudentTest(
      jsonRequest(
        `/api/students/${studentId}/tests`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          parentSelected: true,
          testType: 'diagnostic_physical_test',
          feeAmount: 100,
          currency: 'INR',
          location: 'Boring Road Center, Patna',
          scheduledAt: '2026-12-01T14:00:00+05:30',
          notes: 'Parent opted for baseline math/science test.',
        },
      ),
      idCtx(studentId),
    )
    expect(createRes.status).toBe(201)
    const createJson = await createRes.json()
    expect(createJson.data.skipped).toBe(false)
    expect(createJson.data.recordCreated).toBe(true)
    expect(createJson.data.test.feeAmount).toBe(100)
    expect(createJson.data.test.currency).toBe('INR')
    expect(createJson.data.test.status).toBe('payment_pending')
    expect(createJson.data.test.paymentStatus).toBe('pending')
    expect(createJson.data.test.scheduledAt).toBe('2026-12-01T08:30:00.000Z')
    createdTestIds.push(Number(createJson.data.test.id))

    const listRes = await listStudentTests(
      jsonRequest(`/api/students/${studentId}/tests?status=payment_pending`, 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx(studentId),
    )
    expect(listRes.status).toBe(200)
    const listJson = await listRes.json()
    expect(listJson.data.totalDocs).toBe(1)
    expect(listJson.data.docs[0].id).toBe(createJson.data.test.id)
  })
})

describe('Phase 3 — FR-B3 Physical Test Payment & Concurrency Guard', () => {
  it('blocks marking a test paid via hook without a valid payment record, supports retries on failed attempts, and prevents duplicate/concurrent paid records', async () => {
    const studentId = await createTestStudent('PaymentFlow')
    const createRes = await createOrSkipStudentTest(
      jsonRequest(
        `/api/students/${studentId}/tests`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        { parentSelected: true, location: 'Center A' },
      ),
      idCtx(studentId),
    )
    const testId = Number((await createRes.json()).data.test.id)
    createdTestIds.push(testId)

    // Hook integrity check: cannot force test status/paymentStatus to paid without persisted payment
    await expect(
      payload.update({
        collection: 'student-tests',
        id: testId,
        data: { status: 'paid', paymentStatus: 'paid' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()

    // Cannot assign tester while unpaid (409)
    const assignBeforePayRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: Number(teacherAUser.id) },
      ),
      idCtx(testId),
    )
    expect(assignBeforePayRes.status).toBe(409)

    // Invalid amount rejected (400)
    const invalidAmtRes = await recordStudentTestPayment(
      jsonRequest(
        `/api/student-tests/${testId}/payment`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          amount: 150,
          currency: 'INR',
          paymentMethod: 'upi',
          paymentStatus: 'paid',
          transactionReference: 'BAD-AMT',
        },
      ),
      idCtx(testId),
    )
    expect(invalidAmtRes.status).toBe(400)

    // Multiple failed attempts do NOT collide and leave test in payment_pending
    const fail1 = await recordStudentTestPayment(
      jsonRequest(
        `/api/student-tests/${testId}/payment`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          amount: 100,
          currency: 'INR',
          paymentMethod: 'upi',
          paymentStatus: 'failed',
          transactionReference: 'FAIL-1',
        },
      ),
      idCtx(testId),
    )
    expect(fail1.status).toBe(201)

    const fail2 = await recordStudentTestPayment(
      jsonRequest(
        `/api/student-tests/${testId}/payment`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          amount: 100,
          currency: 'INR',
          paymentMethod: 'upi',
          paymentStatus: 'failed',
          transactionReference: 'FAIL-2',
        },
      ),
      idCtx(testId),
    )
    expect(fail2.status).toBe(201)

    // Concurrent parallel paid payments on the same test -> 1 succeeds (201), 1 conflicts (409)
    const [race1, race2] = await Promise.all([
      recordStudentTestPayment(
        jsonRequest(
          `/api/student-tests/${testId}/payment`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          {
            amount: 100,
            currency: 'INR',
            paymentMethod: 'upi',
            paymentStatus: 'paid',
            transactionReference: 'RACE-1',
          },
        ),
        idCtx(testId),
      ),
      recordStudentTestPayment(
        jsonRequest(
          `/api/student-tests/${testId}/payment`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          {
            amount: 100,
            currency: 'INR',
            paymentMethod: 'card',
            paymentStatus: 'paid',
            transactionReference: 'RACE-2',
          },
        ),
        idCtx(testId),
      ),
    ])

    const raceStatuses = [race1.status, race2.status].sort()
    expect(raceStatuses).toEqual([201, 409])

    // Subsequent duplicate paid payment -> 409
    const dupPay = await recordStudentTestPayment(
      jsonRequest(
        `/api/student-tests/${testId}/payment`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          amount: 100,
          currency: 'INR',
          paymentMethod: 'cash',
          paymentStatus: 'paid',
          transactionReference: 'DUP-AFTER',
        },
      ),
      idCtx(testId),
    )
    expect(dupPay.status).toBe(409)

    const paidRows = await payload.find({
      collection: 'student-test-payments',
      where: {
        and: [{ studentTest: { equals: testId } }, { paymentStatus: { equals: 'paid' } }],
      },
      overrideAccess: true,
    })
    expect(paidRows.totalDocs).toBe(1)
  })
})

describe('Phase 3 — FR-B4, FR-B5, FR-B6 Tester Assignment, Reassignment, Report & Sharing', () => {
  it('executes full lifecycle with tester assignment, reassignment access revocation, report privacy & sharing', async () => {
    const studentId = await createTestStudent('FullLifecycle')
    const testId = await createAndPayTest(studentId, 'LIFECYCLE-1')

    // Report cannot be submitted before tester is assigned (BR-07 -> 409 for admin, 403 for teacher)
    const teacherPreAssignReport = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${teacherAToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(teacherPreAssignReport.status).toBe(403)

    const adminPreAssignReport = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(adminPreAssignReport.status).toBe(409)

    // Assigning nonexistent or suspended user fails (404 / 400)
    const missingTesterRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: 9999999 },
      ),
      idCtx(testId),
    )
    expect(missingTesterRes.status).toBe(404)

    const suspendedTesterRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: Number(suspendedTeacherUser.id) },
      ),
      idCtx(testId),
    )
    expect(suspendedTesterRes.status).toBe(400)

    // Assign active teacher A
    const assignARes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        {
          testerUserId: Number(teacherAUser.id),
          scheduledAt: '2026-12-02T11:00:00+05:30',
          notes: 'Initial assignment to Teacher A.',
        },
      ),
      idCtx(testId),
    )
    expect(assignARes.status).toBe(200)
    const assignAJson = await assignARes.json()
    expect(assignAJson.data.test.status).toBe('scheduled')
    expect(assignAJson.data.test.assignedTester).toBe(Number(teacherAUser.id))
    expect(assignAJson.data.test.scheduledAt).toBe('2026-12-02T05:30:00.000Z')
    expect(assignAJson.data.test.assignmentHistory).toHaveLength(1)

    // Assigned Teacher A can read test details (without admin payments array); Teacher B gets 403
    const teacherAGetTest = await getStudentTestById(
      jsonRequest(`/api/student-tests/${testId}`, 'GET', {
        authorization: `Bearer ${teacherAToken}`,
      }),
      idCtx(testId),
    )
    expect(teacherAGetTest.status).toBe(200)
    const teacherAGetJson = await teacherAGetTest.json()
    expect(teacherAGetJson.data.payments).toBeUndefined()

    const teacherBGetTestBefore = await getStudentTestById(
      jsonRequest(`/api/student-tests/${testId}`, 'GET', {
        authorization: `Bearer ${teacherBToken}`,
      }),
      idCtx(testId),
    )
    expect(teacherBGetTestBefore.status).toBe(403)

    // Reassign to Teacher B -> Teacher A immediately loses access
    const reassignBRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        {
          testerUserId: Number(teacherBUser.id),
          notes: 'Reassigned to Teacher B due to availability.',
        },
      ),
      idCtx(testId),
    )
    expect(reassignBRes.status).toBe(200)
    const reassignBJson = await reassignBRes.json()
    expect(reassignBJson.data.test.assignedTester).toBe(Number(teacherBUser.id))
    expect(reassignBJson.data.test.assignmentHistory).toHaveLength(2)

    const teacherAGetTestAfter = await getStudentTestById(
      jsonRequest(`/api/student-tests/${testId}`, 'GET', {
        authorization: `Bearer ${teacherAToken}`,
      }),
      idCtx(testId),
    )
    expect(teacherAGetTestAfter.status).toBe(403)

    const teacherASubmitAfter = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${teacherAToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(teacherASubmitAfter.status).toBe(403)

    // Suspended Teacher B token blocked with 403 even if assigned; using suspended teacher fails
    const suspendedGetTest = await getStudentTestById(
      jsonRequest(`/api/student-tests/${testId}`, 'GET', {
        authorization: `Bearer ${suspendedTeacherToken}`,
      }),
      idCtx(testId),
    )
    expect(suspendedGetTest.status).toBe(403)

    // Report sharing blocked before report exists (404)
    const preReportShare = await shareStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report/share`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          channel: 'whatsapp',
          recipient: '+91 9876544100',
          status: 'sent',
        },
      ),
      idCtx(testId),
    )
    expect(preReportShare.status).toBe(404)

    // Invalid marks rejected (400) for currently assigned Teacher B
    const badMarksRes = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${teacherBToken}` },
        {
          ...VALID_REPORT_BODY,
          marksObtained: 120,
          totalMarks: 100,
        },
      ),
      idCtx(testId),
    )
    expect(badMarksRes.status).toBe(400)

    // Valid report submission by assigned Teacher B
    const reportRes = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${teacherBToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(reportRes.status).toBe(201)
    const reportJson = await reportRes.json()
    expect(reportJson.data.report.marksObtained).toBe(84)
    expect(reportJson.data.report.totalMarks).toBe(100)
    expect(reportJson.data.report.capability).toBe('good')
    expect(reportJson.data.report.submittedBy).toBe(Number(teacherBUser.id))
    expect(reportJson.data.test.status).toBe('report_available')
    expect(reportJson.data.test.completedAt).toBeTruthy()

    // Duplicate report submission blocked (409)
    const dupReportRes = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(dupReportRes.status).toBe(409)

    // Tester reassignment blocked after report_available (409)
    const postReportAssign = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: Number(teacherAUser.id) },
      ),
      idCtx(testId),
    )
    expect(postReportAssign.status).toBe(409)

    // Report privacy: Admin & assigned Teacher B can read (200); unassigned Teacher A cannot (403)
    const adminReadReport = await getStudentTestReport(
      jsonRequest(`/api/student-tests/${testId}/report`, 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx(testId),
    )
    expect(adminReadReport.status).toBe(200)

    const teacherBReadReport = await getStudentTestReport(
      jsonRequest(`/api/student-tests/${testId}/report`, 'GET', {
        authorization: `Bearer ${teacherBToken}`,
      }),
      idCtx(testId),
    )
    expect(teacherBReadReport.status).toBe(200)

    const teacherAReadReport = await getStudentTestReport(
      jsonRequest(`/api/student-tests/${testId}/report`, 'GET', {
        authorization: `Bearer ${teacherAToken}`,
      }),
      idCtx(testId),
    )
    expect(teacherAReadReport.status).toBe(403)

    // Report sharing: reject 'delivered'/'read' claim (400), reject teacher caller (403)
    const deliveredClaimRes = await shareStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report/share`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          channel: 'whatsapp',
          recipient: '+919876544100',
          status: 'delivered',
        },
      ),
      idCtx(testId),
    )
    expect(deliveredClaimRes.status).toBe(400)

    const teacherShareRes = await shareStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report/share`,
        'POST',
        { authorization: `Bearer ${teacherBToken}` },
        {
          channel: 'whatsapp',
          recipient: '+919876544100',
          status: 'recorded',
        },
      ),
      idCtx(testId),
    )
    expect(teacherShareRes.status).toBe(403)

    // Valid whatsapp & phone_call share records with truthful unconfirmed delivery flags
    const shareWaRes = await shareStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report/share`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          channel: 'whatsapp',
          recipient: '+91 98765-44100',
          status: 'sent',
          notes: 'Sent PDF summary manually via counselor WhatsApp.',
        },
      ),
      idCtx(testId),
    )
    expect(shareWaRes.status).toBe(201)
    const shareWaJson = await shareWaRes.json()
    expect(shareWaJson.data.channel).toBe('whatsapp')
    expect(shareWaJson.data.recipient).toBe('+919876544100')
    expect(shareWaJson.data.status).toBe('sent')
    expect(shareWaJson.data.externalDeliveryConfirmed).toBe(false)
    expect(shareWaJson.data.providerIntegrated).toBe(false)
    expect(shareWaJson.data.sharedBy).toBe(Number(adminUser.id))

    const shareCallRes = await shareStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report/share`,
        'POST',
        { authorization: `Bearer ${adminToken}` },
        {
          channel: 'phone_call',
          recipient: '+91 98765 44100',
          status: 'completed',
          notes: 'Discussed marks and weak topics over call with parent.',
        },
      ),
      idCtx(testId),
    )
    expect(shareCallRes.status).toBe(201)

    const listSharesRes = await listStudentTestReportShares(
      jsonRequest(`/api/student-tests/${testId}/report/share`, 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx(testId),
    )
    expect(listSharesRes.status).toBe(200)
    const listSharesJson = await listSharesRes.json()
    expect(listSharesJson.data.totalDocs).toBe(2)

    // Append-only enforcement on share log updates
    await expect(
      payload.update({
        collection: 'student-test-report-shares',
        id: Number(shareWaJson.data.id),
        data: { status: 'completed' },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('supports super_admin user as assigned tester and rejects concurrent duplicate report submissions with 409', async () => {
    const studentId = await createTestStudent('ConcurrentReport')
    const testId = await createAndPayTest(studentId, 'CONC-RPT')

    // Assign active super_admin user as tester (Phase 0 Decision #2)
    const assignAdminRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: Number(adminUser.id) },
      ),
      idCtx(testId),
    )
    expect(assignAdminRes.status).toBe(200)

    // Concurrent parallel report submissions -> 1 wins (201), 1 conflicts (409)
    const [r1, r2] = await Promise.all([
      submitStudentTestReport(
        jsonRequest(
          `/api/student-tests/${testId}/report`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          VALID_REPORT_BODY,
        ),
        idCtx(testId),
      ),
      submitStudentTestReport(
        jsonRequest(
          `/api/student-tests/${testId}/report`,
          'POST',
          { authorization: `Bearer ${adminToken}` },
          VALID_REPORT_BODY,
        ),
        idCtx(testId),
      ),
    ])

    expect([r1.status, r2.status].sort()).toEqual([201, 409])

    const reportsInDb = await payload.find({
      collection: 'student-test-reports',
      where: { studentTest: { equals: testId } },
      overrideAccess: true,
    })
    expect(reportsInDb.totalDocs).toBe(1)
  })
})

describe('Phase 3 — RBAC, Auth & Input Boundary Guards (401/403/400/404)', () => {
  it('enforces 401 unauthenticated, 403 suspended/role guards, and 400/404 edge cases across all Phase 3 routes', async () => {
    const studentId = await createTestStudent('RbacChecks')
    const testId = await createAndPayTest(studentId, 'RBAC-1')

    // 401 unauthenticated checks
    const unauthResponses = await Promise.all([
      createOrSkipStudentTest(
        jsonRequest(`/api/students/${studentId}/tests`, 'POST', {}, { parentSelected: false }),
        idCtx(studentId),
      ),
      listStudentTests(
        jsonRequest(`/api/students/${studentId}/tests`, 'GET', {}),
        idCtx(studentId),
      ),
      getStudentTestById(jsonRequest(`/api/student-tests/${testId}`, 'GET', {}), idCtx(testId)),
      recordStudentTestPayment(
        jsonRequest(`/api/student-tests/${testId}/payment`, 'POST', {}, {}),
        idCtx(testId),
      ),
      assignStudentTestTester(
        jsonRequest(`/api/student-tests/${testId}/assign-tester`, 'PATCH', {}, {}),
        idCtx(testId),
      ),
      submitStudentTestReport(
        jsonRequest(`/api/student-tests/${testId}/report`, 'POST', {}, VALID_REPORT_BODY),
        idCtx(testId),
      ),
      getStudentTestReport(
        jsonRequest(`/api/student-tests/${testId}/report`, 'GET', {}),
        idCtx(testId),
      ),
      shareStudentTestReport(
        jsonRequest(`/api/student-tests/${testId}/report/share`, 'POST', {}, {}),
        idCtx(testId),
      ),
      listStudentTestReportShares(
        jsonRequest(`/api/student-tests/${testId}/report/share`, 'GET', {}),
        idCtx(testId),
      ),
    ])
    for (const res of unauthResponses) {
      expect(res.status).toBe(401)
    }

    // Teacher forbidden on admin-only routes (403)
    const teacherAdminBlocked = await Promise.all([
      createOrSkipStudentTest(
        jsonRequest(
          `/api/students/${studentId}/tests`,
          'POST',
          { authorization: `Bearer ${teacherAToken}` },
          { parentSelected: false },
        ),
        idCtx(studentId),
      ),
      listStudentTests(
        jsonRequest(`/api/students/${studentId}/tests`, 'GET', {
          authorization: `Bearer ${teacherAToken}`,
        }),
        idCtx(studentId),
      ),
      recordStudentTestPayment(
        jsonRequest(
          `/api/student-tests/${testId}/payment`,
          'POST',
          { authorization: `Bearer ${teacherAToken}` },
          {},
        ),
        idCtx(testId),
      ),
      assignStudentTestTester(
        jsonRequest(
          `/api/student-tests/${testId}/assign-tester`,
          'PATCH',
          { authorization: `Bearer ${teacherAToken}` },
          { testerUserId: Number(teacherAUser.id) },
        ),
        idCtx(testId),
      ),
      listStudentTestReportShares(
        jsonRequest(`/api/student-tests/${testId}/report/share`, 'GET', {
          authorization: `Bearer ${teacherAToken}`,
        }),
        idCtx(testId),
      ),
    ])
    for (const res of teacherAdminBlocked) {
      expect(res.status).toBe(403)
    }

    // Suspended admin blocked on admin routes (403)
    const suspAdminRes = await listStudentTests(
      jsonRequest(`/api/students/${studentId}/tests`, 'GET', {
        authorization: `Bearer ${suspendedAdminToken}`,
      }),
      idCtx(studentId),
    )
    expect(suspAdminRes.status).toBe(403)

    // Invalid IDs -> 400; Nonexistent IDs -> 404
    const badIdRes = await getStudentTestById(
      jsonRequest('/api/student-tests/abc', 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx('abc'),
    )
    expect(badIdRes.status).toBe(400)

    const missingStudentSkip = await createOrSkipStudentTest(
      jsonRequest(
        '/api/students/9999999/tests',
        'POST',
        { authorization: `Bearer ${adminToken}` },
        { parentSelected: false },
      ),
      idCtx(9999999),
    )
    expect(missingStudentSkip.status).toBe(404)

    const missingTestGet = await getStudentTestById(
      jsonRequest('/api/student-tests/9999999', 'GET', {
        authorization: `Bearer ${adminToken}`,
      }),
      idCtx(9999999),
    )
    expect(missingTestGet.status).toBe(404)
  })

  it('enforces direct Payload collection ACL scoping for teachers and blocks suspended assigned testers immediately', async () => {
    const studentId = await createTestStudent('CollectionAcl')
    const testId = await createAndPayTest(studentId, 'ACL-1')

    // Assign active Teacher A
    const assignRes = await assignStudentTestTester(
      jsonRequest(
        `/api/student-tests/${testId}/assign-tester`,
        'PATCH',
        { authorization: `Bearer ${adminToken}` },
        { testerUserId: Number(teacherAUser.id) },
      ),
      idCtx(testId),
    )
    expect(assignRes.status).toBe(200)

    // Direct Payload collection ACL (`overrideAccess: false`): Teacher A sees only this test; Teacher B does not
    const teacherATests = await payload.find({
      collection: 'student-tests',
      where: { id: { equals: testId } },
      user: teacherAUser,
      overrideAccess: false,
    })
    expect(teacherATests.totalDocs).toBe(1)

    const teacherBTests = await payload.find({
      collection: 'student-tests',
      where: { id: { equals: testId } },
      user: teacherBUser,
      overrideAccess: false,
    })
    expect(teacherBTests.totalDocs).toBe(0)

    // Teacher cannot read payment records directly through Payload ACL (`overrideAccess: false`)
    await expect(
      payload.find({
        collection: 'student-test-payments',
        where: { studentTest: { equals: testId } },
        user: teacherAUser,
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    // Suspend currently assigned Teacher A -> routes immediately reject with 403
    await payload.update({
      collection: 'users',
      id: teacherAUser.id,
      data: { status: 'suspended' },
      overrideAccess: true,
    })
    try {
      const blockedGet = await getStudentTestById(
        jsonRequest(`/api/student-tests/${testId}`, 'GET', {
          authorization: `Bearer ${teacherAToken}`,
        }),
        idCtx(testId),
      )
      expect(blockedGet.status).toBe(403)

      const blockedSubmit = await submitStudentTestReport(
        jsonRequest(
          `/api/student-tests/${testId}/report`,
          'POST',
          { authorization: `Bearer ${teacherAToken}` },
          VALID_REPORT_BODY,
        ),
        idCtx(testId),
      )
      expect(blockedSubmit.status).toBe(403)
    } finally {
      await payload.update({
        collection: 'users',
        id: teacherAUser.id,
        data: { status: 'active' },
        overrideAccess: true,
      })
    }

    // Restored active Teacher A submits report cleanly and passes collection report ACL check
    const restoredSubmit = await submitStudentTestReport(
      jsonRequest(
        `/api/student-tests/${testId}/report`,
        'POST',
        { authorization: `Bearer ${teacherAToken}` },
        VALID_REPORT_BODY,
      ),
      idCtx(testId),
    )
    expect(restoredSubmit.status).toBe(201)

    const teacherAReports = await payload.find({
      collection: 'student-test-reports',
      where: { studentTest: { equals: testId } },
      user: teacherAUser,
      overrideAccess: false,
    })
    expect(teacherAReports.totalDocs).toBe(1)

    const teacherBReports = await payload.find({
      collection: 'student-test-reports',
      where: { studentTest: { equals: testId } },
      user: teacherBUser,
      overrideAccess: false,
    })
    expect(teacherBReports.totalDocs).toBe(0)
  })
})
