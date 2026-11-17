import { commitTransaction, initTransaction, killTransaction, type Payload } from 'payload'
import { isUniqueConstraintError, type AuthUserRecord } from '@/lib/api'
import { extractRelationId, parsePaginationParams } from '@/lib/studentValidation'
import {
  calculateQualityScoreBreakdown,
  DEFAULT_INTERVIEW_WEIGHT,
  DEFAULT_WRITTEN_TEST_WEIGHT,
  EVALUABLE_APPLICATION_STATUSES,
  evaluationStatuses,
  isValidEvaluationStatus,
  validateCreateEvaluationInput,
  validateEvaluationWeights,
  validateUpdateEvaluationInput,
  type EvaluationStatus,
  type EvaluationWeights,
  type ValidatedEvaluationSectionInput,
} from '@/lib/teacherEvaluationValidation'
import { ServiceError } from '@/services/studentService'

const ALLOWED_EVALUATION_SORT_FIELDS = new Set([
  'id',
  'attemptNumber',
  'evaluationStatus',
  'qualityScore',
  'evaluatedAt',
  'completedAt',
  'createdAt',
  'updatedAt',
])

export interface SerializedEvaluationSection {
  marksObtained: number
  totalMarks: number
  percentage: number | null
  remarks: string | null
  recordedBy: number | string | null
  recordedAt: unknown
}

export interface SerializedEvaluationRevision {
  revisionNumber: number
  previousStatus: string
  newStatus: string
  previousWrittenTest: Record<string, unknown> | null
  previousInterview: Record<string, unknown> | null
  previousAppliedWeights: EvaluationWeights | null
  previousQualityScore: number | null
  newQualityScore: number | null
  changeReason: string | null
  changedBy: number | string | null
  changedAt: unknown
}

export interface SerializedTeacherEvaluation {
  id: unknown
  teacherEnquiry: number | string | null
  attemptNumber: number
  evaluationStatus: EvaluationStatus
  writtenTest: SerializedEvaluationSection | null
  interview: SerializedEvaluationSection | null
  appliedWeights: EvaluationWeights | null
  qualityScore: number | null
  overallRemarks: string | null
  evaluator: number | string | null
  evaluatedAt: unknown
  completedAt: unknown
  lastUpdatedBy: number | string | null
  lastUpdatedAt: unknown
  revisionCount: number
  revisionHistory: SerializedEvaluationRevision[]
  createdAt: unknown
  updatedAt: unknown
}

function serializeSection(raw: unknown): SerializedEvaluationSection | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const rec = raw as Record<string, unknown>
  if (rec.isRecorded !== true) {
    return null
  }
  return {
    marksObtained: Number(rec.marksObtained ?? 0),
    totalMarks: Number(rec.totalMarks ?? 0),
    percentage:
      typeof rec.percentage === 'number' && Number.isFinite(rec.percentage) ? rec.percentage : null,
    remarks: typeof rec.remarks === 'string' && rec.remarks.length > 0 ? rec.remarks : null,
    recordedBy: extractRelationId(rec.recordedBy),
    recordedAt: rec.recordedAt ?? null,
  }
}

function serializeAppliedWeights(raw: unknown): EvaluationWeights | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null
  }
  const rec = raw as Record<string, unknown>
  if (
    typeof rec.writtenTestWeight !== 'number' ||
    typeof rec.interviewWeight !== 'number' ||
    !Number.isFinite(rec.writtenTestWeight) ||
    !Number.isFinite(rec.interviewWeight)
  ) {
    return null
  }
  return {
    writtenTestWeight: rec.writtenTestWeight,
    interviewWeight: rec.interviewWeight,
  }
}

