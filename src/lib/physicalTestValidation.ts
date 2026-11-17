import {
  capabilityLevels,
  isValidCapabilityLevel,
  isValidPhoneNumber,
  normalizePhoneNumber,
  type CapabilityLevel,
} from '@/lib/studentValidation'

export const PHYSICAL_TEST_FEE_INR = 100
export const PHYSICAL_TEST_CURRENCY = 'INR'

export const physicalTestStatuses = [
  'requested',
  'payment_pending',
  'paid',
  'tester_assigned',
  'scheduled',
  'completed',
  'report_available',
] as const
export type PhysicalTestStatus = (typeof physicalTestStatuses)[number]

export const physicalTestPaymentMethods = [
  'cash',
  'upi',
  'card',
  'bank_transfer',
  'online',
  'other',
] as const
export type PhysicalTestPaymentMethod = (typeof physicalTestPaymentMethods)[number]

export const physicalTestPaymentStatuses = ['pending', 'paid', 'failed', 'refunded'] as const
export type PhysicalTestPaymentStatus = (typeof physicalTestPaymentStatuses)[number]

export const ALLOWED_NEW_PAYMENT_STATUSES: readonly PhysicalTestPaymentStatus[] = [
  'pending',
  'paid',
  'failed',
] as const

export const reportShareChannels = ['whatsapp', 'phone_call'] as const
export type ReportShareChannel = (typeof reportShareChannels)[number]

export const reportShareStatuses = ['recorded', 'sent', 'completed', 'failed', 'no_answer'] as const
export type ReportShareStatus = (typeof reportShareStatuses)[number]

const UNCONFIRMED_EXTERNAL_DELIVERY_STATUSES = new Set(['delivered', 'read'])

const ISO_WITH_TZ_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

export type ValidationResult<T> =
  { ok: true; data: T } | { ok: false; field: string; message: string }

/**
 * Parses an ISO-8601 timestamp string that includes an explicit timezone
 * designator (`Z` or `±HH:MM`) and converts it to a canonical UTC ISO string
 * without applying any fixed manual timezone shift.
 */
export function parseIsoTimestampWithOffset(
  raw: unknown,
  fieldName = 'scheduledAt',
): ValidationResult<string> {
  if (typeof raw !== 'string' || !ISO_WITH_TZ_REGEX.test(raw.trim())) {
    return {
      ok: false,
      field: fieldName,
      message: `${fieldName} must be an ISO-8601 timestamp with an explicit timezone offset (e.g. 2026-11-20T10:00:00+05:30 or Z).`,
    }
  }
  const parsed = new Date(raw.trim())
  if (Number.isNaN(parsed.getTime())) {
    return {
      ok: false,
      field: fieldName,
      message: `${fieldName} is not a valid calendar timestamp.`,
    }
  }
  return { ok: true, data: parsed.toISOString() }
}

function validateOptionalNotes(
  raw: unknown,
  field = 'notes',
  maxLength = 2000,
): ValidationResult<string | undefined> {
  if (raw === undefined || raw === null) {
    return { ok: true, data: undefined }
  }
  if (typeof raw !== 'string') {
    return { ok: false, field, message: `${field} must be a string.` }
  }
  const trimmed = raw.trim()
  if (trimmed.length > maxLength) {
    return {
      ok: false,
      field,
      message: `${field} must be at most ${maxLength} characters.`,
    }
  }
  return { ok: true, data: trimmed.length > 0 ? trimmed : undefined }
}

export interface ValidatedPhysicalTestCreate {
  skipped: boolean
  testType: string
  parentSelected: boolean
  feeAmount: number
  currency: string
  location?: string
  scheduledAt?: string
  notes?: string
}

