import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import {
  extractValidationErrors,
  isUniqueConstraintError,
  type ApiFieldError,
} from '@/lib/api'
import {
  CONVERTIBLE_ENQUIRY_STATUSES,
  extractSubjectNames,
  isValidEmail,
  isValidPhoneNumber,
  isValidStudentStatus,
  normalizePhoneNumber,
  normalizeSubjectsInput,
  studentStatuses,
  type EnquiryStatus,
  type StudentStatus,
  type ValidatedEnquiryPayload,
} from '@/lib/studentValidation'

export class ServiceError extends Error {
  status: number
  errors?: ApiFieldError[]

  constructor(message: string, status = 400, errors?: ApiFieldError[]) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

function extractRelationId(val: unknown): number | string | null {
  if (typeof val === 'number' || typeof val === 'string') {
    return val
  }
  if (val && typeof val === 'object' && 'id' in val) {
    const id = (val as { id?: unknown }).id
    return typeof id === 'number' || typeof id === 'string' ? id : null
  }
  return null
}

/**
 * Serializes a student-enquiry document for public responses (no internal fields).
 */
export function serializePublicEnquiry(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: doc.id,
    studentClass: doc.studentClass,
    subjects: extractSubjectNames(doc.subjects),
    customSubject: doc.customSubject,
    preferredTiming: doc.preferredTiming,
    locality: doc.locality,
    customLocality: doc.customLocality,
    budgetRange: doc.budgetRange,
    name: doc.name,
    studentGender: doc.studentGender ?? null,
    preferredTeacherGender: doc.preferredTeacherGender ?? null,
    phoneNumber: doc.phoneNumber,
    additionalNotes: doc.additionalNotes,
    agreedToPolicy: doc.agreedToPolicy,
    enquirySource: (doc.enquirySource as string | undefined) || 'website',
    inquiryIntent: (doc.inquiryIntent as string | undefined) || 'tutor_only',
    preferredTestMode: (doc.preferredTestMode as string | undefined) || null,
    createdAt: doc.createdAt,
  }
}

/**
 * Serializes a student-enquiry document for `super_admin` responses.
 */
export function serializeAdminEnquiry(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...serializePublicEnquiry(doc),
    enquiryStatus: (doc.enquiryStatus as string | undefined) || 'new',
    markAsRead: Boolean(doc.markAsRead),
    adminNotes: doc.adminNotes || null,
    assignedTo: extractRelationId(doc.assignedTo),
    testMode: doc.testMode ?? null,
    testScheduledAt: doc.testScheduledAt ?? null,
    testVenue: doc.testVenue ?? null,
    testNotes: doc.testNotes ?? null,
    testSkipped: Boolean(doc.testSkipped),
    testSkippedAt: doc.testSkippedAt ?? null,
    updatedAt: doc.updatedAt,
  }
}

/**
 * Serializes a student record for REST API responses.
 */
