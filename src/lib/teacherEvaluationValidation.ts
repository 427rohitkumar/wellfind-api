// Domain validation, scoring formulas, and status helpers for
// Teacher Evaluation records (`FR-C1` to `FR-C3`, `BR-10`, `BR-11`).

export const DEFAULT_WRITTEN_TEST_WEIGHT = 0.5
export const DEFAULT_INTERVIEW_WEIGHT = 0.5

export const evaluationStatuses = ['in_progress', 'completed'] as const
export type EvaluationStatus = (typeof evaluationStatuses)[number]

export const EVALUABLE_APPLICATION_STATUSES = [
  'new',
  'under_review',
  'shortlisted',
  'evaluation_completed',
] as const

export interface EvaluationWeights {
  writtenTestWeight: number
  interviewWeight: number
}

export interface ValidatedEvaluationSectionInput {
  marksObtained: number
  totalMarks: number
  percentage: number
  remarks?: string
}

export interface ValidatedCreateEvaluationInput {
  writtenTest?: ValidatedEvaluationSectionInput
  interview?: ValidatedEvaluationSectionInput
  overallRemarks?: string
  requestedCompleted: boolean
}

export interface ValidatedUpdateEvaluationInput {
  writtenTest?: ValidatedEvaluationSectionInput
  interview?: ValidatedEvaluationSectionInput
  overallRemarks?: string | null
  requestedStatus?: EvaluationStatus
  recalculate: boolean
  changeReason?: string
}

/**
 * Rounds numeric percentage and score values to two decimal places while
 * preserving exact tenths such as `77.5` without binary floating-point drift.
 */
export function roundEvaluationScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function isValidEvaluationStatus(value: unknown): value is EvaluationStatus {
  return typeof value === 'string' && (evaluationStatuses as readonly string[]).includes(value)
}

/**
 * Validates centrally configured written-test and interview weights.
 * Both scores must contribute strictly positively (`0 < w < 1`, sum = `1.0`).
 */
export function validateEvaluationWeights(
  writtenWeight: unknown,
  interviewWeight: unknown,
): { ok: true; weights: EvaluationWeights } | { ok: false; field: string; message: string } {
  if (
    typeof writtenWeight !== 'number' ||
    !Number.isFinite(writtenWeight) ||
    writtenWeight <= 0 ||
    writtenWeight >= 1
  ) {
    return {
      ok: false,
      field: 'writtenTestWeight',
      message: 'writtenTestWeight must be a finite number strictly between 0 and 1.',
    }
  }

  if (
    typeof interviewWeight !== 'number' ||
    !Number.isFinite(interviewWeight) ||
    interviewWeight <= 0 ||
    interviewWeight >= 1
  ) {
    return {
      ok: false,
      field: 'interviewWeight',
      message: 'interviewWeight must be a finite number strictly between 0 and 1.',
    }
  }

  if (Math.abs(writtenWeight + interviewWeight - 1) > 1e-6) {
    return {
      ok: false,
      field: 'weights',
      message: 'writtenTestWeight and interviewWeight must sum to 1.0.',
    }
  }

  return {
    ok: true,
    weights: {
      writtenTestWeight: writtenWeight,
      interviewWeight,
    },
  }
}

/**
 * Validates either `writtenTest` or `interview` score submission and computes
 * its component percentage.
 */
export function validateEvaluationSectionInput(
  raw: unknown,
  sectionName: 'writtenTest' | 'interview',
):
  | { ok: true; section: ValidatedEvaluationSectionInput }
  | { ok: false; field: string; message: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      field: sectionName,
      message: `${sectionName} must be an object with marksObtained and totalMarks.`,
    }
  }

  const record = raw as Record<string, unknown>

  if (
    typeof record.totalMarks !== 'number' ||
    !Number.isFinite(record.totalMarks) ||
    record.totalMarks <= 0
  ) {
    return {
      ok: false,
      field: `${sectionName}.totalMarks`,
      message: `${sectionName}.totalMarks must be a finite number greater than 0.`,
    }
  }

  if (
    typeof record.marksObtained !== 'number' ||
    !Number.isFinite(record.marksObtained) ||
    record.marksObtained < 0
  ) {
    return {
      ok: false,
      field: `${sectionName}.marksObtained`,
      message: `${sectionName}.marksObtained must be a finite number greater than or equal to 0.`,
    }
  }

  if (record.marksObtained > record.totalMarks) {
    return {
      ok: false,
      field: `${sectionName}.marksObtained`,
      message: `${sectionName}.marksObtained cannot exceed ${sectionName}.totalMarks.`,
    }
  }

  let remarks: string | undefined
  if (record.remarks !== undefined && record.remarks !== null) {
    if (typeof record.remarks !== 'string') {
      return {
        ok: false,
        field: `${sectionName}.remarks`,
        message: `${sectionName}.remarks must be a string.`,
      }
    }
    const trimmed = record.remarks.trim()
    if (trimmed.length > 2000) {
      return {
        ok: false,
        field: `${sectionName}.remarks`,
        message: `${sectionName}.remarks must be at most 2000 characters.`,
      }
    }
    if (trimmed.length > 0) {
      remarks = trimmed
    }
  }

  return {
    ok: true,
    section: {
      marksObtained: record.marksObtained,
      totalMarks: record.totalMarks,
      percentage: roundEvaluationScore((record.marksObtained / record.totalMarks) * 100),
      ...(remarks !== undefined ? { remarks } : {}),
    },
  }
}

