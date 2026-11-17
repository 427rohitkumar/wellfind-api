// Shared domain validation, normalization, and status constants for
// Student Enquiries and Student operational records.

export const enquiryStatuses = [
  'new',
  'contacted',
  'in_progress',
  'converted',
  'allocated',
  'closed',
] as const
export type EnquiryStatus = (typeof enquiryStatuses)[number]

export const CONVERTIBLE_ENQUIRY_STATUSES: readonly EnquiryStatus[] = [
  'new',
  'contacted',
  'in_progress',
] as const

export const enquirySources = [
  'website',
  'phone_call',
  'email',
  'referral',
  'network',
  'other',
] as const
export type EnquirySource = (typeof enquirySources)[number]

export const studentStatuses = [
  'active',
  'inactive',
  'paused',
  'completed',
] as const
export type StudentStatus = (typeof studentStatuses)[number]

export const capabilityLevels = [
  'excellent',
  'good',
  'average',
  'needs_improvement',
  'weak',
] as const
export type CapabilityLevel = (typeof capabilityLevels)[number]

// International-agnostic phone validation: an optional leading '+' followed by
// 7–15 digits. Whitespace, dashes and parentheses are stripped before validation.
// No country code is assumed — this is deliberately not India-specific.
const PHONE_REGEX = /^\+?[0-9]{7,15}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizePhoneNumber(value: string): string {
  return value.replace(/[\s\-()]/g, '')
}

export function isValidPhoneNumber(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  return PHONE_REGEX.test(normalizePhoneNumber(value))
}

export function isValidEmail(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false
  }
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed)
}

export function isValidEnquirySource(value: unknown): value is EnquirySource {
  return (
    typeof value === 'string' &&
    enquirySources.includes(value as EnquirySource)
  )
}

export function isValidStudentStatus(value: unknown): value is StudentStatus {
  return (
    typeof value === 'string' &&
    studentStatuses.includes(value as StudentStatus)
  )
}

export function isValidCapabilityLevel(
  value: unknown,
): value is CapabilityLevel {
  return (
    typeof value === 'string' &&
    capabilityLevels.includes(value as CapabilityLevel)
  )
}

export function parsePositiveIntId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null
  }
  const num = Number(raw)
  if (!Number.isSafeInteger(num) || num <= 0) {
    return null
  }
  return num
}

export function extractRelationId(val: unknown): number | string | null {
  if (typeof val === 'number' || typeof val === 'string') {
    return val
  }
  if (val && typeof val === 'object' && 'id' in val) {
    const id = (val as { id?: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

export function parsePaginationParams(searchParams: URLSearchParams): {
  page: number
  limit: number
} {
  const limitRaw = Number.parseInt(searchParams.get('limit') || '10', 10)
  const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10)
  const limit = Number.isNaN(limitRaw)
    ? 10
    : Math.min(Math.max(limitRaw, 1), 100)
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(pageRaw, 1)
  return { page, limit }
}

export interface SubjectRow {
  subject: string
}

export interface TextItemRow {
  item: string
}

function normalizeStringRowArray<K extends string>(
  raw: unknown,
  rowKey: K,
  options: {
    fieldLabel: string
    minItems: number
    maxItemLength: number
  },
):
  | { ok: true; rows: Record<K, string>[]; names: string[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, message: `${options.fieldLabel} must be an array of strings.` }
  }
  if (raw.length < options.minItems) {
    return {
      ok: false,
      message: `At least ${options.minItems} ${options.fieldLabel.toLowerCase()} is required.`,
    }
  }

  const rows: Record<K, string>[] = []
  const names: string[] = []
  for (const entry of raw) {
    let rawValue: unknown = entry
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      rawValue = (entry as Record<string, unknown>)[rowKey]
    }
    if (typeof rawValue !== 'string' || rawValue.trim().length === 0) {
      return {
        ok: false,
        message: `Each entry in ${options.fieldLabel} must be a non-empty string.`,
      }
    }
    const trimmed = rawValue.trim()
    if (trimmed.length > options.maxItemLength) {
      return {
        ok: false,
        message: `Each entry in ${options.fieldLabel} must be at most ${options.maxItemLength} characters.`,
      }
    }
    rows.push({ [rowKey]: trimmed } as Record<K, string>)
    names.push(trimmed)
  }

  return { ok: true, rows, names }
}

export function extractRowStringValues(raw: unknown, rowKey: string): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim()
      if (entry && typeof entry === 'object' && rowKey in entry) {
        const val = (entry as Record<string, unknown>)[rowKey]
        return typeof val === 'string' ? val.trim() : ''
      }
      return ''
    })
    .filter((s) => s.length > 0)
}