export function validateCreatePhysicalTestInput(
  body: Record<string, unknown>,
  expectedStudentId?: number,
): ValidationResult<ValidatedPhysicalTestCreate> {
  if (
    expectedStudentId !== undefined &&
    body.student !== undefined &&
    body.student !== expectedStudentId
  ) {
    return {
      ok: false,
      field: 'student',
      message: 'Body student must match the studentId URL parameter.',
    }
  }
  if (
    expectedStudentId !== undefined &&
    body.studentId !== undefined &&
    body.studentId !== expectedStudentId
  ) {
    return {
      ok: false,
      field: 'studentId',
      message: 'Body studentId must match the studentId URL parameter.',
    }
  }

  if (typeof body.parentSelected !== 'boolean') {
    return {
      ok: false,
      field: 'parentSelected',
      message: 'parentSelected must be a boolean.',
    }
  }

  if (body.parentSelected === false) {
    return {
      ok: true,
      data: {
        skipped: true,
        parentSelected: false,
        testType: 'physical_assessment',
        feeAmount: PHYSICAL_TEST_FEE_INR,
        currency: PHYSICAL_TEST_CURRENCY,
      },
    }
  }

  let testType = 'physical_assessment'
  if (body.testType !== undefined) {
    if (typeof body.testType !== 'string' || body.testType.trim().length === 0) {
      return {
        ok: false,
        field: 'testType',
        message: 'testType must be a non-empty string.',
      }
    }
    if (body.testType.trim().length > 100) {
      return {
        ok: false,
        field: 'testType',
        message: 'testType must be at most 100 characters.',
      }
    }
    testType = body.testType.trim()
  }

  if (body.feeAmount !== undefined) {
    if (
      typeof body.feeAmount !== 'number' ||
      !Number.isFinite(body.feeAmount) ||
      body.feeAmount !== PHYSICAL_TEST_FEE_INR
    ) {
      return {
        ok: false,
        field: 'feeAmount',
        message: `Physical test fee must be exactly ${PHYSICAL_TEST_FEE_INR} ${PHYSICAL_TEST_CURRENCY}.`,
      }
    }
  }

  if (body.currency !== undefined) {
    if (typeof body.currency !== 'string' || body.currency.trim() !== PHYSICAL_TEST_CURRENCY) {
      return {
        ok: false,
        field: 'currency',
        message: `Currency must be ${PHYSICAL_TEST_CURRENCY}.`,
      }
    }
  }

  if (typeof body.location !== 'string' || body.location.trim().length === 0) {
    return {
      ok: false,
      field: 'location',
      message: 'location is required when creating a physical test.',
    }
  }
  if (body.location.trim().length > 250) {
    return {
      ok: false,
      field: 'location',
      message: 'location must be at most 250 characters.',
    }
  }

  let scheduledAt: string | undefined
  if (body.scheduledAt !== undefined && body.scheduledAt !== null) {
    const parsedDate = parseIsoTimestampWithOffset(body.scheduledAt, 'scheduledAt')
    if (!parsedDate.ok) {
      return parsedDate
    }
    scheduledAt = parsedDate.data
  }

  const notesResult = validateOptionalNotes(body.notes, 'notes', 2000)
  if (!notesResult.ok) {
    return notesResult
  }

  return {
    ok: true,
    data: {
      skipped: false,
      testType,
      parentSelected: true,
      feeAmount: PHYSICAL_TEST_FEE_INR,
      currency: PHYSICAL_TEST_CURRENCY,
      location: body.location.trim(),
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(notesResult.data ? { notes: notesResult.data } : {}),
    },
  }
}

export interface ValidatedPaymentInput {
  amount: number
  currency: string
  paymentMethod: PhysicalTestPaymentMethod
  paymentStatus: 'pending' | 'paid' | 'failed'
  transactionReference: string
  notes?: string
}