function serializeRevisionHistory(raw: unknown): SerializedEvaluationRevision[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw
    .filter((entry): entry is Record<string, unknown> =>
      Boolean(entry && typeof entry === 'object'),
    )
    .map((entry, idx) => ({
      revisionNumber:
        typeof entry.revisionNumber === 'number' && Number.isFinite(entry.revisionNumber)
          ? entry.revisionNumber
          : idx + 1,
      previousStatus: String(entry.previousStatus || 'in_progress'),
      newStatus: String(entry.newStatus || 'in_progress'),
      previousWrittenTest:
        entry.previousWrittenTest && typeof entry.previousWrittenTest === 'object'
          ? (entry.previousWrittenTest as Record<string, unknown>)
          : null,
      previousInterview:
        entry.previousInterview && typeof entry.previousInterview === 'object'
          ? (entry.previousInterview as Record<string, unknown>)
          : null,
      previousAppliedWeights: serializeAppliedWeights(entry.previousAppliedWeights),
      previousQualityScore:
        typeof entry.previousQualityScore === 'number' &&
        Number.isFinite(entry.previousQualityScore)
          ? entry.previousQualityScore
          : null,
      newQualityScore:
        typeof entry.newQualityScore === 'number' && Number.isFinite(entry.newQualityScore)
          ? entry.newQualityScore
          : null,
      changeReason:
        typeof entry.changeReason === 'string' && entry.changeReason.length > 0
          ? entry.changeReason
          : null,
      changedBy: extractRelationId(entry.changedBy),
      changedAt: entry.changedAt ?? null,
    }))
}

/**
 * Normalizes a `teacher-evaluations` Payload document for API responses.
 */
