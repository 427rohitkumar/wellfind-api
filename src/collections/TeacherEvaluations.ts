import { canRead, canWrite } from '@/lib/permissions'
import { ValidationError, type CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import { extractRelationId } from '@/lib/studentValidation'
import {
  calculateQualityScoreBreakdown,
  DEFAULT_INTERVIEW_WEIGHT,
  DEFAULT_WRITTEN_TEST_WEIGHT,
  evaluationStatuses,
  validateEvaluationWeights,
  validateEvaluationSectionInput,
} from '@/lib/teacherEvaluationValidation'

function throwEvaluationValidationError(message: string, path: string): never {
  throw new ValidationError({
    collection: 'teacher-evaluations',
    errors: [{ message, path }],
  })
}

function normalizeAndValidateStoredSection(
  rawSection: unknown,
  sectionName: 'writtenTest' | 'interview',
  fallbackUserId: number | string | null,
  nowIso: string,
): Record<string, unknown> {
  if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) {
    return { isRecorded: false }
  }

  const sectionRecord = rawSection as Record<string, unknown>
  const hasNumbers =
    sectionRecord.marksObtained !== undefined || sectionRecord.totalMarks !== undefined
  const isRecorded = sectionRecord.isRecorded === true || hasNumbers

  if (!isRecorded) {
    return { isRecorded: false }
  }

  const parsed = validateEvaluationSectionInput(sectionRecord, sectionName)
  if (!parsed.ok) {
    throwEvaluationValidationError(parsed.message, parsed.field)
  }

  const existingRecordedBy = extractRelationId(sectionRecord.recordedBy)

  return {
    isRecorded: true,
    marksObtained: parsed.section.marksObtained,
    totalMarks: parsed.section.totalMarks,
    percentage: parsed.section.percentage,
    remarks: parsed.section.remarks ?? null,
    recordedBy: existingRecordedBy ?? fallbackUserId ?? null,
    recordedAt: sectionRecord.recordedAt || nowIso,
  }
}

/**
 * Wellfind Academic — Teacher Evaluations collection (`FR-C1` to `FR-C3`, `BR-10`, `BR-11`).
 *
 * Independently stores written test and interview evaluations linked to a
 * `teacher-enquiries` record, records server-derived evaluator identity and
 * UTC timestamps, calculates weighted quality score using centrally configured
 * weights, and maintains immutable revision and attempt history.
 *
 * Quality score calculation never triggers automatic teacher approval or
 * rejection (`FR-C2`).
 *
 * Access control: Active `super_admin` only.
 */
