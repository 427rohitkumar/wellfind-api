import { commitTransaction, initTransaction, killTransaction, type Payload } from 'payload'
import { isUniqueConstraintError, type AuthUserRecord } from '@/lib/api'
import {
  isActiveSuperAdmin,
  isBlockedOrSuspended,
  isSuperAdminRole,
  isTeacherRole,
} from '@/lib/auth'
import {
  PHYSICAL_TEST_CURRENCY,
  PHYSICAL_TEST_FEE_INR,
  physicalTestPaymentStatuses,
  physicalTestStatuses,
  validateAssignTesterInput,
  validateCreatePhysicalTestInput,
  validateReportShareInput,
  validateSubmitTestReportInput,
  validateTestPaymentInput,
} from '@/lib/physicalTestValidation'
import { extractRelationId, parsePaginationParams } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'

const PAID_TEST_STATUSES = new Set([
  'paid',
  'tester_assigned',
  'scheduled',
  'completed',
  'report_available',
])

const TEST_SORT_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'scheduledAt',
  'status',
  'paymentStatus',
])

const SHARE_SORT_FIELDS = new Set(['id', 'sharedAt', 'createdAt'])

export interface SerializedAssignmentHistoryEntry {
  tester: number | string | null
  assignedBy: number | string | null
  assignedAt: unknown
  scheduledAt: unknown
  notes: string | null
}

export interface SerializedStudentTest {
  id: unknown
  student: number | string | null
  parentSelected: boolean
  testType: string
  feeAmount: number
  currency: string
  location: string
  scheduledAt: unknown
  status: string
  paymentStatus: string
  assignedTester: number | string | null
  assignedBy: number | string | null
  assignedAt: unknown
  assignmentHistory: SerializedAssignmentHistoryEntry[]
  completedAt: unknown
  notes: string | null
  createdBy: number | string | null
  createdAt: unknown
  updatedAt: unknown
}

export interface SerializedStudentTestPayment {
  id: unknown
  studentTest: number | string | null
  student: number | string | null
  amount: number
  currency: string
  paymentMethod: string
  paymentStatus: string
  transactionReference: string
  recordedBy: number | string | null
  paidAt: unknown
  notes: string | null
  createdAt: unknown
  updatedAt: unknown
}

export interface SerializedSubjectResult {
  subject: string
  marksObtained: number
  totalMarks: number
}

export interface SerializedStudentTestReport {
  id: unknown
  studentTest: number | string | null
  student: number | string | null
  marksObtained: number
  totalMarks: number
  capability: string
  subjectResults: SerializedSubjectResult[]
  remarks: string | null
  submittedBy: number | string | null
  submittedAt: unknown
  createdAt: unknown
  updatedAt: unknown
}

export interface SerializedReportShare {
  id: unknown
  studentTest: number | string | null
  report: number | string | null
  student: number | string | null
  channel: string
  recipient: string
  status: string
  externalDeliveryConfirmed: false
  providerIntegrated: false
  notes: string | null
  sharedBy: number | string | null
  sharedAt: unknown
  createdAt: unknown
  updatedAt: unknown
}