export function serializeTeacherEvaluation(
  doc: Record<string, unknown>,
): SerializedTeacherEvaluation {
  const revisionHistory = serializeRevisionHistory(doc.revisionHistory)
  const statusRaw = String(doc.evaluationStatus || 'in_progress')
  const evaluationStatus: EvaluationStatus = isValidEvaluationStatus(statusRaw)
    ? statusRaw
    : 'in_progress'

  return {
    id: doc.id,
    teacherEnquiry: extractRelationId(doc.teacherEnquiry),
    attemptNumber: Number(doc.attemptNumber ?? 1),
    evaluationStatus,
    writtenTest: serializeSection(doc.writtenTest),
    interview: serializeSection(doc.interview),
    appliedWeights:
      evaluationStatus === 'completed' ? serializeAppliedWeights(doc.appliedWeights) : null,
    qualityScore:
      typeof doc.qualityScore === 'number' && Number.isFinite(doc.qualityScore)
        ? doc.qualityScore
        : null,
    overallRemarks:
      typeof doc.overallRemarks === 'string' && doc.overallRemarks.length > 0
        ? doc.overallRemarks
        : null,
    evaluator: extractRelationId(doc.evaluator),
    evaluatedAt: doc.evaluatedAt ?? null,
    completedAt: doc.completedAt ?? null,
    lastUpdatedBy: extractRelationId(doc.lastUpdatedBy),
    lastUpdatedAt: doc.lastUpdatedAt ?? null,
    revisionCount: revisionHistory.length,
    revisionHistory,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

async function runInAdminTransaction<T>(
  payload: Payload,
  adminUser: AuthUserRecord,
  fn: (txReq: any) => Promise<T>,
): Promise<T> {
  const txReq: any = {
    payload,
    user: adminUser,
  }
  const startedTx = await initTransaction(txReq)
  try {
    const result = await fn(txReq)
    if (startedTx) {
      await commitTransaction(txReq)
    }
    return result
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

async function findTeacherEnquiryOrThrow(
  payload: Payload,
  enquiryId: number,
  txReq?: any,
): Promise<Record<string, unknown>> {
  const doc = (await (payload as any).findByID({
    collection: 'teacher-enquiries',
    id: enquiryId,
    disableErrors: true,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })) as Record<string, unknown> | null

  if (!doc) {
    throw new ServiceError('Teacher application not found.', 404, [
      { field: 'teacherEnquiryId', message: 'Teacher application does not exist.' },
    ])
  }

  return doc
}

function assertEnquiryIsEvaluable(enquiry: Record<string, unknown>): void {
  const currentStatus = String(enquiry.applicationStatus || '')
  if (!(EVALUABLE_APPLICATION_STATUSES as readonly string[]).includes(currentStatus)) {
    throw new ServiceError(
      `Teacher application in status "${currentStatus}" cannot be evaluated.`,
      409,
      [
        {
          field: 'applicationStatus',
          message: `Cannot create or modify evaluations when application status is "${currentStatus}".`,
        },
      ],
    )
  }
}

/**
 * Reads centrally configured teacher evaluation weights (`teacher-evaluation-config`).
 * Defaults to 50% / 50% when the global config document has not yet been initialized.
 */
export async function getConfiguredEvaluationWeights(
  payload: Payload,
  txReq?: any,
): Promise<EvaluationWeights> {
  const globalDoc = (await (payload as any).findGlobal({
    slug: 'teacher-evaluation-config',
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })) as Record<string, unknown> | null

  const writtenRaw = globalDoc?.writtenTestWeight ?? DEFAULT_WRITTEN_TEST_WEIGHT
  const interviewRaw = globalDoc?.interviewWeight ?? DEFAULT_INTERVIEW_WEIGHT

  const checked = validateEvaluationWeights(writtenRaw, interviewRaw)
  if (!checked.ok) {
    throw new ServiceError(
      `Invalid central evaluation weight configuration: ${checked.message}`,
      500,
    )
  }
  return checked.weights
}

async function getNextAttemptNumber(
  payload: Payload,
  enquiryId: number,
  txReq: any,
): Promise<number> {
  const latest = await (payload as any).find({
    collection: 'teacher-evaluations',
    where: { teacherEnquiry: { equals: enquiryId } },
    sort: '-attemptNumber',
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req: txReq,
  })

  if (!latest?.docs?.length) {
    return 1
  }
  const topAttempt = Number(latest.docs[0].attemptNumber ?? 0)
  return Number.isFinite(topAttempt) && topAttempt >= 1 ? topAttempt + 1 : 1
}

function toStoredSectionData(
  section: ValidatedEvaluationSectionInput,
  actorId: number,
  recordedAt: string,
): Record<string, unknown> {
  return {
    isRecorded: true,
    marksObtained: section.marksObtained,
    totalMarks: section.totalMarks,
    percentage: section.percentage,
    remarks: section.remarks ?? null,
    recordedBy: actorId,
    recordedAt,
  }
}

async function syncEnquiryStatusOnCompletedEvaluation(params: {
  payload: Payload
  enquiry: Record<string, unknown>
  enquiryId: number
  txReq: any
}): Promise<void> {
  const currentStatus = String(params.enquiry.applicationStatus || '')
  if (currentStatus !== 'shortlisted') {
    return
  }

  await (params.payload as any).update({
    collection: 'teacher-enquiries',
    id: params.enquiryId,
    data: {
      applicationStatus: 'evaluation_completed',
      changeReason: 'Teacher written test and interview evaluation completed.',
    },
    overrideAccess: true,
    req: params.txReq,
  })
}

function formatAuditEvaluationSummary(
  attemptNumber: number,
  status: string,
  qualityScore: number | null,
): string {
  const scorePart = qualityScore !== null ? `(${qualityScore})` : '(unscored)'
  return `eval#${attemptNumber}:${status}${scorePart}`
}

/**
 * `FR-C1` / `FR-C2` — Creates a teacher evaluation record linked to `enquiryId`.
 * Preserves history by creating sequential attempts without overwriting earlier records,
 * and never auto-approves or auto-rejects an applicant.
 */
export async function createTeacherEvaluation(
  payload: Payload,
  enquiryId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<SerializedTeacherEvaluation> {
  const validated = validateCreateEvaluationInput(body)
  if (!validated.ok) {
    throw new ServiceError(validated.message, 400, [
      { field: validated.field, message: validated.message },
    ])
  }

  try {
    return await runInAdminTransaction(payload, adminUser, async (txReq) => {
      const enquiry = await findTeacherEnquiryOrThrow(payload, enquiryId, txReq)
      assertEnquiryIsEvaluable(enquiry)

      const nowIso = new Date().toISOString()
      const attemptNumber = await getNextAttemptNumber(payload, enquiryId, txReq)

      const writtenData = validated.data.writtenTest
        ? toStoredSectionData(validated.data.writtenTest, adminUser.id, nowIso)
        : { isRecorded: false }
      const interviewData = validated.data.interview
        ? toStoredSectionData(validated.data.interview, adminUser.id, nowIso)
        : { isRecorded: false }

      const isCompleted = Boolean(validated.data.writtenTest && validated.data.interview)
      let appliedWeights: EvaluationWeights | undefined
      let qualityScore: number | null = null
      let finalWrittenData = writtenData
      let finalInterviewData = interviewData

      if (isCompleted && validated.data.writtenTest && validated.data.interview) {
        appliedWeights = await getConfiguredEvaluationWeights(payload, txReq)
        const breakdown = calculateQualityScoreBreakdown({
          writtenMarksObtained: validated.data.writtenTest.marksObtained,
          writtenTotalMarks: validated.data.writtenTest.totalMarks,
          interviewMarksObtained: validated.data.interview.marksObtained,
          interviewTotalMarks: validated.data.interview.totalMarks,
          weights: appliedWeights,
        })
        qualityScore = breakdown.qualityScore
        finalWrittenData = {
          ...writtenData,
          percentage: breakdown.writtenPercentage,
        }
        finalInterviewData = {
          ...interviewData,
          percentage: breakdown.interviewPercentage,
        }
      }

      const created = (await (payload as any).create({
        collection: 'teacher-evaluations',
        data: {
          teacherEnquiry: enquiryId,
          attemptNumber,
          evaluationStatus: isCompleted ? 'completed' : 'in_progress',
          writtenTest: finalWrittenData,
          interview: finalInterviewData,
          ...(appliedWeights ? { appliedWeights } : {}),
          qualityScore,
          ...(validated.data.overallRemarks !== undefined
            ? { overallRemarks: validated.data.overallRemarks }
            : {}),
          evaluator: adminUser.id,
          evaluatedAt: nowIso,
          ...(isCompleted ? { completedAt: nowIso } : {}),
        },
        overrideAccess: true,
        req: txReq,
      })) as Record<string, unknown>

      if (isCompleted) {
        await syncEnquiryStatusOnCompletedEvaluation({
          payload,
          enquiry,
          enquiryId,
          txReq,
        })
      }

      return serializeTeacherEvaluation(created)
    })
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      throw new ServiceError(
        'Concurrent evaluation creation conflicted with another attempt. Please retry.',
        409,
      )
    }
    throw err
  }
}

/**
 * `FR-C3` — Lists paginated evaluation history for a teacher enquiry (`super_admin` only).
 */
export async function listTeacherEvaluations(
  payload: Payload,
  enquiryId: number,
  searchParams: URLSearchParams,
): Promise<{
  docs: SerializedTeacherEvaluation[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPrevPage: boolean
}> {
  await findTeacherEnquiryOrThrow(payload, enquiryId)

  const { page, limit } = parsePaginationParams(searchParams)
  const sortParam = searchParams.get('sort') || '-attemptNumber'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = ALLOWED_EVALUATION_SORT_FIELDS.has(sortField) ? sortParam : '-attemptNumber'

  const where: Record<string, any> = {
    teacherEnquiry: { equals: enquiryId },
  }

  const statusFilter = searchParams.get('evaluationStatus') ?? searchParams.get('status')
  if (statusFilter) {
    if (!isValidEvaluationStatus(statusFilter)) {
      throw new ServiceError(
        `Invalid evaluationStatus filter. Allowed values: ${evaluationStatuses.join(', ')}.`,
        400,
        [{ field: 'evaluationStatus', message: 'Invalid evaluationStatus filter.' }],
      )
    }
    where.evaluationStatus = { equals: statusFilter }
  }

  const result = await (payload as any).find({
    collection: 'teacher-evaluations',
    where,
    page,
    limit,
    sort,
    depth: 0,
    overrideAccess: true,
  })

  return {
    docs: (result.docs as Record<string, unknown>[]).map(serializeTeacherEvaluation),
    totalDocs: Number(result.totalDocs ?? 0),
    totalPages: Number(result.totalPages ?? 1),
    page: Number(result.page ?? page),
    limit: Number(result.limit ?? limit),
    hasNextPage: Boolean(result.hasNextPage),
    hasPrevPage: Boolean(result.hasPrevPage),
  }
}

/**
 * `FR-C3` — Retrieves a single evaluation scoped strictly to `enquiryId`.
 */
export async function getTeacherEvaluationById(
  payload: Payload,
  enquiryId: number,
  evaluationId: number,
): Promise<SerializedTeacherEvaluation> {
  await findTeacherEnquiryOrThrow(payload, enquiryId)

  const doc = (await (payload as any).findByID({
    collection: 'teacher-evaluations',
    id: evaluationId,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
  })) as Record<string, unknown> | null

  if (!doc || extractRelationId(doc.teacherEnquiry) !== enquiryId) {
    throw new ServiceError('Teacher evaluation not found.', 404, [
      { field: 'evaluationId', message: 'Teacher evaluation does not exist for this application.' },
    ])
  }

  return serializeTeacherEvaluation(doc)
}

/**
 * `FR-C2` / `FR-C3` — Authorized evaluation update (`super_admin` only).
 * Requires `changeReason` before altering a completed evaluation, appends a full
 * before-snapshot to `revisionHistory`, writes an `enquiry-audit-log` entry, and
 * recalculates `qualityScore` consistently from the active central weights.
 */
export async function updateTeacherEvaluation(
  payload: Payload,
  enquiryId: number,
  evaluationId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<SerializedTeacherEvaluation> {
  return runInAdminTransaction(payload, adminUser, async (txReq) => {
    const enquiry = await findTeacherEnquiryOrThrow(payload, enquiryId, txReq)
    assertEnquiryIsEvaluable(enquiry)

    const existing = (await (payload as any).findByID({
      collection: 'teacher-evaluations',
      id: evaluationId,
      disableErrors: true,
      depth: 0,
      overrideAccess: true,
      req: txReq,
    })) as Record<string, unknown> | null

    if (!existing || extractRelationId(existing.teacherEnquiry) !== enquiryId) {
      throw new ServiceError('Teacher evaluation not found.', 404, [
        {
          field: 'evaluationId',
          message: 'Teacher evaluation does not exist for this application.',
        },
      ])
    }

    const existingStatusRaw = String(existing.evaluationStatus || 'in_progress')
    const existingStatus: EvaluationStatus = isValidEvaluationStatus(existingStatusRaw)
      ? existingStatusRaw
      : 'in_progress'

    const validated = validateUpdateEvaluationInput(body, existingStatus)
    if (!validated.ok) {
      throw new ServiceError(validated.message, 400, [
        { field: validated.field, message: validated.message },
      ])
    }

    const nowIso = new Date().toISOString()

    const prevWrittenRaw = (existing.writtenTest ?? { isRecorded: false }) as Record<
      string,
      unknown
    >
    const prevInterviewRaw = (existing.interview ?? { isRecorded: false }) as Record<
      string,
      unknown
    >

    const nextWrittenData = validated.data.writtenTest
      ? toStoredSectionData(validated.data.writtenTest, adminUser.id, nowIso)
      : prevWrittenRaw
    const nextInterviewData = validated.data.interview
      ? toStoredSectionData(validated.data.interview, adminUser.id, nowIso)
      : prevInterviewRaw

    const writtenReady = nextWrittenData.isRecorded === true
    const interviewReady = nextInterviewData.isRecorded === true

    if (validated.data.requestedStatus === 'completed' && (!writtenReady || !interviewReady)) {
      throw new ServiceError(
        'Both writtenTest and interview results are required for a completed evaluation.',
        400,
        [
          {
            field: !writtenReady ? 'writtenTest' : 'interview',
            message:
              'Both writtenTest and interview results are required for a completed evaluation.',
          },
        ],
      )
    }

    const nextStatus: EvaluationStatus =
      writtenReady && interviewReady ? 'completed' : 'in_progress'
    let nextWeights: EvaluationWeights | null = null
    let nextQualityScore: number | null = null
    let finalWrittenData = nextWrittenData
    let finalInterviewData = nextInterviewData

    if (nextStatus === 'completed') {
      nextWeights = await getConfiguredEvaluationWeights(payload, txReq)
      const breakdown = calculateQualityScoreBreakdown({
        writtenMarksObtained: Number(nextWrittenData.marksObtained),
        writtenTotalMarks: Number(nextWrittenData.totalMarks),
        interviewMarksObtained: Number(nextInterviewData.marksObtained),
        interviewTotalMarks: Number(nextInterviewData.totalMarks),
        weights: nextWeights,
      })
      nextQualityScore = breakdown.qualityScore
      finalWrittenData = {
        ...nextWrittenData,
        percentage: breakdown.writtenPercentage,
      }
      finalInterviewData = {
        ...nextInterviewData,
        percentage: breakdown.interviewPercentage,
      }
    }

    const existingHistory = Array.isArray(existing.revisionHistory)
      ? (existing.revisionHistory as Record<string, unknown>[])
      : []

    const previousQualityScore =
      typeof existing.qualityScore === 'number' && Number.isFinite(existing.qualityScore)
        ? existing.qualityScore
        : null

    const revisionEntry = {
      revisionNumber: existingHistory.length + 1,
      previousStatus: existingStatus,
      newStatus: nextStatus,
      previousWrittenTest: serializeSection(existing.writtenTest),
      previousInterview: serializeSection(existing.interview),
      previousAppliedWeights: serializeAppliedWeights(existing.appliedWeights),
      previousQualityScore,
      newQualityScore: nextQualityScore,
      changeReason: validated.data.changeReason ?? null,
      changedBy: adminUser.id,
      changedAt: nowIso,
    }

    const attemptNumber = Number(existing.attemptNumber ?? 1)
    const updateData: Record<string, unknown> = {
      evaluationStatus: nextStatus,
      writtenTest: finalWrittenData,
      interview: finalInterviewData,
      ...(nextWeights ? { appliedWeights: nextWeights } : {}),
      qualityScore: nextQualityScore,
      lastUpdatedBy: adminUser.id,
      lastUpdatedAt: nowIso,
      revisionHistory: [...existingHistory, revisionEntry],
    }

    if (validated.data.overallRemarks !== undefined) {
      updateData.overallRemarks = validated.data.overallRemarks
    }

    if (nextStatus === 'completed' && !existing.completedAt) {
      updateData.completedAt = nowIso
    }

    const updated = (await (payload as any).update({
      collection: 'teacher-evaluations',
      id: evaluationId,
      data: updateData,
      overrideAccess: true,
      req: txReq,
    })) as Record<string, unknown>

    await (payload as any).create({
      collection: 'enquiry-audit-log',
      data: {
        enquiryType: 'teacher',
        teacherEnquiry: enquiryId,
        fieldChanged: 'evaluation',
        previousStatus: formatAuditEvaluationSummary(
          attemptNumber,
          existingStatus,
          previousQualityScore,
        ),
        newStatus: formatAuditEvaluationSummary(attemptNumber, nextStatus, nextQualityScore),
        changedBy: adminUser.id,
        changedAt: nowIso,
        changeReason:
          validated.data.changeReason ?? `Updated teacher evaluation attempt #${attemptNumber}.`,
      },
      overrideAccess: true,
      req: txReq,
    })

    if (nextStatus === 'completed') {
      await syncEnquiryStatusOnCompletedEvaluation({
        payload,
        enquiry,
        enquiryId,
        txReq,
      })
    }

    return serializeTeacherEvaluation(updated)
  })
}