/**
 * Computes `Written Percentage`, `Interview Percentage`, and weighted
 * `Quality Score` per PRD `FR-C2`.
 */
export function calculateQualityScoreBreakdown(params: {
  writtenMarksObtained: number
  writtenTotalMarks: number
  interviewMarksObtained: number
  interviewTotalMarks: number
  weights: EvaluationWeights
}): {
  writtenPercentage: number
  interviewPercentage: number
  qualityScore: number
} {
  const rawWrittenPct = (params.writtenMarksObtained / params.writtenTotalMarks) * 100
  const rawInterviewPct = (params.interviewMarksObtained / params.interviewTotalMarks) * 100

  return {
    writtenPercentage: roundEvaluationScore(rawWrittenPct),
    interviewPercentage: roundEvaluationScore(rawInterviewPct),
    qualityScore: roundEvaluationScore(
      rawWrittenPct * params.weights.writtenTestWeight +
        rawInterviewPct * params.weights.interviewWeight,
    ),
  }
}

function parseCompletionIntent(
  body: Record<string, unknown>,
):
  | { ok: true; requestedStatus?: EvaluationStatus; explicitCompletionFlag: boolean }
  | { ok: false; field: string; message: string } {
  let requestedStatus: EvaluationStatus | undefined
  const rawStatus = body.evaluationStatus ?? body.status

  if (rawStatus !== undefined && rawStatus !== null) {
    if (!isValidEvaluationStatus(rawStatus)) {
      return {
        ok: false,
        field: body.evaluationStatus !== undefined ? 'evaluationStatus' : 'status',
        message: `Evaluation status must be one of: ${evaluationStatuses.join(', ')}.`,
      }
    }
    requestedStatus = rawStatus
  }

  const rawFlag = body.markCompleted ?? body.complete ?? body.isCompleted
  let explicitCompletionFlag = false
  if (rawFlag !== undefined && rawFlag !== null) {
    if (typeof rawFlag !== 'boolean') {
      return {
        ok: false,
        field: 'markCompleted',
        message: 'Completion flag must be a boolean.',
      }
    }
    explicitCompletionFlag = rawFlag
  }

  return { ok: true, requestedStatus, explicitCompletionFlag }
}

/**
 * Validates input for `POST /api/teacher-enquiries/:id/evaluations`.
 */
export function validateCreateEvaluationInput(
  body: Record<string, unknown>,
):
  | { ok: true; data: ValidatedCreateEvaluationInput }
  | { ok: false; field: string; message: string } {
  const completionIntent = parseCompletionIntent(body)
  if (!completionIntent.ok) {
    return completionIntent
  }

  let writtenTest: ValidatedEvaluationSectionInput | undefined
  if (body.writtenTest !== undefined && body.writtenTest !== null) {
    const parsedWritten = validateEvaluationSectionInput(body.writtenTest, 'writtenTest')
    if (!parsedWritten.ok) {
      return parsedWritten
    }
    writtenTest = parsedWritten.section
  }

  let interview: ValidatedEvaluationSectionInput | undefined
  if (body.interview !== undefined && body.interview !== null) {
    const parsedInterview = validateEvaluationSectionInput(body.interview, 'interview')
    if (!parsedInterview.ok) {
      return parsedInterview
    }
    interview = parsedInterview.section
  }

  if (!writtenTest && !interview) {
    return {
      ok: false,
      field: 'writtenTest',
      message: 'At least writtenTest or interview evaluation details are required.',
    }
  }

  const wantsCompleted =
    completionIntent.requestedStatus === 'completed' || completionIntent.explicitCompletionFlag

  if (wantsCompleted && (!writtenTest || !interview)) {
    return {
      ok: false,
      field: !writtenTest ? 'writtenTest' : 'interview',
      message: 'Both writtenTest and interview results are required for a completed evaluation.',
    }
  }

  if (completionIntent.requestedStatus === 'in_progress' && writtenTest && interview) {
    return {
      ok: false,
      field: 'evaluationStatus',
      message:
        'An evaluation with both writtenTest and interview results cannot be saved as in_progress.',
    }
  }

  let overallRemarks: string | undefined
  if (body.overallRemarks !== undefined && body.overallRemarks !== null) {
    if (typeof body.overallRemarks !== 'string') {
      return {
        ok: false,
        field: 'overallRemarks',
        message: 'overallRemarks must be a string.',
      }
    }
    const trimmed = body.overallRemarks.trim()
    if (trimmed.length > 3000) {
      return {
        ok: false,
        field: 'overallRemarks',
        message: 'overallRemarks must be at most 3000 characters.',
      }
    }
    if (trimmed.length > 0) {
      overallRemarks = trimmed
    }
  }

  return {
    ok: true,
    data: {
      ...(writtenTest ? { writtenTest } : {}),
      ...(interview ? { interview } : {}),
      ...(overallRemarks !== undefined ? { overallRemarks } : {}),
      requestedCompleted: Boolean(writtenTest && interview),
    },
  }
}