export function serializeStudentTest(doc: Record<string, unknown>): SerializedStudentTest {
  const rawHistory = Array.isArray(doc.assignmentHistory) ? doc.assignmentHistory : []

  const assignmentHistory: SerializedAssignmentHistoryEntry[] = rawHistory
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object'),
    )
    .map((entry) => ({
      tester: extractRelationId(entry.tester),
      assignedBy: extractRelationId(entry.assignedBy),
      assignedAt: entry.assignedAt ?? null,
      scheduledAt: entry.scheduledAt ?? null,
      notes: typeof entry.notes === 'string' && entry.notes.length > 0 ? entry.notes : null,
    }))

  return {
    id: doc.id,
    student: extractRelationId(doc.student),
    parentSelected: Boolean(doc.parentSelected),
    testType: String(doc.testType || 'physical_assessment'),
    feeAmount: typeof doc.feeAmount === 'number' ? doc.feeAmount : PHYSICAL_TEST_FEE_INR,
    currency: String(doc.currency || PHYSICAL_TEST_CURRENCY),
    location: String(doc.location || ''),
    scheduledAt: doc.scheduledAt ?? null,
    status: String(doc.status || 'payment_pending'),
    paymentStatus: String(doc.paymentStatus || 'pending'),
    assignedTester: extractRelationId(doc.assignedTester),
    assignedBy: extractRelationId(doc.assignedBy),
    assignedAt: doc.assignedAt ?? null,
    assignmentHistory,
    completedAt: doc.completedAt ?? null,
    notes: typeof doc.notes === 'string' && doc.notes.length > 0 ? doc.notes : null,
    createdBy: extractRelationId(doc.createdBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function serializeStudentTestPayment(
  doc: Record<string, unknown>,
): SerializedStudentTestPayment {
  return {
    id: doc.id,
    studentTest: extractRelationId(doc.studentTest),
    student: extractRelationId(doc.student),
    amount: typeof doc.amount === 'number' ? doc.amount : PHYSICAL_TEST_FEE_INR,
    currency: String(doc.currency || PHYSICAL_TEST_CURRENCY),
    paymentMethod: String(doc.paymentMethod || ''),
    paymentStatus: String(doc.paymentStatus || ''),
    transactionReference: String(doc.transactionReference || ''),
    recordedBy: extractRelationId(doc.recordedBy),
    paidAt: doc.paidAt ?? null,
    notes: typeof doc.notes === 'string' && doc.notes.length > 0 ? doc.notes : null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function serializeStudentTestReport(
  doc: Record<string, unknown>,
): SerializedStudentTestReport {
  const rawSubjects = Array.isArray(doc.subjectResults) ? doc.subjectResults : []
  const subjectResults: SerializedSubjectResult[] = rawSubjects
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object'),
    )
    .map((entry) => ({
      subject: String(entry.subject || ''),
      marksObtained: Number(entry.marksObtained ?? 0),
      totalMarks: Number(entry.totalMarks ?? 0),
    }))

  return {
    id: doc.id,
    studentTest: extractRelationId(doc.studentTest),
    student: extractRelationId(doc.student),
    marksObtained: Number(doc.marksObtained ?? 0),
    totalMarks: Number(doc.totalMarks ?? 0),
    capability: String(doc.capability || ''),
    subjectResults,
    remarks: typeof doc.remarks === 'string' && doc.remarks.length > 0 ? doc.remarks : null,
    submittedBy: extractRelationId(doc.submittedBy),
    submittedAt: doc.submittedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function serializeReportShare(doc: Record<string, unknown>): SerializedReportShare {
  return {
    id: doc.id,
    studentTest: extractRelationId(doc.studentTest),
    report: extractRelationId(doc.report),
    student: extractRelationId(doc.student),
    channel: String(doc.channel || ''),
    recipient: String(doc.recipient || ''),
    status: String(doc.status || 'recorded'),
    externalDeliveryConfirmed: false,
    providerIntegrated: false,
    notes: typeof doc.notes === 'string' && doc.notes.length > 0 ? doc.notes : null,
    sharedBy: extractRelationId(doc.sharedBy),
    sharedAt: doc.sharedAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function assertStudentExists(
  payload: Payload,
  studentId: number,
  txReq?: unknown,
): Promise<void> {
  const student = await (payload as any).findByID({
    collection: 'students',
    id: studentId,
    disableErrors: true,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })

  if (!student) {
    throw new ServiceError('Student does not exist.', 404, [
      { field: 'studentId', message: 'Student does not exist.' },
    ])
  }
}

async function findStudentTestOrThrow(
  payload: Payload,
  testId: number,
  txReq?: unknown,
): Promise<Record<string, unknown>> {
  const test = await (payload as any).findByID({
    collection: 'student-tests',
    id: testId,
    depth: 0,
    disableErrors: true,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })

  if (!test) {
    throw new ServiceError('Physical test does not exist.', 404, [
      { field: 'testId', message: 'Physical test does not exist.' },
    ])
  }

  return test as Record<string, unknown>
}

async function findTestReportByTestId(
  payload: Payload,
  testId: number,
  txReq?: unknown,
): Promise<Record<string, unknown> | null> {
  const res = await (payload as any).find({
    collection: 'student-test-reports',
    where: { studentTest: { equals: testId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })

  if (!res?.docs?.length) {
    return null
  }
  return res.docs[0] as Record<string, unknown>
}

/**
 * Checks whether an authenticated active user may read or submit reports for
 * a physical test: active `super_admin` OR the currently assigned active tester.
 */
function canAccessAssignedTest(user: AuthUserRecord, testDoc: Record<string, unknown>): boolean {
  if (isActiveSuperAdmin(user)) {
    return true
  }
  if (isBlockedOrSuspended(user.status) || !isTeacherRole(user)) {
    return false
  }
  const assignedTesterId = extractRelationId(testDoc.assignedTester)
  return assignedTesterId !== null && assignedTesterId === user.id
}

function buildAdminTxReq(payload: Payload, actor: AuthUserRecord): any {
  return {
    payload,
    user: actor,
  }
}

/**
 * `FR-B2` — Creates an optional ₹100 physical test request when
 * `parentSelected === true`, or returns a skipped result without persisting a
 * record when `parentSelected === false`.
 */
export async function createOrSkipPhysicalTest(
  payload: Payload,
  studentId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<
  | {
      skipped: true
      studentId: number
      parentSelected: false
      recordCreated: false
      test: null
    }
  | {
      skipped: false
      studentId: number
      parentSelected: true
      recordCreated: true
      test: SerializedStudentTest
    }
> {
  const validated = validateCreatePhysicalTestInput(body, studentId)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  if (validated.data.skipped) {
    await assertStudentExists(payload, studentId)
    return {
      skipped: true,
      studentId,
      parentSelected: false,
      recordCreated: false,
      test: null,
    }
  }

  const txReq = buildAdminTxReq(payload, adminUser)
  const startedTx = await initTransaction(txReq)
  try {
    await assertStudentExists(payload, studentId, txReq)

    const created = await (payload as any).create({
      collection: 'student-tests',
      data: {
        student: studentId,
        parentSelected: true,
        testType: validated.data.testType,
        feeAmount: PHYSICAL_TEST_FEE_INR,
        currency: PHYSICAL_TEST_CURRENCY,
        location: validated.data.location,
        ...(validated.data.scheduledAt ? { scheduledAt: validated.data.scheduledAt } : {}),
        status: 'payment_pending',
        paymentStatus: 'pending',
        ...(validated.data.notes ? { notes: validated.data.notes } : {}),
        createdBy: adminUser.id,
      },
      req: txReq,
      overrideAccess: true,
    })

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return {
      skipped: false,
      studentId,
      parentSelected: true,
      recordCreated: true,
      test: serializeStudentTest(created as Record<string, unknown>),
    }
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * Lists physical tests for a given student (`super_admin` only).
 */
export async function listStudentTests(
  payload: Payload,
  studentId: number,
  searchParams: URLSearchParams,
): Promise<{
  docs: SerializedStudentTest[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}> {
  await assertStudentExists(payload, studentId)

  const { page, limit } = parsePaginationParams(searchParams)
  const sortParam = searchParams.get('sort') || '-createdAt'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = TEST_SORT_FIELDS.has(sortField) ? sortParam : '-createdAt'

  const where: Record<string, any> = {
    student: { equals: studentId },
  }

  const statusFilter = searchParams.get('status')
  if (statusFilter) {
    if (!(physicalTestStatuses as readonly string[]).includes(statusFilter)) {
      throw new ServiceError(
        `Invalid status filter. Allowed values: ${physicalTestStatuses.join(', ')}.`,
        400,
        [{ field: 'status', message: 'Invalid status filter.' }],
      )
    }
    where.status = { equals: statusFilter }
  }

  const paymentStatusFilter = searchParams.get('paymentStatus')
  if (paymentStatusFilter) {
    if (!(physicalTestPaymentStatuses as readonly string[]).includes(paymentStatusFilter)) {
      throw new ServiceError(
        `Invalid paymentStatus filter. Allowed values: ${physicalTestPaymentStatuses.join(', ')}.`,
        400,
        [{ field: 'paymentStatus', message: 'Invalid paymentStatus filter.' }],
      )
    }
    where.paymentStatus = { equals: paymentStatusFilter }
  }

  const result = await (payload as any).find({
    collection: 'student-tests',
    where,
    page,
    limit,
    sort,
    depth: 0,
    overrideAccess: true,
  })

  return {
    docs: (result.docs as Record<string, unknown>[]).map(serializeStudentTest),
    totalDocs: Number(result.totalDocs ?? 0),
    totalPages: Number(result.totalPages ?? 1),
    page: Number(result.page ?? page),
    limit: Number(result.limit ?? limit),
    hasNextPage: Boolean(result.hasNextPage),
    hasPrevPage: Boolean(result.hasPrevPage),
  }
}

/**
 * `FR-B4` — Retrieves a single physical test (`super_admin` or currently
 * assigned active tester). Admin responses also include payment attempts.
 */
export async function getStudentTestById(
  payload: Payload,
  testId: number,
  currentUser: AuthUserRecord,
): Promise<{
  test: SerializedStudentTest
  hasReport: boolean
  reportId: number | string | null
  payments?: SerializedStudentTestPayment[]
}> {
  const testDoc = await findStudentTestOrThrow(payload, testId)

  if (!canAccessAssignedTest(currentUser, testDoc)) {
    throw new ServiceError('You do not have permission to view this physical test.', 403)
  }

  const existingReport = await findTestReportByTestId(payload, testId)

  let payments: SerializedStudentTestPayment[] | undefined
  if (isActiveSuperAdmin(currentUser)) {
    const paymentRes = await (payload as any).find({
      collection: 'student-test-payments',
      where: { studentTest: { equals: testId } },
      sort: '-createdAt',
      limit: 50,
      depth: 0,
      overrideAccess: true,
    })
    payments = (paymentRes.docs as Record<string, unknown>[]).map(serializeStudentTestPayment)
  }

  return {
    test: serializeStudentTest(testDoc),
    hasReport: Boolean(existingReport),
    reportId: (existingReport?.id as number | string | undefined) ?? null,
    ...(payments !== undefined ? { payments } : {}),
  }
}

/**
 * `FR-B3` — Records a ₹100 INR payment record for a physical test inside an
 * atomic transaction and prevents duplicate successful (`paid`) payments.
 */
export async function recordPhysicalTestPayment(
  payload: Payload,
  testId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<{
  payment: SerializedStudentTestPayment
  test: SerializedStudentTest
}> {
  const validated = validateTestPaymentInput(body)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  const txReq = buildAdminTxReq(payload, adminUser)
  const startedTx = await initTransaction(txReq)
  try {
    const testDoc = await findStudentTestOrThrow(payload, testId, txReq)
    const testStatus = String(testDoc.status || '')
    const testPaymentStatus = String(testDoc.paymentStatus || '')

    if (testPaymentStatus === 'paid' || PAID_TEST_STATUSES.has(testStatus)) {
      throw new ServiceError('Physical test already has a confirmed payment.', 409, [
        {
          field: 'paymentStatus',
          message: 'A successful paid payment has already been recorded for this test.',
        },
      ])
    }

    const existingPaid = await (payload as any).find({
      collection: 'student-test-payments',
      where: {
        and: [{ studentTest: { equals: testId } }, { paymentStatus: { equals: 'paid' } }],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req: txReq,
    })

    if (existingPaid.totalDocs > 0) {
      throw new ServiceError('Physical test already has a confirmed payment.', 409, [
        {
          field: 'paymentStatus',
          message: 'A successful paid payment has already been recorded for this test.',
        },
      ])
    }

    const studentId = extractRelationId(testDoc.student)
    const nowIso = new Date().toISOString()

    let createdPayment: Record<string, unknown>
    try {
      createdPayment = (await (payload as any).create({
        collection: 'student-test-payments',
        data: {
          studentTest: testId,
          student: studentId,
          amount: validated.data.amount,
          currency: validated.data.currency,
          paymentMethod: validated.data.paymentMethod,
          paymentStatus: validated.data.paymentStatus,
          transactionReference: validated.data.transactionReference,
          successfulPaymentKey: validated.data.paymentStatus === 'paid' ? String(testId) : null,
          recordedBy: adminUser.id,
          ...(validated.data.paymentStatus === 'paid' ? { paidAt: nowIso } : {}),
          ...(validated.data.notes ? { notes: validated.data.notes } : {}),
        },
        req: txReq,
        overrideAccess: true,
      })) as Record<string, unknown>
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new ServiceError('Physical test already has a confirmed payment.', 409, [
          {
            field: 'paymentStatus',
            message: 'Concurrent payment rejected: test is already paid.',
          },
        ])
      }
      throw err
    }

    const nextTestStatus = validated.data.paymentStatus === 'paid' ? 'paid' : 'payment_pending'

    const updatedTest = (await (payload as any).update({
      collection: 'student-tests',
      id: testId,
      data: {
        status: nextTestStatus,
        paymentStatus: validated.data.paymentStatus,
      },
      req: txReq,
      overrideAccess: true,
    })) as Record<string, unknown>

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return {
      payment: serializeStudentTestPayment(createdPayment),
      test: serializeStudentTest(updatedTest),
    }
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * `FR-B4` — Assigns or reassigns an active `teacher` or `super_admin` user as
 * tester for a paid physical test (`BR-06`, Phase 0 Decision #2).
 */
export async function assignPhysicalTestTester(
  payload: Payload,
  testId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<{
  test: SerializedStudentTest
  assignedTester: {
    id: number
    email: string | null
    role: string | null
    status: string | null
  }
}> {
  const validated = validateAssignTesterInput(body)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  const txReq = buildAdminTxReq(payload, adminUser)
  const startedTx = await initTransaction(txReq)
  try {
    const testDoc = await findStudentTestOrThrow(payload, testId, txReq)
    const currentStatus = String(testDoc.status || '')

    if (currentStatus === 'completed' || currentStatus === 'report_available') {
      throw new ServiceError(
        'Cannot assign or reassign tester after test completion or report submission.',
        409,
        [
          {
            field: 'status',
            message: `Tester cannot be changed when test status is "${currentStatus}".`,
          },
        ],
      )
    }

    if (
      String(testDoc.paymentStatus || '') !== 'paid' ||
      currentStatus === 'requested' ||
      currentStatus === 'payment_pending'
    ) {
      throw new ServiceError(
        'Physical test payment must be verified as paid before assigning a tester.',
        409,
        [
          {
            field: 'paymentStatus',
            message: 'Record a paid ₹100 payment before assigning a tester.',
          },
        ],
      )
    }

    const testerUser = (await (payload as any).findByID({
      collection: 'users',
      id: validated.data.testerUserId,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
      req: txReq,
    })) as {
      id: number
      email?: string | null
      role?: string | null
      status?: string | null
    } | null

    if (!testerUser) {
      throw new ServiceError('Target tester user does not exist.', 404, [
        { field: 'testerUserId', message: 'User not found.' },
      ])
    }

    if (isBlockedOrSuspended(testerUser.status)) {
      throw new ServiceError('Target tester user account is blocked or suspended.', 400, [
        {
          field: 'testerUserId',
          message: 'Assigned tester must have an active account.',
        },
      ])
    }

    if (!isTeacherRole(testerUser) && !isSuperAdminRole(testerUser)) {
      throw new ServiceError('Tester must be an active teacher or super_admin user.', 400, [
        {
          field: 'testerUserId',
          message: 'Only teacher or super_admin users can be assigned as testers.',
        },
      ])
    }

    const nowIso = new Date().toISOString()
    const nextScheduledAt =
      validated.data.scheduledAt ??
      (typeof testDoc.scheduledAt === 'string' && testDoc.scheduledAt.length > 0
        ? testDoc.scheduledAt
        : undefined)

    const nextStatus = nextScheduledAt ? 'scheduled' : 'tester_assigned'

    const existingHistory = Array.isArray(testDoc.assignmentHistory)
      ? testDoc.assignmentHistory
      : []

    const nextHistory = [
      ...existingHistory.map((entry: any) => ({
        tester: extractRelationId(entry?.tester),
        assignedBy: extractRelationId(entry?.assignedBy),
        assignedAt: entry?.assignedAt,
        ...(entry?.scheduledAt ? { scheduledAt: entry.scheduledAt } : {}),
        ...(entry?.notes ? { notes: entry.notes } : {}),
      })),
      {
        tester: testerUser.id,
        assignedBy: adminUser.id,
        assignedAt: nowIso,
        ...(validated.data.scheduledAt ? { scheduledAt: validated.data.scheduledAt } : {}),
        ...(validated.data.notes ? { notes: validated.data.notes } : {}),
      },
    ]

    const updatedTest = (await (payload as any).update({
      collection: 'student-tests',
      id: testId,
      data: {
        assignedTester: testerUser.id,
        assignedBy: adminUser.id,
        assignedAt: nowIso,
        ...(nextScheduledAt ? { scheduledAt: nextScheduledAt } : {}),
        status: nextStatus,
        assignmentHistory: nextHistory,
      },
      req: txReq,
      overrideAccess: true,
    })) as Record<string, unknown>

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return {
      test: serializeStudentTest(updatedTest),
      assignedTester: {
        id: testerUser.id,
        email: testerUser.email ?? null,
        role: testerUser.role ?? null,
        status: testerUser.status ?? null,
      },
    }
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * `FR-B5` — Submits a 1:1 physical test report (`super_admin` OR currently
 * assigned active tester) and atomically transitions the test to
 * `report_available`.
 */
export async function submitPhysicalTestReport(
  payload: Payload,
  testId: number,
  body: Record<string, unknown>,
  currentUser: AuthUserRecord,
): Promise<{
  report: SerializedStudentTestReport
  test: SerializedStudentTest
}> {
  const validated = validateSubmitTestReportInput(body)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  const txReq = buildAdminTxReq(payload, currentUser)
  const startedTx = await initTransaction(txReq)
  try {
    const testDoc = await findStudentTestOrThrow(payload, testId, txReq)

    if (!canAccessAssignedTest(currentUser, testDoc)) {
      throw new ServiceError(
        'Only an active super_admin or the currently assigned active tester can submit this report.',
        403,
      )
    }

    if (!extractRelationId(testDoc.assignedTester)) {
      throw new ServiceError(
        'An assigned tester is required before submitting a physical test report.',
        409,
        [
          {
            field: 'assignedTester',
            message: 'Assign a tester to this test before submitting its report.',
          },
        ],
      )
    }

    if (String(testDoc.paymentStatus || '') !== 'paid') {
      throw new ServiceError(
        'Physical test payment must be completed before submitting a report.',
        409,
        [
          {
            field: 'paymentStatus',
            message: 'Payment must be verified before report submission.',
          },
        ],
      )
    }

    if (String(testDoc.status || '') === 'report_available') {
      throw new ServiceError('A report has already been submitted for this physical test.', 409, [
        {
          field: 'studentTest',
          message: 'Only one report is allowed per physical test.',
        },
      ])
    }

    const existingReport = await findTestReportByTestId(payload, testId, txReq)
    if (existingReport) {
      throw new ServiceError('A report has already been submitted for this physical test.', 409, [
        {
          field: 'studentTest',
          message: 'Only one report is allowed per physical test.',
        },
      ])
    }

    const studentId = extractRelationId(testDoc.student)
    const nowIso = new Date().toISOString()

    let createdReport: Record<string, unknown>
    try {
      createdReport = (await (payload as any).create({
        collection: 'student-test-reports',
        data: {
          studentTest: testId,
          student: studentId,
          marksObtained: validated.data.marksObtained,
          totalMarks: validated.data.totalMarks,
          capability: validated.data.capability,
          subjectResults: validated.data.subjectResults,
          ...(validated.data.remarks ? { remarks: validated.data.remarks } : {}),
          submittedBy: currentUser.id,
          submittedAt: nowIso,
        },
        req: txReq,
        overrideAccess: true,
      })) as Record<string, unknown>
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new ServiceError('A report has already been submitted for this physical test.', 409, [
          {
            field: 'studentTest',
            message: 'Concurrent submission rejected: report already exists.',
          },
        ])
      }
      throw err
    }

    const updatedTest = (await (payload as any).update({
      collection: 'student-tests',
      id: testId,
      data: {
        status: 'report_available',
        completedAt: testDoc.completedAt ?? nowIso,
      },
      req: txReq,
      overrideAccess: true,
    })) as Record<string, unknown>

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return {
      report: serializeStudentTestReport(createdReport),
      test: serializeStudentTest(updatedTest),
    }
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * `FR-B6` — Retrieves a test report (`super_admin` or currently assigned
 * active tester only). Rejects unassigned or reassigned-away testers with `403`.
 */
export async function getPhysicalTestReport(
  payload: Payload,
  testId: number,
  currentUser: AuthUserRecord,
): Promise<{
  report: SerializedStudentTestReport
  test: SerializedStudentTest
}> {
  const testDoc = await findStudentTestOrThrow(payload, testId)

  if (!canAccessAssignedTest(currentUser, testDoc)) {
    throw new ServiceError('You do not have permission to view this physical test report.', 403)
  }

  const reportDoc = await findTestReportByTestId(payload, testId)
  if (!reportDoc) {
    throw new ServiceError('No report has been submitted for this physical test yet.', 404, [
      { field: 'testId', message: 'Test report not found.' },
    ])
  }

  return {
    report: serializeStudentTestReport(reportDoc),
    test: serializeStudentTest(testDoc),
  }
}

/**
 * `FR-B6` — Records a report-sharing action (`whatsapp` or `phone_call`) for
 * a physical test report (`super_admin` only) without falsely confirming
 * unintegrated external delivery.
 */
export async function recordReportShare(
  payload: Payload,
  testId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<SerializedReportShare> {
  const validated = validateReportShareInput(body)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  const txReq = buildAdminTxReq(payload, adminUser)
  const startedTx = await initTransaction(txReq)
  try {
    const testDoc = await findStudentTestOrThrow(payload, testId, txReq)
    const reportDoc = await findTestReportByTestId(payload, testId, txReq)

    if (!reportDoc) {
      throw new ServiceError('Cannot record sharing before a physical test report exists.', 404, [
        { field: 'testId', message: 'Test report not found.' },
      ])
    }

    const nowIso = new Date().toISOString()
    const created = (await (payload as any).create({
      collection: 'student-test-report-shares',
      data: {
        studentTest: testId,
        report: reportDoc.id,
        student: extractRelationId(testDoc.student),
        channel: validated.data.channel,
        recipient: validated.data.recipient,
        status: validated.data.status,
        externalDeliveryConfirmed: false,
        providerIntegrated: false,
        ...(validated.data.notes ? { notes: validated.data.notes } : {}),
        sharedBy: adminUser.id,
        sharedAt: nowIso,
      },
      req: txReq,
      overrideAccess: true,
    })) as Record<string, unknown>

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return serializeReportShare(created)
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * `FR-B6` — Lists paginated report-sharing logs for a physical test
 * (`super_admin` only).
 */
export async function listReportShares(
  payload: Payload,
  testId: number,
  searchParams: URLSearchParams,
): Promise<{
  docs: SerializedReportShare[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}> {
  await findStudentTestOrThrow(payload, testId)

  const { page, limit } = parsePaginationParams(searchParams)
  const sortParam = searchParams.get('sort') || '-sharedAt'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = SHARE_SORT_FIELDS.has(sortField) ? sortParam : '-sharedAt'

  const result = await (payload as any).find({
    collection: 'student-test-report-shares',
    where: { studentTest: { equals: testId } },
    page,
    limit,
    sort,
    depth: 0,
    overrideAccess: true,
  })

  return {
    docs: (result.docs as Record<string, unknown>[]).map(serializeReportShare),
    totalDocs: Number(result.totalDocs ?? 0),
    totalPages: Number(result.totalPages ?? 1),
    page: Number(result.page ?? page),
    limit: Number(result.limit ?? limit),
    hasNextPage: Boolean(result.hasNextPage),
    hasPrevPage: Boolean(result.hasPrevPage),
  }
}