export function validateTestPaymentInput(
  body: Record<string, unknown>,
): ValidationResult<ValidatedPaymentInput> {
  if (
    typeof body.amount !== 'number' ||
    !Number.isFinite(body.amount) ||
    body.amount !== PHYSICAL_TEST_FEE_INR
  ) {
    return {
      ok: false,
      field: 'amount',
      message: `Payment amount must be exactly ${PHYSICAL_TEST_FEE_INR} ${PHYSICAL_TEST_CURRENCY}.`,
    }
  }

  if (body.currency !== undefined) {
    if (typeof body.currency !== 'string' || body.currency.trim() !== PHYSICAL_TEST_CURRENCY) {
      return {
        ok: false,
        field: 'currency',
        message: `Currency must be ${PHYSICAL_TEST_CURRENCY}.`,
      }
    }
  }

  if (
    typeof body.paymentMethod !== 'string' ||
    !physicalTestPaymentMethods.includes(body.paymentMethod as PhysicalTestPaymentMethod)
  ) {
    return {
      ok: false,
      field: 'paymentMethod',
      message: `Invalid paymentMethod. Allowed values: ${physicalTestPaymentMethods.join(', ')}.`,
    }
  }

  if (
    typeof body.paymentStatus !== 'string' ||
    !ALLOWED_NEW_PAYMENT_STATUSES.includes(body.paymentStatus as PhysicalTestPaymentStatus)
  ) {
    return {
      ok: false,
      field: 'paymentStatus',
      message: `Invalid paymentStatus. Allowed values for new payment records: ${ALLOWED_NEW_PAYMENT_STATUSES.join(', ')}.`,
    }
  }

  if (
    typeof body.transactionReference !== 'string' ||
    body.transactionReference.trim().length === 0
  ) {
    return {
      ok: false,
      field: 'transactionReference',
      message: 'transactionReference is required.',
    }
  }
  if (body.transactionReference.trim().length > 150) {
    return {
      ok: false,
      field: 'transactionReference',
      message: 'transactionReference must be at most 150 characters.',
    }
  }

  const notesResult = validateOptionalNotes(body.notes, 'notes', 2000)
  if (!notesResult.ok) {
    return notesResult
  }

  return {
    ok: true,
    data: {
      amount: PHYSICAL_TEST_FEE_INR,
      currency: PHYSICAL_TEST_CURRENCY,
      paymentMethod: body.paymentMethod as PhysicalTestPaymentMethod,
      paymentStatus: body.paymentStatus as 'pending' | 'paid' | 'failed',
      transactionReference: body.transactionReference.trim(),
      ...(notesResult.data ? { notes: notesResult.data } : {}),
    },
  }
}

export interface ValidatedAssignTesterInput {
  testerUserId: number
  scheduledAt?: string
  notes?: string
}

export function validateAssignTesterInput(
  body: Record<string, unknown>,
): ValidationResult<ValidatedAssignTesterInput> {
  const rawTesterId = body.testerUserId
  let testerUserId: number | null = null
  if (typeof rawTesterId === 'number' && Number.isSafeInteger(rawTesterId) && rawTesterId > 0) {
    testerUserId = rawTesterId
  } else if (typeof rawTesterId === 'string' && /^\d+$/.test(rawTesterId.trim())) {
    const parsed = Number(rawTesterId.trim())
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      testerUserId = parsed
    }
  }

  if (!testerUserId) {
    return {
      ok: false,
      field: 'testerUserId',
      message: 'testerUserId must be a positive integer user ID.',
    }
  }

  let scheduledAt: string | undefined
  if (body.scheduledAt !== undefined) {
    const parsedDate = parseIsoTimestampWithOffset(body.scheduledAt, 'scheduledAt')
    if (!parsedDate.ok) {
      return parsedDate
    }
    scheduledAt = parsedDate.data
  }

  const notesResult = validateOptionalNotes(body.notes, 'notes', 2000)
  if (!notesResult.ok) {
    return notesResult
  }

  return {
    ok: true,
    data: {
      testerUserId,
      ...(scheduledAt ? { scheduledAt } : {}),
      ...(notesResult.data ? { notes: notesResult.data } : {}),
    },
  }
}

export interface ValidatedSubjectResult {
  subject: string
  marksObtained: number
  totalMarks: number
}

export interface ValidatedTestReportInput {
  marksObtained: number
  totalMarks: number
  capability: CapabilityLevel
  subjectResults: ValidatedSubjectResult[]
  remarks?: string
}