/**
 * Accepts `string[]` or `{ subject: string }[]`, validates non-empty array with
 * each subject 1..100 trimmed characters, and returns Payload array-row objects.
 */
export function normalizeSubjectsInput(
  raw: unknown,
): { ok: true; rows: SubjectRow[]; names: string[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: 'At least one subject is required.' }
  }
  const result = normalizeStringRowArray(raw, 'subject', {
    fieldLabel: 'subjects',
    minItems: 1,
    maxItemLength: 100,
  })
  if (!result.ok) {
    if (
      result.message.includes('non-empty string')
    ) {
      return { ok: false, message: 'At least one subject is required.' }
    }
    if (result.message.includes('at most 100')) {
      return { ok: false, message: 'Each subject must be at most 100 characters.' }
    }
    return result
  }
  return result
}

/**
 * Accepts `string[]` (or `{ item: string }[]`) for capability strengths/weaknesses.
 */
export function normalizeAssessmentItemArray(
  raw: unknown,
  fieldLabel: 'strengths' | 'weaknesses',
): { ok: true; rows: TextItemRow[]; names: string[] } | { ok: false; message: string } {
  if (raw === undefined || raw === null) {
    return { ok: false, message: `${fieldLabel} is required.` }
  }
  return normalizeStringRowArray(raw, 'item', {
    fieldLabel,
    minItems: 0,
    maxItemLength: 150,
  })
}

/**
 * Extracts string[] subject names from either stored Payload rows or plain strings.
 */
export function extractSubjectNames(raw: unknown): string[] {
  return extractRowStringValues(raw, 'subject')
}

export interface ValidatedEnquiryPayload {
  studentClass: string
  subjects: SubjectRow[]
  preferredTiming: string
  locality: string
  budgetRange: string
  name: string
  phoneNumber: string
  agreedToPolicy: boolean
  enquirySource: EnquirySource
  customSubject?: string
  customLocality?: string
  additionalNotes?: string
}

export interface ValidateEnquiryOptions {
  /** If true (public website endpoint), policy agreement must be explicitly true. If false, omitted defaults to true (offline admin entry), while explicit false still fails. */
  requireExplicitPolicy?: boolean
  /** Default enquirySource when omitted. */
  defaultSource?: EnquirySource
  /** When true (public website form), overrides any valid non-website source to 'website'. Invalid sources still fail validation. */
  forceWebsiteSource?: boolean
}

/**
 * Shared validator for both public student enquiry submission (`POST /api/student-enquiries`)
 * and admin manual enquiry creation (`POST /api/admin/student-enquiries`).
 */