export const TeacherEvaluations: CollectionConfig = {
  slug: 'teacher-evaluations',
  admin: {
    useAsTitle: 'evaluationStatus',
    defaultColumns: [
      'teacherEnquiry',
      'attemptNumber',
      'evaluationStatus',
      'qualityScore',
      'evaluator',
      'evaluatedAt',
    ],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
    read: ({ req: { user } }) => canRead(user, 'teacher_inquiries'),
    update: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
    delete: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
  },
  indexes: [
    {
      fields: ['teacherEnquiry', 'attemptNumber'],
      unique: true,
    },
  ],
  fields: [
    {
      name: 'teacherEnquiry',
      label: 'Teacher Application',
      type: 'relationship',
      relationTo: 'teacher-enquiries',
      hasMany: false,
      required: true,
      index: true,
      admin: {
        description: 'Teacher application being evaluated.',
      },
    },
    {
      name: 'attemptNumber',
      label: 'Attempt Number',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      admin: {
        description: 'Sequential evaluation number per teacher enquiry for history tracking.',
      },
    },
    {
      name: 'evaluationStatus',
      label: 'Evaluation Status',
      type: 'select',
      required: true,
      defaultValue: 'in_progress',
      options: [...evaluationStatuses],
      index: true,
    },
    {
      name: 'writtenTest',
      label: 'Written Test',
      type: 'group',
      fields: [
        {
          name: 'isRecorded',
          label: 'Recorded',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'marksObtained',
          label: 'Marks Obtained',
          type: 'number',
          required: false,
          min: 0,
        },
        {
          name: 'totalMarks',
          label: 'Total Marks',
          type: 'number',
          required: false,
        },
        {
          name: 'percentage',
          label: 'Written Percentage',
          type: 'number',
          required: false,
        },
        {
          name: 'remarks',
          label: 'Written Test Remarks',
          type: 'textarea',
          required: false,
          maxLength: 2000,
        },
        {
          name: 'recordedBy',
          label: 'Recorded By',
          type: 'relationship',
          relationTo: 'users',
          hasMany: false,
          required: false,
        },
        {
          name: 'recordedAt',
          label: 'Recorded At',
          type: 'date',
          required: false,
        },
      ],
    },
    {
      name: 'interview',
      label: 'Interview',
      type: 'group',
      fields: [
        {
          name: 'isRecorded',
          label: 'Recorded',
          type: 'checkbox',
          defaultValue: false,
        },
        {
          name: 'marksObtained',
          label: 'Marks Obtained',
          type: 'number',
          required: false,
          min: 0,
        },
        {
          name: 'totalMarks',
          label: 'Total Marks',
          type: 'number',
          required: false,
        },
        {
          name: 'percentage',
          label: 'Interview Percentage',
          type: 'number',
          required: false,
        },
        {
          name: 'remarks',
          label: 'Interview Remarks',
          type: 'textarea',
          required: false,
          maxLength: 2000,
        },
        {
          name: 'recordedBy',
          label: 'Recorded By',
          type: 'relationship',
          relationTo: 'users',
          hasMany: false,
          required: false,
        },
        {
          name: 'recordedAt',
          label: 'Recorded At',
          type: 'date',
          required: false,
        },
      ],
    },
    {
      name: 'appliedWeights',
      label: 'Applied Score Weights',
      type: 'group',
      fields: [
        {
          name: 'writtenTestWeight',
          label: 'Written Test Weight',
          type: 'number',
          required: false,
        },
        {
          name: 'interviewWeight',
          label: 'Interview Weight',
          type: 'number',
          required: false,
        },
      ],
    },
    {
      name: 'qualityScore',
      label: 'Quality Score',
      type: 'number',
      required: false,
      index: true,
      admin: {
        description: 'Weighted evaluation score (0–100), calculated when completed.',
      },
    },
    {
      name: 'overallRemarks',
      label: 'Overall Remarks',
      type: 'textarea',
      required: false,
      maxLength: 3000,
    },
    {
      name: 'evaluator',
      label: 'Evaluator',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
      index: true,
    },
    {
      name: 'evaluatedAt',
      label: 'Evaluated At',
      type: 'date',
      required: false,
      index: true,
    },
    {
      name: 'completedAt',
      label: 'Completed At',
      type: 'date',
      required: false,
      index: true,
    },
    {
      name: 'lastUpdatedBy',
      label: 'Last Updated By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
    },
    {
      name: 'lastUpdatedAt',
      label: 'Last Updated At',
      type: 'date',
      required: false,
    },
    {
      name: 'revisionHistory',
      label: 'Revision History',
      type: 'array',
      admin: {
        description:
          'Append-only snapshot history preserving prior marks, weights, quality score, and actors.',
      },
      fields: [
        {
          name: 'revisionNumber',
          type: 'number',
          required: true,
          min: 1,
        },
        {
          name: 'previousStatus',
          type: 'select',
          options: [...evaluationStatuses],
          required: true,
        },
        {
          name: 'newStatus',
          type: 'select',
          options: [...evaluationStatuses],
          required: true,
        },
        {
          name: 'previousWrittenTest',
          type: 'json',
          required: false,
        },
        {
          name: 'previousInterview',
          type: 'json',
          required: false,
        },
        {
          name: 'previousAppliedWeights',
          type: 'json',
          required: false,
        },
        {
          name: 'previousQualityScore',
          type: 'number',
          required: false,
        },
        {
          name: 'newQualityScore',
          type: 'number',
          required: false,
        },
        {
          name: 'changeReason',
          type: 'text',
          required: false,
          maxLength: 1000,
        },
        {
          name: 'changedBy',
          type: 'relationship',
          relationTo: 'users',
          hasMany: false,
          required: false,
        },
        {
          name: 'changedAt',
          type: 'date',
          required: true,
        },
      ],
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }): Promise<Record<string, unknown>> => {
        const nowIso = new Date().toISOString()
        const actorId = req.user?.id ?? null

        if (operation === 'update') {
          if (data.teacherEnquiry !== undefined) {
            const prevEnquiry = extractRelationId(originalDoc?.teacherEnquiry)
            const nextEnquiry = extractRelationId(data.teacherEnquiry)
            if (prevEnquiry !== nextEnquiry) {
              throwEvaluationValidationError(
                'Teacher application reference on an evaluation cannot be modified.',
                'teacherEnquiry',
              )
            }
          }

          if (
            originalDoc?.evaluationStatus === 'completed' &&
            data.evaluationStatus === 'in_progress'
          ) {
            throwEvaluationValidationError(
              'A completed evaluation cannot be reverted to in_progress.',
              'evaluationStatus',
            )
          }

          const existingHistory = Array.isArray(originalDoc?.revisionHistory)
            ? originalDoc.revisionHistory
            : []
          if (data.revisionHistory !== undefined) {
            if (
              !Array.isArray(data.revisionHistory) ||
              data.revisionHistory.length < existingHistory.length
            ) {
              throwEvaluationValidationError(
                'Evaluation revision history cannot be deleted or truncated.',
                'revisionHistory',
              )
            }
          }
        }

        const mergedWritten = normalizeAndValidateStoredSection(
          data.writtenTest !== undefined ? data.writtenTest : originalDoc?.writtenTest,
          'writtenTest',
          actorId,
          nowIso,
        )
        const mergedInterview = normalizeAndValidateStoredSection(
          data.interview !== undefined ? data.interview : originalDoc?.interview,
          'interview',
          actorId,
          nowIso,
        )

        data.writtenTest = mergedWritten
        data.interview = mergedInterview

        const writtenRecorded = mergedWritten.isRecorded === true
        const interviewRecorded = mergedInterview.isRecorded === true

        if (!writtenRecorded && !interviewRecorded) {
          throwEvaluationValidationError(
            'At least writtenTest or interview result is required.',
            'writtenTest',
          )
        }

        const nextStatus =
          data.evaluationStatus ??
          originalDoc?.evaluationStatus ??
          (writtenRecorded && interviewRecorded ? 'completed' : 'in_progress')

        if (nextStatus === 'completed' && (!writtenRecorded || !interviewRecorded)) {
          throwEvaluationValidationError(
            'Both writtenTest and interview results are required for a completed evaluation.',
            !writtenRecorded ? 'writtenTest' : 'interview',
          )
        }

        data.evaluationStatus = nextStatus

        if (typeof data.overallRemarks === 'string') {
          data.overallRemarks = data.overallRemarks.trim()
        }

        if (operation === 'create') {
          data.evaluator = data.evaluator ?? actorId ?? null
          data.evaluatedAt = data.evaluatedAt || nowIso
        } else {
          data.lastUpdatedBy = data.lastUpdatedBy ?? actorId ?? null
          data.lastUpdatedAt = data.lastUpdatedAt || nowIso
        }

        if (nextStatus === 'completed') {
          const rawWeights = (data.appliedWeights ?? originalDoc?.appliedWeights ?? {}) as Record<
            string,
            unknown
          >
          let writtenWeight =
            typeof rawWeights.writtenTestWeight === 'number'
              ? rawWeights.writtenTestWeight
              : DEFAULT_WRITTEN_TEST_WEIGHT
          let interviewWeight =
            typeof rawWeights.interviewWeight === 'number'
              ? rawWeights.interviewWeight
              : DEFAULT_INTERVIEW_WEIGHT

          if (
            typeof rawWeights.writtenTestWeight !== 'number' ||
            typeof rawWeights.interviewWeight !== 'number'
          ) {
            try {
              const cfg = (await (req.payload as any).findGlobal({
                slug: 'teacher-evaluation-config',
                overrideAccess: true,
                req,
              })) as Record<string, unknown> | null
              if (cfg) {
                const checkCfg = validateEvaluationWeights(
                  cfg.writtenTestWeight,
                  cfg.interviewWeight,
                )
                if (checkCfg.ok) {
                  writtenWeight = checkCfg.weights.writtenTestWeight
                  interviewWeight = checkCfg.weights.interviewWeight
                }
              }
            } catch {
              writtenWeight = DEFAULT_WRITTEN_TEST_WEIGHT
              interviewWeight = DEFAULT_INTERVIEW_WEIGHT
            }
          } else {
            const checkProvided = validateEvaluationWeights(writtenWeight, interviewWeight)
            if (!checkProvided.ok) {
              throwEvaluationValidationError(checkProvided.message, checkProvided.field)
            }
          }

          const breakdown = calculateQualityScoreBreakdown({
            writtenMarksObtained: Number(mergedWritten.marksObtained),
            writtenTotalMarks: Number(mergedWritten.totalMarks),
            interviewMarksObtained: Number(mergedInterview.marksObtained),
            interviewTotalMarks: Number(mergedInterview.totalMarks),
            weights: {
              writtenTestWeight: writtenWeight,
              interviewWeight,
            },
          })

          data.writtenTest = {
            ...mergedWritten,
            percentage: breakdown.writtenPercentage,
          }
          data.interview = {
            ...mergedInterview,
            percentage: breakdown.interviewPercentage,
          }
          data.appliedWeights = {
            writtenTestWeight: writtenWeight,
            interviewWeight,
          }
          data.qualityScore = breakdown.qualityScore
          data.completedAt = data.completedAt || originalDoc?.completedAt || nowIso
        } else {
          data.appliedWeights = {
            writtenTestWeight: null,
            interviewWeight: null,
          }
          data.qualityScore = null
          data.completedAt = null
        }

        return data
      },
    ],
  },
}