export function validateSubmitTestReportInput(
  body: Record<string, unknown>,
): ValidationResult<ValidatedTestReportInput> {
  if (
    typeof body.totalMarks !== 'number' ||
    !Number.isFinite(body.totalMarks) ||
    body.totalMarks <= 0
  ) {
    return {
      ok: false,
      field: 'totalMarks',
      message: 'totalMarks must be a finite number greater than 0.',
    }
  }

  if (
    typeof body.marksObtained !== 'number' ||
    !Number.isFinite(body.marksObtained) ||
    body.marksObtained < 0
  ) {
    return {
      ok: false,
      field: 'marksObtained',
      message: 'marksObtained must be a non-negative finite number.',
    }
  }

  if (body.marksObtained > body.totalMarks) {
    return {
      ok: false,
      field: 'marksObtained',
      message: 'marksObtained cannot exceed totalMarks.',
    }
  }

  if (!isValidCapabilityLevel(body.capability)) {
    return {
      ok: false,
      field: 'capability',
      message: `capability is required and must be one of: ${capabilityLevels.join(', ')}.`,
    }
  }

  if (!Array.isArray(body.subjectResults) || body.subjectResults.length === 0) {
    return {
      ok: false,
      field: 'subjectResults',
      message: 'subjectResults must be a non-empty array.',
    }
  }

  const subjectResults: ValidatedSubjectResult[] = []
  for (let i = 0; i < body.subjectResults.length; i++) {
    const entry = body.subjectResults[i]
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return {
        ok: false,
        field: `subjectResults.${i}`,
        message: 'Each subjectResults entry must be an object.',
      }
    }
    const row = entry as Record<string, unknown>
    if (typeof row.subject !== 'string' || row.subject.trim().length === 0) {
      return {
        ok: false,
        field: `subjectResults.${i}.subject`,
        message: 'subject is required for every entry in subjectResults.',
      }
    }
    if (row.subject.trim().length > 100) {
      return {
        ok: false,
        field: `subjectResults.${i}.subject`,
        message: 'subject must be at most 100 characters.',
      }
    }
    if (
      typeof row.totalMarks !== 'number' ||
      !Number.isFinite(row.totalMarks) ||
      row.totalMarks <= 0
    ) {
      return {
        ok: false,
        field: `subjectResults.${i}.totalMarks`,
        message: 'Subject totalMarks must be a finite number greater than 0.',
      }
    }
    if (
      typeof row.marksObtained !== 'number' ||
      !Number.isFinite(row.marksObtained) ||
      row.marksObtained < 0
    ) {
      return {
        ok: false,
        field: `subjectResults.${i}.marksObtained`,
        message: 'Subject marksObtained must be a non-negative finite number.',
      }
    }
    if (row.marksObtained > row.totalMarks) {
      return {
        ok: false,
        field: `subjectResults.${i}.marksObtained`,
        message: 'Subject marksObtained cannot exceed subject totalMarks.',
      }
    }
    subjectResults.push({
      subject: row.subject.trim(),
      marksObtained: row.marksObtained,
      totalMarks: row.totalMarks,
    })
  }

  const remarksResult = validateOptionalNotes(body.remarks, 'remarks', 5000)
  if (!remarksResult.ok) {
    return remarksResult
  }

  return {
    ok: true,
    data: {
      marksObtained: body.marksObtained,
      totalMarks: body.totalMarks,
      capability: body.capability,
      subjectResults,
      ...(remarksResult.data ? { remarks: remarksResult.data } : {}),
    },
  }
}

export interface ValidatedReportShareInput {
  channel: ReportShareChannel
  recipient: string
  status: ReportShareStatus
  notes?: string
}

export function validateReportShareInput(
  body: Record<string, unknown>,
): ValidationResult<ValidatedReportShareInput> {
  if (
    typeof body.channel !== 'string' ||
    !reportShareChannels.includes(body.channel as ReportShareChannel)
  ) {
    return {
      ok: false,
      field: 'channel',
      message: `channel is required and must be one of: ${reportShareChannels.join(', ')}.`,
    }
  }
  const channel = body.channel as ReportShareChannel

  if (!isValidPhoneNumber(body.recipient)) {
    return {
      ok: false,
      field: 'recipient',
      message: 'recipient must be a valid phone number (7–15 digits, optional leading +).',
    }
  }
  const recipient = normalizePhoneNumber(body.recipient)

  let status: ReportShareStatus = 'recorded'
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || body.status.trim().length === 0) {
      return {
        ok: false,
        field: 'status',
        message: 'status must be a non-empty string.',
      }
    }
    const normalizedStatus = body.status.trim()
    if (UNCONFIRMED_EXTERNAL_DELIVERY_STATUSES.has(normalizedStatus)) {
      return {
        ok: false,
        field: 'status',
        message:
          'External delivery statuses ("delivered", "read") cannot be recorded without an integrated provider confirmation.',
      }
    }
    if (!reportShareStatuses.includes(normalizedStatus as ReportShareStatus)) {
      return {
        ok: false,
        field: 'status',
        message: `Invalid status. Allowed values: ${reportShareStatuses.join(', ')}.`,
      }
    }
    status = normalizedStatus as ReportShareStatus
  }

  const notesResult = validateOptionalNotes(body.notes, 'notes', 2000)
  if (!notesResult.ok) {
    return notesResult
  }

  return {
    ok: true,
    data: {
      channel,
      recipient,
      status,
      ...(notesResult.data ? { notes: notesResult.data } : {}),
    },
  }
}