export function serializeStudent(
  doc: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: doc.id,
    name: doc.name,
    parentName: doc.parentName ?? null,
    studentGender: doc.studentGender ?? null,
    preferredTeacherGender: doc.preferredTeacherGender ?? null,
    phoneNumber: doc.phoneNumber,
    alternatePhoneNumber: doc.alternatePhoneNumber ?? null,
    parentEmail: doc.parentEmail ?? null,
    studentClass: doc.studentClass,
    subjects: extractSubjectNames(doc.subjects),
    customSubject: doc.customSubject ?? null,
    locality: doc.locality,
    customLocality: doc.customLocality ?? null,
    preferredTiming: doc.preferredTiming,
    budgetRange: doc.budgetRange ?? null,
    learningNotes: doc.learningNotes ?? null,
    studentEnquiry: extractRelationId(doc.studentEnquiry),
    status: (doc.status as string | undefined) || 'active',
    convertedAt: doc.convertedAt ?? null,
    convertedBy: extractRelationId(doc.convertedBy),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/**
 * Creates a student enquiry manually from an authenticated `super_admin`.
 */
export async function createManualStudentEnquiry(
  payload: Payload,
  validated: ValidatedEnquiryPayload,
  extras: {
    adminNotes?: unknown
    assignedTo?: unknown
    markAsRead?: unknown
  },
  adminUser: { id: number; role?: string | null },
): Promise<Record<string, unknown>> {
  const createData: Record<string, unknown> = {
    ...validated,
    enquiryStatus: 'new',
  }

  if (extras.adminNotes !== undefined && extras.adminNotes !== null) {
    if (typeof extras.adminNotes !== 'string') {
      throw new ServiceError('adminNotes must be a string.', 400, [
        { field: 'adminNotes', message: 'adminNotes must be a string.' },
      ])
    }
    if (extras.adminNotes.length > 5000) {
      throw new ServiceError(
        'adminNotes must be at most 5000 characters.',
        400,
        [{ field: 'adminNotes', message: 'adminNotes must be at most 5000 characters.' }],
      )
    }
    if (extras.adminNotes.trim().length > 0) {
      createData.adminNotes = extras.adminNotes.trim()
    }
  }

  if (extras.markAsRead !== undefined) {
    if (typeof extras.markAsRead !== 'boolean') {
      throw new ServiceError('markAsRead must be a boolean.', 400, [
        { field: 'markAsRead', message: 'markAsRead must be a boolean.' },
      ])
    }
    createData.markAsRead = extras.markAsRead
  }

  if (extras.assignedTo !== undefined && extras.assignedTo !== null) {
    const assigneeId = Number(extras.assignedTo)
    if (!Number.isSafeInteger(assigneeId) || assigneeId <= 0) {
      throw new ServiceError('assignedTo must be a valid user ID.', 400, [
        { field: 'assignedTo', message: 'assignedTo must be a valid user ID.' },
      ])
    }
    const assignee = await payload.findByID({
      collection: 'users',
      id: assigneeId,
      disableErrors: true,
      overrideAccess: true,
    })
    if (!assignee) {
      throw new ServiceError('Assigned user does not exist.', 400, [
        { field: 'assignedTo', message: 'Assigned user does not exist.' },
      ])
    }
    createData.assignedTo = assigneeId
  }

  const created = await (payload as any).create({
    collection: 'student-enquiries',
    data: createData,
    user: adminUser,
    overrideAccess: true,
  })

  return serializeAdminEnquiry(created as Record<string, unknown>)
}

/**
 * Atomically converts an eligible student enquiry (`new`, `contacted`, `in_progress`)
 * into a single operational Student record and transitions enquiryStatus to `converted`.
 * Guards against both sequential and concurrent duplicate conversions.
 */
export async function convertStudentEnquiry(
  payload: Payload,
  enquiryId: number,
  body: Record<string, unknown>,
  adminUser: { id: number; role?: string | null },
): Promise<{
  student: Record<string, unknown>
  enquiry: Record<string, unknown>
}> {
  const enquiry = (await payload.findByID({
    collection: 'student-enquiries',
    id: enquiryId,
    disableErrors: true,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!enquiry) {
    throw new ServiceError('Student enquiry not found.', 404)
  }

  const currentStatus = ((enquiry.enquiryStatus as string | undefined) ||
    'new') as EnquiryStatus

  // Check explicit status and pre-existing student link before starting transaction
  const existingStudent = await payload.find({
    collection: 'students',
    where: { studentEnquiry: { equals: enquiryId } },
    limit: 1,
    overrideAccess: true,
  })

  if (existingStudent.docs.length > 0 || currentStatus === 'converted') {
    throw new ServiceError(
      'Enquiry has already been converted to a student.',
      409,
      [
        {
          field: 'enquiryStatus',
          message: 'Enquiry has already been converted to a student.',
        },
      ],
    )
  }

  if (!CONVERTIBLE_ENQUIRY_STATUSES.includes(currentStatus)) {
    throw new ServiceError(
      `Enquiries with status '${currentStatus}' cannot be converted.`,
      400,
      [
        {
          field: 'enquiryStatus',
          message: `Enquiries with status '${currentStatus}' cannot be converted.`,
        },
      ],
    )
  }

  // Validate optional conversion overrides
  const {
    parentName,
    alternatePhoneNumber,
    parentEmail,
    learningNotes,
    budgetRange,
    changeReason,
  } = body

  if (parentName !== undefined && parentName !== null) {
    if (typeof parentName !== 'string' || parentName.trim().length > 200) {
      throw new ServiceError(
        'parentName must be a string up to 200 characters.',
        400,
        [{ field: 'parentName', message: 'Invalid parentName.' }],
      )
    }
  }

  if (
    alternatePhoneNumber !== undefined &&
    alternatePhoneNumber !== null &&
    alternatePhoneNumber !== ''
  ) {
    if (!isValidPhoneNumber(alternatePhoneNumber)) {
      throw new ServiceError(
        'Invalid alternatePhoneNumber. Provide 7–15 digits with an optional leading +.',
        400,
        [{ field: 'alternatePhoneNumber', message: 'Invalid alternatePhoneNumber.' }],
      )
    }
  }

  if (parentEmail !== undefined && parentEmail !== null && parentEmail !== '') {
    if (!isValidEmail(parentEmail)) {
      throw new ServiceError('Invalid parentEmail address.', 400, [
        { field: 'parentEmail', message: 'Invalid parentEmail address.' },
      ])
    }
  }

  if (learningNotes !== undefined && learningNotes !== null) {
    if (typeof learningNotes !== 'string' || learningNotes.length > 5000) {
      throw new ServiceError(
        'learningNotes must be a string up to 5000 characters.',
        400,
        [{ field: 'learningNotes', message: 'Invalid learningNotes.' }],
      )
    }
  }

  if (budgetRange !== undefined && budgetRange !== null) {
    if (
      typeof budgetRange !== 'string' ||
      budgetRange.trim().length === 0 ||
      budgetRange.trim().length > 100
    ) {
      throw new ServiceError(
        'budgetRange must be a non-empty string up to 100 characters.',
        400,
        [{ field: 'budgetRange', message: 'Invalid budgetRange.' }],
      )
    }
  }

  const enquirySubjects = normalizeSubjectsInput(enquiry.subjects)
  if (!enquirySubjects.ok) {
    throw new ServiceError(
      'Source student enquiry has invalid subjects data.',
      400,
    )
  }

  const derivedNotes =
    typeof learningNotes === 'string' && learningNotes.trim().length > 0
      ? learningNotes.trim()
      : typeof enquiry.additionalNotes === 'string' &&
          enquiry.additionalNotes.trim().length > 0
        ? enquiry.additionalNotes.trim()
        : undefined

  const conversionReason =
    typeof changeReason === 'string' && changeReason.trim().length > 0
      ? changeReason.trim().slice(0, 2000)
      : 'Converted enquiry to student record.'

  const studentData: Record<string, unknown> = {
    name: String(enquiry.name || '').trim(),
    studentGender: enquiry.studentGender || undefined,
    preferredTeacherGender: enquiry.preferredTeacherGender || undefined,
    phoneNumber: normalizePhoneNumber(String(enquiry.phoneNumber || '')),
    studentClass: String(enquiry.studentClass || '').trim(),
    subjects: enquirySubjects.rows,
    locality: String(enquiry.locality || '').trim(),
    preferredTiming: String(enquiry.preferredTiming || '').trim(),
    budgetRange:
      typeof budgetRange === 'string' && budgetRange.trim().length > 0
        ? budgetRange.trim()
        : typeof enquiry.budgetRange === 'string'
          ? enquiry.budgetRange.trim()
          : undefined,
    customSubject:
      typeof enquiry.customSubject === 'string' &&
      enquiry.customSubject.trim().length > 0
        ? enquiry.customSubject.trim()
        : undefined,
    customLocality:
      typeof enquiry.customLocality === 'string' &&
      enquiry.customLocality.trim().length > 0
        ? enquiry.customLocality.trim()
        : undefined,
    learningNotes: derivedNotes,
    studentEnquiry: enquiryId,
    status: 'active',
    convertedAt: new Date().toISOString(),
    convertedBy: adminUser.id,
  }

  if (typeof parentName === 'string' && parentName.trim().length > 0) {
    studentData.parentName = parentName.trim()
  }
  if (
    typeof alternatePhoneNumber === 'string' &&
    alternatePhoneNumber.trim().length > 0
  ) {
    studentData.alternatePhoneNumber = normalizePhoneNumber(alternatePhoneNumber)
  }
  if (typeof parentEmail === 'string' && parentEmail.trim().length > 0) {
    studentData.parentEmail = parentEmail.trim()
  }

  // Run Student creation + enquiry status update (+ audit log via afterChange)
  // in a single database transaction. Creating `students` first ensures Postgres's
  // unique index on `student_enquiry_id` serializes concurrent conversions.
  const txReq: any = {
    payload,
    user: adminUser,
    context: {
      isStudentConversion: true,
      changeReason: conversionReason,
    },
  }

  const startedTx = await initTransaction(txReq)
  try {
    const createdStudent = await (payload as any).create({
      collection: 'students',
      data: studentData,
      req: txReq,
      overrideAccess: true,
    })

    const updatedEnquiry = await (payload as any).update({
      collection: 'student-enquiries',
      id: enquiryId,
      data: {
        enquiryStatus: 'converted',
        changeReason: conversionReason,
      },
      req: txReq,
      overrideAccess: true,
    })

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return {
      student: serializeStudent(createdStudent as Record<string, unknown>),
      enquiry: serializeAdminEnquiry(updatedEnquiry as Record<string, unknown>),
    }
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }

    if (isUniqueConstraintError(err)) {
      throw new ServiceError(
        'Enquiry has already been converted to a student.',
        409,
        [
          {
            field: 'studentEnquiry',
            message: 'Enquiry has already been converted to a student.',
          },
        ],
      )
    }

    // Check if another concurrent request won the conversion while this transaction failed
    const concurrentWinner = await payload
      .find({
        collection: 'students',
        where: { studentEnquiry: { equals: enquiryId } },
        limit: 1,
        overrideAccess: true,
      })
      .catch(() => null)
    if (concurrentWinner && concurrentWinner.docs.length > 0) {
      throw new ServiceError(
        'Enquiry has already been converted to a student.',
        409,
        [
          {
            field: 'studentEnquiry',
            message: 'Enquiry has already been converted to a student.',
          },
        ],
      )
    }

    if (err instanceof ServiceError) {
      throw err
    }

    const validationErrors = extractValidationErrors(err)
    if (validationErrors) {
      throw new ServiceError(
        err instanceof Error ? err.message : 'Validation failed.',
        400,
        validationErrors,
      )
    }

    throw err
  }
}

/**
 * Validates and builds creation payload for `POST /api/students`.
 */
export async function createStudentRecord(
  payload: Payload,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (body.studentEnquiry !== undefined && body.studentEnquiry !== null) {
    throw new ServiceError(
      'Direct creation cannot link studentEnquiry. Use POST /api/student-enquiries/:id/convert.',
      400,
      [
        {
          field: 'studentEnquiry',
          message:
            'Use POST /api/student-enquiries/:id/convert to create a student from an enquiry.',
        },
      ],
    )
  }

  const {
    name,
    parentName,
    phoneNumber,
    alternatePhoneNumber,
    parentEmail,
    studentClass,
    subjects,
    customSubject,
    locality,
    customLocality,
    preferredTiming,
    budgetRange,
    learningNotes,
    status,
  } = body

  const requiredStrings: [string, unknown, number][] = [
    ['name', name, 200],
    ['phoneNumber', phoneNumber, 20],
    ['studentClass', studentClass, 50],
    ['locality', locality, 200],
    ['preferredTiming', preferredTiming, 100],
  ]
  for (const [field, val, maxLen] of requiredStrings) {
    if (typeof val !== 'string' || val.trim().length === 0) {
      throw new ServiceError(`${field} is required.`, 400, [
        { field, message: `${field} is required.` },
      ])
    }
    if (field !== 'phoneNumber' && val.trim().length > maxLen) {
      throw new ServiceError(
        `${field} must be at most ${maxLen} characters.`,
        400,
        [{ field, message: `${field} must be at most ${maxLen} characters.` }],
      )
    }
  }

  if (!isValidPhoneNumber(phoneNumber)) {
    throw new ServiceError(
      'Invalid phoneNumber. Provide 7–15 digits with an optional leading +.',
      400,
      [{ field: 'phoneNumber', message: 'Invalid phoneNumber.' }],
    )
  }

  const parsedSubjects = normalizeSubjectsInput(subjects)
  if (!parsedSubjects.ok) {
    throw new ServiceError(parsedSubjects.message, 400, [
      { field: 'subjects', message: parsedSubjects.message },
    ])
  }

  if (
    alternatePhoneNumber !== undefined &&
    alternatePhoneNumber !== null &&
    alternatePhoneNumber !== '' &&
    !isValidPhoneNumber(alternatePhoneNumber)
  ) {
    throw new ServiceError(
      'Invalid alternatePhoneNumber. Provide 7–15 digits with an optional leading +.',
      400,
      [{ field: 'alternatePhoneNumber', message: 'Invalid alternatePhoneNumber.' }],
    )
  }

  if (
    parentEmail !== undefined &&
    parentEmail !== null &&
    parentEmail !== '' &&
    !isValidEmail(parentEmail)
  ) {
    throw new ServiceError('Invalid parentEmail address.', 400, [
      { field: 'parentEmail', message: 'Invalid parentEmail address.' }],
    )
  }

  const optionalStrings: [string, unknown, number][] = [
    ['parentName', parentName, 200],
    ['customSubject', customSubject, 200],
    ['customLocality', customLocality, 200],
    ['budgetRange', budgetRange, 100],
    ['learningNotes', learningNotes, 5000],
  ]
  for (const [field, val, maxLen] of optionalStrings) {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string') {
        throw new ServiceError(`${field} must be a string.`, 400, [
          { field, message: `${field} must be a string.` },
        ])
      }
      if (val.trim().length > maxLen) {
        throw new ServiceError(
          `${field} must be at most ${maxLen} characters.`,
          400,
          [{ field, message: `${field} must be at most ${maxLen} characters.` }],
        )
      }
    }
  }

  let resolvedStatus: StudentStatus = 'active'
  if (status !== undefined) {
    if (!isValidStudentStatus(status)) {
      throw new ServiceError(
        `Invalid status. Allowed values: ${studentStatuses.join(', ')}.`,
        400,
        [{ field: 'status', message: 'Invalid student status.' }],
      )
    }
    resolvedStatus = status
  }

  const createData: Record<string, unknown> = {
    name: (name as string).trim(),
    phoneNumber: normalizePhoneNumber(phoneNumber as string),
    studentClass: (studentClass as string).trim(),
    subjects: parsedSubjects.rows,
    locality: (locality as string).trim(),
    preferredTiming: (preferredTiming as string).trim(),
    status: resolvedStatus,
  }

  if (typeof parentName === 'string' && parentName.trim().length > 0) {
    createData.parentName = parentName.trim()
  }
  if (
    typeof alternatePhoneNumber === 'string' &&
    alternatePhoneNumber.trim().length > 0
  ) {
    createData.alternatePhoneNumber = normalizePhoneNumber(alternatePhoneNumber)
  }
  if (typeof parentEmail === 'string' && parentEmail.trim().length > 0) {
    createData.parentEmail = parentEmail.trim()
  }
  if (typeof customSubject === 'string' && customSubject.trim().length > 0) {
    createData.customSubject = customSubject.trim()
  }
  if (typeof customLocality === 'string' && customLocality.trim().length > 0) {
    createData.customLocality = customLocality.trim()
  }
  if (typeof budgetRange === 'string' && budgetRange.trim().length > 0) {
    createData.budgetRange = budgetRange.trim()
  }
  if (typeof learningNotes === 'string' && learningNotes.trim().length > 0) {
    createData.learningNotes = learningNotes.trim()
  }

  const created = await (payload as any).create({
    collection: 'students',
    data: createData,
    overrideAccess: true,
  })

  return serializeStudent(created as Record<string, unknown>)
}

