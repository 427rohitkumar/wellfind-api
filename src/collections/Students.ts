import type { CollectionConfig } from 'payload'
import { canManageStudentEnquiries, StudentWorkflowError } from '@/collections/StudentEnquiries'
import {
  isValidEmail,
  isValidPhoneNumber,
  normalizePhoneNumber,
  studentStatuses,
  type StudentStatus,
} from '@/lib/studentValidation'

export { studentStatuses, type StudentStatus }

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
 * Wellfind Academic — Operational Student collection.
 *
 * Represents converted or operationally onboarded students ready for capability
 * assessment, optional physical test, matching, and teacher allocation.
 *
 * Access control: `super_admin` only for all CRUD operations.
 */
export const Students: CollectionConfig = {
  slug: 'students',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'studentClass', 'locality', 'status', 'createdAt'],
  },
  access: {
    create: ({ req: { user } }) => canManageStudentEnquiries(user),
    read: ({ req: { user } }) => canManageStudentEnquiries(user),
    update: ({ req: { user } }) => canManageStudentEnquiries(user),
    delete: ({ req: { user } }) => canManageStudentEnquiries(user),
  },
  fields: [
    {
      name: 'name',
      label: 'Student Name',
      type: 'text',
      required: true,
      maxLength: 200,
      index: true,
    },
    {
      name: 'parentName',
      label: 'Parent / Guardian Name',
      type: 'text',
      required: false,
      maxLength: 200,
    },
    {
      name: 'phoneNumber',
      label: 'Parent / Guardian Contact',
      type: 'text',
      required: true,
      maxLength: 20,
      index: true,
      validate: (value: unknown): string | true => {
        if (!isValidPhoneNumber(value)) {
          return 'Enter a valid phone number (7–15 digits, optional leading +).'
        }
        return true
      },
    },
    {
      name: 'alternatePhoneNumber',
      label: 'Alternate Contact Number',
      type: 'text',
      required: false,
      maxLength: 20,
      validate: (value: unknown): string | true => {
        if (value === undefined || value === null || value === '') {
          return true
        }
        if (!isValidPhoneNumber(value)) {
          return 'Enter a valid alternate phone number (7–15 digits, optional leading +).'
        }
        return true
      },
    },
    {
      name: 'parentEmail',
      label: 'Parent / Guardian Email',
      type: 'email',
      required: false,
      validate: (value: unknown): string | true => {
        if (value === undefined || value === null || value === '') {
          return true
        }
        if (!isValidEmail(value)) {
          return 'Enter a valid email address.'
        }
        return true
      },
    },
    {
      name: 'studentClass',
      label: 'Class',
      type: 'text',
      required: true,
      maxLength: 50,
      index: true,
    },
    {
      name: 'subjects',
      label: 'Required Subjects',
      type: 'array',
      required: true,
      minRows: 1,
      validate: (value: unknown): string | true => {
        const rows = value as { subject?: string }[] | undefined
        if (!Array.isArray(rows) || rows.length === 0) {
          return 'At least one subject is required.'
        }
        for (const row of rows) {
          const subject = (row?.subject || '').trim()
          if (subject.length === 0) {
            return 'Each subject must be a non-empty string.'
          }
          if (subject.length > 100) {
            return 'Each subject must be at most 100 characters.'
          }
        }
        return true
      },
      fields: [
        {
          name: 'subject',
          type: 'text',
          required: true,
          maxLength: 100,
        },
      ],
    },
    {
      name: 'customSubject',
      label: 'Custom Subject',
      type: 'text',
      required: false,
      maxLength: 200,
    },
    {
      name: 'locality',
      label: 'Locality',
      type: 'text',
      required: true,
      maxLength: 200,
      index: true,
    },
    {
      name: 'customLocality',
      label: 'Custom Locality',
      type: 'text',
      required: false,
      maxLength: 200,
    },
    {
      name: 'preferredTiming',
      label: 'Preferred Timing',
      type: 'text',
      required: true,
      maxLength: 100,
    },
    {
      name: 'budgetRange',
      label: 'Budget Range',
      type: 'text',
      required: false,
      maxLength: 100,
    },
    {
      name: 'learningNotes',
      label: 'Learning Requirements / Notes',
      type: 'textarea',
      required: false,
      maxLength: 5000,
    },
    {
      name: 'studentEnquiry',
      label: 'Original Student Enquiry',
      type: 'relationship',
      relationTo: 'student-enquiries',
      hasMany: false,
      unique: true,
      index: true,
      required: false,
      admin: {
        description:
          'One-to-one link to the originating student enquiry when converted.',
      },
    },
    {
      name: 'status',
      label: 'Student Status',
      type: 'select',
      options: [...studentStatuses],
      defaultValue: 'active',
      required: true,
      index: true,
    },
    {
      name: 'convertedAt',
      label: 'Converted At',
      type: 'date',
      required: false,
    },
    {
      name: 'convertedBy',
      label: 'Converted By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc }): Promise<Record<string, unknown>> => {
        const textFields = [
          'name',
          'parentName',
          'studentClass',
          'customSubject',
          'locality',
          'customLocality',
          'preferredTiming',
          'budgetRange',
          'learningNotes',
          'parentEmail',
        ]
        for (const field of textFields) {
          if (typeof data[field] === 'string') {
            data[field] = data[field].trim()
          }
        }

        if (typeof data.phoneNumber === 'string') {
          data.phoneNumber = normalizePhoneNumber(data.phoneNumber)
        }
        if (typeof data.alternatePhoneNumber === 'string') {
          data.alternatePhoneNumber = normalizePhoneNumber(
            data.alternatePhoneNumber,
          )
        }

        if (operation === 'update' && data.studentEnquiry !== undefined) {
          const prevId = extractRelationId(originalDoc?.studentEnquiry)
          const nextId = extractRelationId(data.studentEnquiry)
          if (prevId !== nextId) {
            throw new StudentWorkflowError(
              'Original studentEnquiry reference cannot be modified.',
              'studentEnquiry',
            )
          }
        }

        return data
      },
    ],
  },
}