/**
 * Validates input for `PATCH /api/teacher-enquiries/:id/evaluations/:evaluationId`.
 */
export function validateUpdateEvaluationInput(
  body: Record<string, unknown>,
  existingStatus: EvaluationStatus,
):
  | { ok: true; data: ValidatedUpdateEvaluationInput }
  | { ok: false; field: string; message: string } {
  if (body.writtenTest === null) {
    return {
      ok: false,
      field: 'writtenTest',
      message: 'writtenTest result cannot be cleared once recorded.',
    }
  }
  if (body.interview === null) {
    return {
      ok: false,
      field: 'interview',
      message: 'interview result cannot be cleared once recorded.',
    }
  }

  const completionIntent = parseCompletionIntent(body)
  if (!completionIntent.ok) {
    return completionIntent
  }

  if (existingStatus === 'completed' && completionIntent.requestedStatus === 'in_progress') {
    return {
      ok: false,
      field: 'evaluationStatus',
      message: 'A completed evaluation cannot be reverted to in_progress.',
    }
  }

  let writtenTest: ValidatedEvaluationSectionInput | undefined
  if (body.writtenTest !== undefined) {
    const parsedWritten = validateEvaluationSectionInput(body.writtenTest, 'writtenTest')
    if (!parsedWritten.ok) {
      return parsedWritten
    }
    writtenTest = parsedWritten.section
  }

  let interview: ValidatedEvaluationSectionInput | undefined
  if (body.interview !== undefined) {
    const parsedInterview = validateEvaluationSectionInput(body.interview, 'interview')
    if (!parsedInterview.ok) {
      return parsedInterview
    }
    interview = parsedInterview.section
  }

  let overallRemarks: string | null | undefined
  if (body.overallRemarks !== undefined) {
    if (body.overallRemarks === null) {
      overallRemarks = null
    } else if (typeof body.overallRemarks !== 'string') {
      return {
        ok: false,
        field: 'overallRemarks',
        message: 'overallRemarks must be a string or null.',
      }
    } else {
      const trimmed = body.overallRemarks.trim()
      if (trimmed.length > 3000) {
        return {
          ok: false,
          field: 'overallRemarks',
          message: 'overallRemarks must be at most 3000 characters.',
        }
      }
      overallRemarks = trimmed.length > 0 ? trimmed : null
    }
  }

  let recalculate = false
  if (body.recalculate !== undefined && body.recalculate !== null) {
    if (typeof body.recalculate !== 'boolean') {
      return {
        ok: false,
        field: 'recalculate',
        message: 'recalculate must be a boolean.',
      }
    }
    recalculate = body.recalculate
  }

  const hasChanges =
    writtenTest !== undefined ||
    interview !== undefined ||
    overallRemarks !== undefined ||
    recalculate ||
    completionIntent.requestedStatus !== undefined ||
    completionIntent.explicitCompletionFlag

  if (!hasChanges) {
    return {
      ok: false,
      field: 'body',
      message: 'At least one evaluation field or recalculate flag must be provided.',
    }
  }

  let changeReason: string | undefined
  if (body.changeReason !== undefined && body.changeReason !== null) {
    if (typeof body.changeReason !== 'string') {
      return {
        ok: false,
        field: 'changeReason',
        message: 'changeReason must be a string.',
      }
    }
    const trimmedReason = body.changeReason.trim()
    if (trimmedReason.length > 1000) {
      return {
        ok: false,
        field: 'changeReason',
        message: 'changeReason must be at most 1000 characters.',
      }
    }
    if (trimmedReason.length > 0) {
      changeReason = trimmedReason
    }
  }

  if (existingStatus === 'completed' && !changeReason) {
    return {
      ok: false,
      field: 'changeReason',
      message:
        'A non-empty changeReason is required when updating a completed evaluation so history is preserved.',
    }
  }

  const requestedStatus: EvaluationStatus | undefined = completionIntent.explicitCompletionFlag
    ? 'completed'
    : completionIntent.requestedStatus

  return {
    ok: true,
    data: {
      ...(writtenTest ? { writtenTest } : {}),
      ...(interview ? { interview } : {}),
      ...(overallRemarks !== undefined ? { overallRemarks } : {}),
      ...(requestedStatus ? { requestedStatus } : {}),
      recalculate,
      ...(changeReason ? { changeReason } : {}),
    },
  }
}
