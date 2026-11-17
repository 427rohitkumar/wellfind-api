import {
  commitTransaction,
  initTransaction,
  killTransaction,
  type Payload,
} from 'payload'
import {
  capabilityLevels,
  extractRelationId,
  extractRowStringValues,
  isValidCapabilityLevel,
  parsePaginationParams,
  validateAndBuildAssessmentData,
} from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'

const ALLOWED_ASSESSMENT_SORT_FIELDS = new Set([
  'id',
  'assessedAt',
  'createdAt',
  'updatedAt',
  'currentCapability',
  'assessmentType',
])

export interface SerializedStudentAssessment {
  id: unknown
  student: number | string | null
  assessmentType: string
  previousPerformance: {
    summary: string
    details: string | null
  }
  currentCapability: string
  strengths: string[]
  weaknesses: string[]
  adminNotes: string | null
  assessedBy: number | string | null
  assessedAt: unknown
  createdAt: unknown
  updatedAt: unknown
}

/**
 * Serializes a `student-assessments` document into a normalized REST payload.
 */
export function serializeStudentAssessment(
  doc: Record<string, unknown>,
): SerializedStudentAssessment {
  const prevRaw =
    doc.previousPerformance &&
    typeof doc.previousPerformance === 'object' &&
    !Array.isArray(doc.previousPerformance)
      ? (doc.previousPerformance as Record<string, unknown>)
      : {}

  const detailsRaw = prevRaw.details
  const adminNotesRaw = doc.adminNotes

  return {
    id: doc.id,
    student: extractRelationId(doc.student),
    assessmentType: String(doc.assessmentType || 'initial_review'),
    previousPerformance: {
      summary: String(prevRaw.summary || ''),
      details:
        typeof detailsRaw === 'string' && detailsRaw.length > 0
          ? detailsRaw
          : null,
    },
    currentCapability: String(doc.currentCapability || ''),
    strengths: extractRowStringValues(doc.strengths, 'item'),
    weaknesses: extractRowStringValues(doc.weaknesses, 'item'),
    adminNotes:
      typeof adminNotesRaw === 'string' && adminNotesRaw.length > 0
        ? adminNotesRaw
        : null,
    assessedBy: extractRelationId(doc.assessedBy),
    assessedAt: doc.assessedAt ?? null,
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

/**
 * Creates a new capability assessment record linked to `studentId` without
 * requiring a physical test and while preserving prior assessment history.
 */
export async function createStudentAssessment(
  payload: Payload,
  studentId: number,
  body: Record<string, unknown>,
  adminUser: { id: number; role?: string | null },
): Promise<SerializedStudentAssessment> {
  const validated = validateAndBuildAssessmentData(body, studentId)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  const txReq: any = {
    payload,
    user: adminUser,
  }

  const startedTx = await initTransaction(txReq)
  try {
    await assertStudentExists(payload, studentId, txReq)

    const assessedAt = new Date().toISOString()
    const created = await (payload as any).create({
      collection: 'student-assessments',
      data: {
        student: studentId,
        assessmentType: validated.data.assessmentType,
        previousPerformance: validated.data.previousPerformance,
        currentCapability: validated.data.currentCapability,
        strengths: validated.data.strengths,
        weaknesses: validated.data.weaknesses,
        ...(validated.data.adminNotes !== undefined
          ? { adminNotes: validated.data.adminNotes }
          : {}),
        assessedBy: adminUser.id,
        assessedAt,
      },
      req: txReq,
      overrideAccess: true,
    })

    if (startedTx) {
      await commitTransaction(txReq)
    }

    return serializeStudentAssessment(created as Record<string, unknown>)
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

/**
 * Retrieves paginated capability assessment history for `studentId`.
 */
export async function listStudentAssessments(
  payload: Payload,
  studentId: number,
  searchParams: URLSearchParams,
): Promise<{
  docs: SerializedStudentAssessment[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}> {
  await assertStudentExists(payload, studentId)

  const { page, limit } = parsePaginationParams(searchParams)

  const sortParam = searchParams.get('sort') || '-assessedAt'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = ALLOWED_ASSESSMENT_SORT_FIELDS.has(sortField)
    ? sortParam
    : '-assessedAt'

  const where: Record<string, any> = {
    student: { equals: studentId },
  }

  const capabilityFilter = searchParams.get('currentCapability')
  if (capabilityFilter) {
    if (!isValidCapabilityLevel(capabilityFilter)) {
      throw new ServiceError(
        `Invalid currentCapability filter. Allowed values: ${capabilityLevels.join(', ')}.`,
        400,
        [
          {
            field: 'currentCapability',
            message: `Allowed values: ${capabilityLevels.join(', ')}.`,
          },
        ],
      )
    }
    where.currentCapability = { equals: capabilityFilter }
  }

  const typeFilter = searchParams.get('assessmentType')
  if (typeFilter && typeFilter.trim().length > 0) {
    where.assessmentType = { equals: typeFilter.trim() }
  }

  const result = await payload.find({
    collection: 'student-assessments' as any,
    limit,
    page,
    sort,
    where,
    overrideAccess: true,
  })

  return {
    docs: (result.docs as unknown as Record<string, unknown>[]).map(
      serializeStudentAssessment,
    ),
    totalDocs: result.totalDocs,
    totalPages: result.totalPages,
    page: result.page ?? page,
    limit: result.limit,
    hasNextPage: result.hasNextPage,
    hasPrevPage: result.hasPrevPage,
  }
}