const ALLOWED_STUDENT_SORT_FIELDS = new Set([
  'id',
  'name',
  'studentClass',
  'locality',
  'status',
  'createdAt',
  'updatedAt',
])

export async function listStudents(
  payload: Payload,
  searchParams: URLSearchParams,
): Promise<{
  docs: Record<string, unknown>[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}> {
  const limitRaw = Number.parseInt(searchParams.get('limit') || '10', 10)
  const pageRaw = Number.parseInt(searchParams.get('page') || '1', 10)
  const limit = Number.isNaN(limitRaw) ? 10 : Math.min(Math.max(limitRaw, 1), 100)
  const page = Number.isNaN(pageRaw) ? 1 : Math.max(pageRaw, 1)

  const sortParam = searchParams.get('sort') || '-createdAt'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = ALLOWED_STUDENT_SORT_FIELDS.has(sortField)
    ? sortParam
    : '-createdAt'

  const where: Record<string, any> = {}
  const whereParam = searchParams.get('where')
  if (whereParam) {
    try {
      const parsed = JSON.parse(whereParam)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(where, parsed)
      }
    } catch {
      throw new ServiceError('Invalid where query JSON.', 400)
    }
  }

  const statusFilter = searchParams.get('status')
  if (statusFilter) {
    if (!isValidStudentStatus(statusFilter)) {
      throw new ServiceError(
        `Invalid status filter. Allowed values: ${studentStatuses.join(', ')}.`,
        400,
      )
    }
    where.status = { equals: statusFilter }
  }

  const classFilter = searchParams.get('studentClass')
  if (classFilter) {
    where.studentClass = { equals: classFilter.trim() }
  }

  const localityFilter = searchParams.get('locality')
  if (localityFilter) {
    where.locality = { equals: localityFilter.trim() }
  }

  const enquiryFilter = searchParams.get('studentEnquiry')
  if (enquiryFilter) {
    const numId = Number(enquiryFilter)
    if (!Number.isSafeInteger(numId) || numId <= 0) {
      throw new ServiceError('Invalid studentEnquiry filter ID.', 400)
    }
    where.studentEnquiry = { equals: numId }
  }

  const search = searchParams.get('search')
  if (search && search.trim().length > 0) {
    const term = search.trim()
    where.or = [
      { name: { contains: term } },
      { phoneNumber: { contains: term } },
      { parentName: { contains: term } },
    ]
  }

  const result = await payload.find({
    collection: 'students',
    limit,
    page,
    sort,
    where,
    overrideAccess: true,
  })

  return {
    docs: (result.docs as unknown as Record<string, unknown>[]).map(serializeStudent),
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    page: result.page ?? page,
    limit: result.limit,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
  }
}