export function validateAndBuildEnquiryData(
  body: Record<string, unknown>,
  options: ValidateEnquiryOptions = {},
):
  | { ok: true; data: ValidatedEnquiryPayload }
  | { ok: false; field: string; message: string } {
  const {
    studentClass,
    subjects,
    customSubject,
    preferredTiming,
    locality,
    customLocality,
    budgetRange,
    name,
    phoneNumber,
    additionalNotes,
    agreedToPolicy,
    enquirySource,
  } = body

  const requiredStringLimits: [string, unknown, number][] = [
    ['studentClass', studentClass, 50],
    ['preferredTiming', preferredTiming, 100],
    ['locality', locality, 200],
    ['budgetRange', budgetRange, 100],
    ['name', name, 200],
    ['phoneNumber', phoneNumber, 20],
  ]

  for (const [fieldName, value, maxLength] of requiredStringLimits) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return {
        ok: false,
        field: fieldName,
        message: `${fieldName} is required.`,
      }
    }
    if (fieldName !== 'phoneNumber' && value.trim().length > maxLength) {
      return {
        ok: false,
        field: fieldName,
        message: `${fieldName} must be at most ${maxLength} characters.`,
      }
    }
  }

  const parsedSubjects = normalizeSubjectsInput(subjects)
  if (!parsedSubjects.ok) {
    return {
      ok: false,
      field: 'subjects',
      message: parsedSubjects.message,
    }
  }

  const optionalLimitedFields: [string, unknown, number][] = [
    ['customSubject', customSubject, 200],
    ['customLocality', customLocality, 200],
    ['additionalNotes', additionalNotes, 2000],
  ]
  for (const [fieldName, value, maxLength] of optionalLimitedFields) {
    if (value !== undefined && value !== null && typeof value !== 'string') {
      return {
        ok: false,
        field: fieldName,
        message: `${fieldName} must be a string.`,
      }
    }
    if (typeof value === 'string' && value.length > maxLength) {
      return {
        ok: false,
        field: fieldName,
        message: `${fieldName} must be at most ${maxLength} characters.`,
      }
    }
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    return {
      ok: false,
      field: 'phoneNumber',
      message:
        'Invalid phone number. Provide 7–15 digits with an optional leading +.',
    }
  }

  if (options.requireExplicitPolicy ?? true) {
    if (agreedToPolicy !== true) {
      return {
        ok: false,
        field: 'agreedToPolicy',
        message: 'You must agree to the policy to submit an enquiry.',
      }
    }
  } else if (agreedToPolicy !== undefined && agreedToPolicy !== true) {
    return {
      ok: false,
      field: 'agreedToPolicy',
      message: 'agreedToPolicy must be true when provided.',
    }
  }

  let resolvedSource: EnquirySource = options.defaultSource ?? 'website'
  if (enquirySource !== undefined) {
    if (!isValidEnquirySource(enquirySource)) {
      return {
        ok: false,
        field: 'enquirySource',
        message: `Invalid enquirySource. Allowed values: ${enquirySources.join(', ')}.`,
      }
    }
    resolvedSource = options.forceWebsiteSource ? 'website' : enquirySource
  }

  const data: ValidatedEnquiryPayload = {
    studentClass: (studentClass as string).trim(),
    subjects: parsedSubjects.rows,
    preferredTiming: (preferredTiming as string).trim(),
    locality: (locality as string).trim(),
    budgetRange: (budgetRange as string).trim(),
    name: (name as string).trim(),
    phoneNumber: normalizePhoneNumber(phoneNumber as string),
    agreedToPolicy: true,
    enquirySource: resolvedSource,
  }

  if (typeof customSubject === 'string' && customSubject.trim().length > 0) {
    data.customSubject = customSubject.trim()
  }
  if (typeof customLocality === 'string' && customLocality.trim().length > 0) {
    data.customLocality = customLocality.trim()
  }
  if (
    typeof additionalNotes === 'string' &&
    additionalNotes.trim().length > 0
  ) {
    data.additionalNotes = additionalNotes.trim()
  }

  return { ok: true, data }
}

export interface ValidatedAssessmentPayload {
  assessmentType: string
  previousPerformance: {
    summary: string
    details?: string
  }
  currentCapability: CapabilityLevel
  strengths: TextItemRow[]
  weaknesses: TextItemRow[]
  adminNotes?: string
}

/**
 * Validates and normalizes request body for `POST /api/students/:studentId/assessments`.
 */
