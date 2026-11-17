import { ValidationError, type GlobalConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import {
  DEFAULT_INTERVIEW_WEIGHT,
  DEFAULT_WRITTEN_TEST_WEIGHT,
  validateEvaluationWeights,
} from '@/lib/teacherEvaluationValidation'

/**
 * Wellfind Academic — Centrally Configurable Teacher Evaluation Settings (`FR-C2`).
 *
 * Stores the active quality score weighting between written test and interview
 * percentages. Defaults to 50% / 50% (`0.50` / `0.50`) and enforces that both
 * weights remain strictly positive and sum to `1.0` (`BR-11`).
 */
export const TeacherEvaluationConfig: GlobalConfig = {
  slug: 'teacher-evaluation-config',
  label: 'Teacher Evaluation Settings',
  access: {
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    update: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    {
      name: 'writtenTestWeight',
      label: 'Written Test Weight',
      type: 'number',
      required: true,
      defaultValue: DEFAULT_WRITTEN_TEST_WEIGHT,
      min: 0.01,
      max: 0.99,
      admin: {
        description:
          'Weight multiplier applied to Written Percentage (0.50 = 50%). Must sum to 1.0 with interviewWeight.',
        step: 0.05,
      },
    },
    {
      name: 'interviewWeight',
      label: 'Interview Weight',
      type: 'number',
      required: true,
      defaultValue: DEFAULT_INTERVIEW_WEIGHT,
      min: 0.01,
      max: 0.99,
      admin: {
        description:
          'Weight multiplier applied to Interview Percentage (0.50 = 50%). Must sum to 1.0 with writtenTestWeight.',
        step: 0.05,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, originalDoc }) => {
        if (!data || typeof data !== 'object') {
          return data
        }

        const written =
          data.writtenTestWeight !== undefined
            ? data.writtenTestWeight
            : (originalDoc?.writtenTestWeight ?? DEFAULT_WRITTEN_TEST_WEIGHT)
        const interview =
          data.interviewWeight !== undefined
            ? data.interviewWeight
            : (originalDoc?.interviewWeight ?? DEFAULT_INTERVIEW_WEIGHT)

        const checked = validateEvaluationWeights(written, interview)
        if (!checked.ok) {
          throw new ValidationError({
            global: 'teacher-evaluation-config',
            errors: [{ message: checked.message, path: checked.field }],
          })
        }

        return {
          ...data,
          writtenTestWeight: checked.weights.writtenTestWeight,
          interviewWeight: checked.weights.interviewWeight,
        }
      },
    ],
  },
}