export async function getStudentById(
  payload: Payload,
  studentId: number,
): Promise<Record<string, unknown>> {
  const doc = (await payload.findByID({
    collection: 'students',
    id: studentId,
    disableErrors: true,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!doc) {
    throw new ServiceError('Student not found.', 404)
  }

  return serializeStudent(doc)
}

export async function updateStudentById(
  payload: Payload,
  studentId: number,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const existing = (await payload.findByID({
    collection: 'students',
    id: studentId,
    disableErrors: true,
    overrideAccess: true,
  })) as unknown as Record<string, unknown> | null

  if (!existing) {
    throw new ServiceError('Student not found.', 404)
  }

  if (
    body.studentEnquiry !== undefined ||
    body.convertedAt !== undefined ||
    body.convertedBy !== undefined
  ) {
    throw new ServiceError(
      'Original conversion metadata (studentEnquiry, convertedAt, convertedBy) cannot be modified.',
      400,
      [
        {
          field: 'studentEnquiry',
          message: 'Conversion metadata cannot be modified.',
        },
      ],
    )
  }

  const updateData: Record<string, unknown> = {}

  const requiredStringLimits: [string, number][] = [
    ['name', 200],
    ['studentClass', 50],
    ['locality', 200],
    ['preferredTiming', 100],
  ]
  for (const [field, maxLen] of requiredStringLimits) {
    if (body[field] !== undefined) {
      if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
        throw new ServiceError(`${field} must be a non-empty string.`, 400, [
          { field, message: `${field} must be a non-empty string.` },
        ])
      }
      if ((body[field] as string).trim().length > maxLen) {
        throw new ServiceError(
          `${field} must be at most ${maxLen} characters.`,
          400,
          [{ field, message: `${field} must be at most ${maxLen} characters.` }],
        )
      }
      updateData[field] = (body[field] as string).trim()
    }
  }

  if (body.phoneNumber !== undefined) {
    if (!isValidPhoneNumber(body.phoneNumber)) {
      throw new ServiceError(
        'Invalid phoneNumber. Provide 7–15 digits with an optional leading +.',
        400,
        [{ field: 'phoneNumber', message: 'Invalid phoneNumber.' }],
      )
    }
    updateData.phoneNumber = normalizePhoneNumber(body.phoneNumber)
  }

  if (body.alternatePhoneNumber !== undefined) {
    if (body.alternatePhoneNumber === null || body.alternatePhoneNumber === '') {
      updateData.alternatePhoneNumber = null
    } else if (!isValidPhoneNumber(body.alternatePhoneNumber)) {
      throw new ServiceError(
        'Invalid alternatePhoneNumber. Provide 7–15 digits with an optional leading +.',
        400,
        [{ field: 'alternatePhoneNumber', message: 'Invalid alternatePhoneNumber.' }],
      )
    } else {
      updateData.alternatePhoneNumber = normalizePhoneNumber(
        body.alternatePhoneNumber,
      )
    }
  }

  if (body.parentEmail !== undefined) {
    if (body.parentEmail === null || body.parentEmail === '') {
      updateData.parentEmail = null
    } else if (!isValidEmail(body.parentEmail)) {
      throw new ServiceError('Invalid parentEmail address.', 400, [
        { field: 'parentEmail', message: 'Invalid parentEmail address.' },
      ])
    } else {
      updateData.parentEmail = (body.parentEmail as string).trim()
    }
  }

  if (body.subjects !== undefined) {
    const parsedSubjects = normalizeSubjectsInput(body.subjects)
    if (!parsedSubjects.ok) {
      throw new ServiceError(parsedSubjects.message, 400, [
        { field: 'subjects', message: parsedSubjects.message },
      ])
    }
    updateData.subjects = parsedSubjects.rows
  }

  const optionalNullableStrings: [string, number][] = [
    ['parentName', 200],
    ['customSubject', 200],
    ['customLocality', 200],
    ['budgetRange', 100],
    ['learningNotes', 5000],
  ]
  for (const [field, maxLen] of optionalNullableStrings) {
    if (body[field] !== undefined) {
      if (body[field] === null || body[field] === '') {
        updateData[field] = null
      } else if (typeof body[field] !== 'string') {
        throw new ServiceError(`${field} must be a string.`, 400, [
          { field, message: `${field} must be a string.` },
        ])
      } else if ((body[field] as string).trim().length > maxLen) {
        throw new ServiceError(
          `${field} must be at most ${maxLen} characters.`,
          400,
          [{ field, message: `${field} must be at most ${maxLen} characters.` }],
        )
      } else {
        updateData[field] = (body[field] as string).trim()
      }
    }
  }

  if (body.status !== undefined) {
    if (!isValidStudentStatus(body.status)) {
      throw new ServiceError(
        `Invalid status. Allowed values: ${studentStatuses.join(', ')}.`,
        400,
        [{ field: 'status', message: 'Invalid student status.' }],
      )
    }
    updateData.status = body.status
  }

  if (Object.keys(updateData).length === 0) {
    throw new ServiceError('No valid fields provided for update.', 400)
  }

  const updated = await payload.update({
    collection: 'students',
    id: studentId,
    data: updateData,
    overrideAccess: true,
  })

  return serializeStudent(updated as unknown as Record<string, unknown>)
}