export function validateAndBuildAssessmentData(
  body: Record<string, unknown>,
  expectedStudentId?: number,
):
  | { ok: true; data: ValidatedAssessmentPayload }
  | { ok: false; field: string; message: string } {
  if (
    expectedStudentId !== undefined &&
    body.student !== undefined &&
    body.student !== expectedStudentId
  ) {
    return {
      ok: false,
      field: 'student',
      message: 'Body student ID must match the studentId URL parameter.',
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

  let assessmentType = 'initial_review'
  if (body.assessmentType !== undefined) {
    if (
      typeof body.assessmentType !== 'string' ||
      body.assessmentType.trim().length === 0
    ) {
      return {
        ok: false,
        field: 'assessmentType',
        message: 'assessmentType must be a non-empty string.',
      }
    }
    if (body.assessmentType.trim().length > 100) {
      return {
        ok: false,
        field: 'assessmentType',
        message: 'assessmentType must be at most 100 characters.',
      }
    }
    assessmentType = body.assessmentType.trim()
  }

  const rawPrev = body.previousPerformance
  if (
    !rawPrev ||
    typeof rawPrev !== 'object' ||
    Array.isArray(rawPrev)
  ) {
    return {
      ok: false,
      field: 'previousPerformance',
      message: 'previousPerformance must be an object containing summary.',
    }
  }

  const prevRecord = rawPrev as Record<string, unknown>
  if (
    typeof prevRecord.summary !== 'string' ||
    prevRecord.summary.trim().length === 0
  ) {
    return {
      ok: false,
      field: 'previousPerformance.summary',
      message: 'previousPerformance.summary is required.',
    }
  }
  if (prevRecord.summary.trim().length > 500) {
    return {
      ok: false,
      field: 'previousPerformance.summary',
      message: 'previousPerformance.summary must be at most 500 characters.',
    }
  }

  let details: string | undefined
  if (prevRecord.details !== undefined && prevRecord.details !== null) {
    if (typeof prevRecord.details !== 'string') {
      return {
        ok: false,
        field: 'previousPerformance.details',
        message: 'previousPerformance.details must be a string.',
      }
    }
    if (prevRecord.details.trim().length > 5000) {
      return {
        ok: false,
        field: 'previousPerformance.details',
        message: 'previousPerformance.details must be at most 5000 characters.',
      }
    }
    if (prevRecord.details.trim().length > 0) {
      details = prevRecord.details.trim()
    }
  }

  if (!isValidCapabilityLevel(body.currentCapability)) {
    return {
      ok: false,
      field: 'currentCapability',
      message: `currentCapability is required and must be one of: ${capabilityLevels.join(', ')}.`,
    }
  }

  const strengthsResult = normalizeAssessmentItemArray(
    body.strengths,
    'strengths',
  )
  if (!strengthsResult.ok) {
    return {
      ok: false,
      field: 'strengths',
      message: strengthsResult.message,
    }
  }

  const weaknessesResult = normalizeAssessmentItemArray(
    body.weaknesses,
    'weaknesses',
  )
  if (!weaknessesResult.ok) {
    return {
      ok: false,
      field: 'weaknesses',
      message: weaknessesResult.message,
    }
  }

  let adminNotes: string | undefined
  if (body.adminNotes !== undefined && body.adminNotes !== null) {
    if (typeof body.adminNotes !== 'string') {
      return {
        ok: false,
        field: 'adminNotes',
        message: 'adminNotes must be a string.',
      }
    }
    if (body.adminNotes.trim().length > 5000) {
      return {
        ok: false,
        field: 'adminNotes',
        message: 'adminNotes must be at most 5000 characters.',
      }
    }
    if (body.adminNotes.trim().length > 0) {
      adminNotes = body.adminNotes.trim()
    }
  }

  const data: ValidatedAssessmentPayload = {
    assessmentType,
    previousPerformance: {
      summary: prevRecord.summary.trim(),
      ...(details !== undefined ? { details } : {}),
    },
    currentCapability: body.currentCapability,
    strengths: strengthsResult.rows,
    weaknesses: weaknessesResult.rows,
    ...(adminNotes !== undefined ? { adminNotes } : {}),
  }

  return { ok: true, data }
}
