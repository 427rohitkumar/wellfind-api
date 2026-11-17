import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import {
  capabilityLevels,
  extractRelationId,
  type CapabilityLevel,
} from '@/lib/studentValidation'
import { StudentWorkflowError } from '@/collections/StudentEnquiries'

export { capabilityLevels, type CapabilityLevel }

function normalizeTextItemRows(raw: unknown): unknown {
  if (!Array.isArray(raw)) {
    return raw
  }
  return raw.map((entry) => {
    if (entry && typeof entry === 'object' && 'item' in entry) {
      const val = (entry as { item?: unknown }).item
      return typeof val === 'string'
        ? { ...(entry as Record<string, unknown>), item: val.trim() }
        : entry
    }
    return entry
  })
}

function validateItemRowText(value: unknown): string | true {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Entry cannot be empty.'
  }
  if (value.trim().length > 150) {
    return 'Entry must be at most 150 characters.'
  }
  return true
}

/**
 * Wellfind Academic — Student Capability Assessment collection (`FR-B1`).
 *
 * Records academic capability reviews, previous performance, strengths,
 * weaknesses, and admin notes linked to an operational Student record.
 * Multiple records per student preserve assessment history over time and do not
 * require a physical student test.
 *
 * Access control: Active `super_admin` only for all CRUD operations.
 */
export const StudentAssessments: CollectionConfig = {
  slug: 'student-assessments',
  admin: {
    useAsTitle: 'assessmentType',
    defaultColumns: [
      'student',
      'assessmentType',
      'currentCapability',
      'assessedBy',
      'assessedAt',
    ],
  },
  access: {
    create: ({ req: { user } }) => isActiveSuperAdmin(user),
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    update: ({ req: { user } }) => isActiveSuperAdmin(user),
    delete: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    {
      name: 'student',
      label: 'Student',
      type: 'relationship',
      relationTo: 'students',
      hasMany: false,
      required: true,
      index: true,
      admin: {
        description: 'Operational student record linked to this assessment.',
      },
    },
    {
      name: 'assessmentType',
      label: 'Assessment Type',
      type: 'text',
      required: true,
      defaultValue: 'initial_review',
      maxLength: 100,
      index: true,
    },
    {
      name: 'previousPerformance',
      label: 'Previous Performance',
      type: 'group',
      fields: [
        {
          name: 'summary',
          label: 'Summary',
          type: 'text',
          required: true,
          maxLength: 500,
        },
        {
          name: 'details',
          label: 'Details',
          type: 'textarea',
          required: false,
          maxLength: 5000,
        },
      ],
    },
    {
      name: 'currentCapability',
      label: 'Current Capability',
      type: 'select',
      options: [...capabilityLevels],
      required: true,
      index: true,
    },
    {
      name: 'strengths',
      label: 'Academic Strengths',
      type: 'array',
      required: false,
      fields: [
        {
          name: 'item',
          type: 'text',
          required: true,
          maxLength: 150,
          validate: validateItemRowText,
        },
      ],
    },
    {
      name: 'weaknesses',
      label: 'Academic Weaknesses',
      type: 'array',
      required: false,
      fields: [
        {
          name: 'item',
          type: 'text',
          required: true,
          maxLength: 150,
          validate: validateItemRowText,
        },
      ],
    },
    {
      name: 'adminNotes',
      label: 'Admin Notes',
      type: 'textarea',
      required: false,
      maxLength: 5000,
    },
    {
      name: 'assessedBy',
      label: 'Assessed By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
      index: true,
    },
    {
      name: 'assessedAt',
      label: 'Assessed At',
      type: 'date',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }): Promise<Record<string, unknown>> => {
        if (operation === 'create' && data.assessmentType === undefined) {
          data.assessmentType = 'initial_review'
        }
        if (typeof data.assessmentType === 'string') {
          const trimmedType = data.assessmentType.trim()
          if (trimmedType.length === 0) {
            throw new StudentWorkflowError(
              'assessmentType must be a non-empty string.',
              'assessmentType',
            )
          }
          data.assessmentType = trimmedType
        }

        if (
          data.previousPerformance &&
          typeof data.previousPerformance === 'object' &&
          !Array.isArray(data.previousPerformance)
        ) {
          const prev = data.previousPerformance as Record<string, unknown>
          if (typeof prev.summary === 'string') {
            prev.summary = prev.summary.trim()
          }
          if (typeof prev.details === 'string') {
            prev.details = prev.details.trim()
          }
        }

        if (data.strengths !== undefined) {
          data.strengths = normalizeTextItemRows(data.strengths)
        }
        if (data.weaknesses !== undefined) {
          data.weaknesses = normalizeTextItemRows(data.weaknesses)
        }

        if (typeof data.adminNotes === 'string') {
          data.adminNotes = data.adminNotes.trim()
        }

        if (operation === 'create') {
          if (!data.assessedAt) {
            data.assessedAt = new Date().toISOString()
          }
          if (data.assessedBy === undefined && req.user?.id) {
            data.assessedBy = req.user.id
          }
        }

        if (operation === 'update') {
          if (data.student !== undefined) {
            const prevStudent = extractRelationId(originalDoc?.student)
            const nextStudent = extractRelationId(data.student)
            if (prevStudent !== nextStudent) {
              throw new StudentWorkflowError(
                'Student reference on an assessment cannot be modified.',
                'student',
              )
            }
          }
          if (data.assessedBy !== undefined) {
            const prevBy = extractRelationId(originalDoc?.assessedBy)
            const nextBy = extractRelationId(data.assessedBy)
            if (prevBy !== nextBy) {
              throw new StudentWorkflowError(
                'Assessor reference on an assessment cannot be modified.',
                'assessedBy',
              )
            }
          }
        }

        return data
      },
    ],
  },
}
