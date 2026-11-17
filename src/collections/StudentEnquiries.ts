import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'
import { isSuperAdminRole } from '@/lib/auth'
import {
  CONVERTIBLE_ENQUIRY_STATUSES,
  enquirySources,
  enquiryStatuses,
  isValidEnquirySource,
  isValidPhoneNumber,
  normalizePhoneNumber,
  type EnquirySource,
  type EnquiryStatus,
} from '@/lib/studentValidation'

export {
  CONVERTIBLE_ENQUIRY_STATUSES,
  enquirySources,
  enquiryStatuses,
  isValidEnquirySource,
  isValidPhoneNumber,
  normalizePhoneNumber,
  type EnquirySource,
  type EnquiryStatus,
}

export class StudentWorkflowError extends ValidationError {
  constructor(message: string, path: string) {
    super({ errors: [{ message, path }] })
    this.message = message
  }
}

/**
 * Wellfind Academic — Student Enquiry collection.
 *
 * Stores enquiries submitted by prospective students/parents through the public
 * enrolment form or recorded manually by administrators, plus internal management
 * fields used by administrators.
 *
 * Access control:
 * - Create: open to unauthenticated visitors (public enquiry submission).
 * - Read/Update/Delete: `super_admin` only — enforced by collection access control,
 *   so public callers can never list, read, update, or delete enquiries.
 * - Internal fields (`enquiryStatus`, `adminNotes`, `assignedTo`, `changeReason`)
 *   are never writable by public submissions: they are stripped by the public
 *   submission route and protected by field-level access control as defense in depth.
 */

/**
 * Valid state transitions for Student Enquiries (standard admin workflow).
 * - new -> contacted | closed
 * - contacted -> in_progress | closed
 * - in_progress -> converted | closed
 * - converted -> allocated | closed
 * - closed -> contacted | in_progress (reopening)
 * - allocated is terminal.
 *
 * Explicit conversion via POST /api/student-enquiries/:id/convert may also
 * transition `new` and `contacted` (in addition to `in_progress`) directly to
 * `converted` using `req.context.isStudentConversion = true`.
 */
export const VALID_STUDENT_STATUS_TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  new: ['contacted', 'closed'],
  contacted: ['in_progress', 'closed'],
  in_progress: ['converted', 'closed'],
  converted: ['allocated', 'closed'],
  closed: ['contacted', 'in_progress'],
  allocated: [],
}

/**
 * Status transitions that strictly require a non-empty change reason.
 * 1. Any transition to 'closed'
 * 2. Reopening from 'closed' (to 'contacted' or 'in_progress')
 */
export function isStudentReasonRequired(from: EnquiryStatus, to: EnquiryStatus): boolean {
  if (to === 'closed') {
    return true
  }
  if (from === 'closed' && (to === 'contacted' || to === 'in_progress')) {
    return true
  }
  return false
}

/**
 * Returns true if the user may manage student enquiries.
 * Only `super_admin` users may list, read, update, or delete enquiries.
 * Client-supplied roles or IDs are never trusted — this is checked server-side
 * against the authenticated user's record.
 */
export function canManageStudentEnquiries(
  user: { role?: string | null } | null | undefined,
): boolean {
  return isSuperAdminRole(user)
}

export const StudentEnquiries: CollectionConfig = {
  slug: 'student-enquiries',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'phoneNumber', 'studentClass', 'enquiryStatus', 'createdAt'],
  },
  access: {
    // Public enquiry submission — unauthenticated visitors may create enquiries.
    create: () => true,
    read: ({ req: { user } }) => canManageStudentEnquiries(user),
    update: ({ req: { user } }) => canManageStudentEnquiries(user),
    delete: ({ req: { user } }) => canManageStudentEnquiries(user),
  },
  fields: [
    // --- Public form fields (maps to TutorEnquiryFormData) ---
    {
      name: 'studentClass',
      label: 'Class',
      type: 'text',
      required: true,
      maxLength: 50,
      admin: {
        description: "Student's class or year group (e.g. UKG, Class 10).",
      },
    },
    {
      name: 'subjects',
      label: 'Subjects',
      type: 'array',
      required: true,
      minRows: 1,
      admin: {
        description: 'Subjects the student needs tutoring in.',
      },
      validate: (value: unknown): string | true => {
        const rows = value as { subject?: string }[] | undefined
        if (!Array.isArray(rows) || rows.length === 0) {
          return 'At least one subject is required.'
        }
        for (const row of rows) {
          const subject = (row.subject || '').trim()
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
      label: 'Custom subject',
      type: 'text',
      maxLength: 200,
      admin: {
        description: 'Subject name when it is not in the standard list.',
      },
    },
    {
      name: 'preferredTiming',
      label: 'Preferred timing',
      type: 'text',
      required: true,
      maxLength: 100,
      admin: {
        description: 'Preferred class timing (e.g. weekday evenings).',
      },
    },
    {
      name: 'locality',
      label: 'Locality',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: "Student's locality or area.",
      },
    },
    {
      name: 'customLocality',
      label: 'Custom locality',
      type: 'text',
      maxLength: 200,
      admin: {
        description: 'Locality name when it is not in the standard list.',
      },
    },
    {
      name: 'budgetRange',
      label: 'Budget range',
      type: 'text',
      required: true,
      maxLength: 100,
      admin: {
        description: 'Tuition budget range.',
      },
    },
    {
      name: 'name',
      label: 'Name',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'phoneNumber',
      label: 'Phone number',
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
      admin: {
        description: 'Contact phone number. Country code is optional.',
      },
    },
    {
      name: 'enquirySource',
      label: 'Enquiry source',
      type: 'select',
      options: [...enquirySources],
      defaultValue: 'website',
      required: false,
      index: true,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description: 'Originating channel of the enquiry (defaults to website).',
      },
    },
    {
      name: 'additionalNotes',
      label: 'Additional notes',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        description: 'Optional additional notes from the enquirer.',
      },
    },
    {
      name: 'agreedToPolicy',
      label: 'Agreed to policy',
      type: 'checkbox',
      required: true,
      validate: (value: unknown): string | true =>
        value === true ||
        'You must agree to the policy to submit an enquiry.',
      admin: {
        description: 'Must be true to submit the enquiry.',
      },
    },
    // --- Internal management fields (admin only) ---
    {
      name: 'markAsRead',
      label: 'Mark as read',
      type: 'checkbox',
      defaultValue: false,
      required: false,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description:
          'Indicates whether this enquiry has been opened and read by an administrator.',
      },
    },
    {
      name: 'enquiryStatus',
      label: 'Enquiry status',
      type: 'select',
      options: [...enquiryStatuses],
      defaultValue: 'new',
      required: false,
      index: true,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description:
          'Internal enquiry status. Public submissions cannot set this field.',
      },
    },
    {
      name: 'adminNotes',
      label: 'Admin notes',
      type: 'textarea',
      maxLength: 5000,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description:
          'Internal admin notes. Public submissions cannot write this field.',
      },
    },
    {
      name: 'assignedTo',
      label: 'Assigned to',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description: 'Internal staff member assigned to handle this enquiry.',
      },
    },
    {
      name: 'changeReason',
      label: 'Change reason',
      type: 'textarea',
      maxLength: 2000,
      access: {
        create: ({ req: { user } }) => canManageStudentEnquiries(user),
        update: ({ req: { user } }) => canManageStudentEnquiries(user),
      },
      admin: {
        description:
          'Mandatory reason when closing or reopening an enquiry. Forwarded to the audit log and reset.',
      },
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }: any): Promise<Record<string, unknown>> => {
        // Defense in depth: public submissions must never write internal
        // management fields, regardless of the entry point (REST route or
        // local API). Phone numbers are normalized on every write so the
        // stored data is always sanitized.
        if (
          operation === 'create' &&
          !canManageStudentEnquiries((req as any)?.user)
        ) {
          delete data.enquiryStatus
          delete data.adminNotes
          delete data.assignedTo
          delete data.changeReason
          delete data.markAsRead
          if ((req as any)?.payloadAPI === 'REST') {
            data.enquirySource = 'website'
          }
        }

        if (
          (operation === 'create' || operation === 'update') &&
          typeof data.phoneNumber === 'string'
        ) {
          data.phoneNumber = normalizePhoneNumber(data.phoneNumber)
        }

        // Validate status transition and mandatory reason on update
        if (operation === 'update' && typeof data.enquiryStatus === 'string') {
          const currentStatus = (originalDoc?.enquiryStatus || 'new') as EnquiryStatus
          const targetStatus = data.enquiryStatus as EnquiryStatus

          if (!enquiryStatuses.includes(targetStatus)) {
            throw new StudentWorkflowError(
              `Invalid enquiry status '${targetStatus}'.`,
              'enquiryStatus',
            )
          }

          if (targetStatus !== currentStatus) {
            const allowedTransitions = VALID_STUDENT_STATUS_TRANSITIONS[currentStatus] || []
            const isExplicitConversion =
              targetStatus === 'converted' &&
              req?.context?.isStudentConversion === true &&
              CONVERTIBLE_ENQUIRY_STATUSES.includes(currentStatus)

            if (!allowedTransitions.includes(targetStatus) && !isExplicitConversion) {
              throw new StudentWorkflowError(
                `Invalid status transition from '${currentStatus}' to '${targetStatus}'.`,
                'enquiryStatus',
              )
            }

            const reasonRaw = typeof data.changeReason === 'string' ? data.changeReason : (req?.context?.changeReason as string | undefined)
            const trimmedReason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''

            if (isStudentReasonRequired(currentStatus, targetStatus) && trimmedReason.length === 0) {
              throw new StudentWorkflowError(
                `A non-empty change reason is mandatory when transitioning status from '${currentStatus}' to '${targetStatus}'.`,
                'changeReason',
              )
            }

            // Stash sanitized reason in req.context for afterChange audit logger
            if (!req.context) {
              req.context = {}
            }
            req.context.studentChangeReason = trimmedReason.length > 0 ? trimmedReason : null
          }
        }

        // Keep changeReason from persisting stale data
        delete data.changeReason

        return data
      },
    ],
    afterChange: [
      async ({ operation, previousDoc, originalDoc, doc, req }: any) => {
        const prevDoc = previousDoc || originalDoc
        // Only log updates, not creates (initial default status is not an admin change)
        if (operation === 'create' || operation !== 'update') {
          return
        }

        const previousStatus = (prevDoc?.enquiryStatus || 'new') as string | undefined
        const newStatus = doc.enquiryStatus as string | undefined

        // Only log when status actually changes — prevents duplicate entries
        if (previousStatus === newStatus) {
          return
        }

        const reason = req?.context?.studentChangeReason ?? null
        // Clear context stash once consumed to prevent any accidental leakage
        if (req?.context) {
          delete req.context.studentChangeReason
        }

        // Create audit log entry via server-side local API
        await req.payload.create({
          collection: 'enquiry-audit-log',
          data: {
            enquiryType: 'student',
            studentEnquiry: doc.id,
            fieldChanged: 'enquiryStatus',
            previousStatus: previousStatus ?? null,
            newStatus,
            changedBy: req.user?.id ?? null,
            changedAt: new Date(),
            changeReason: reason,
          },
          overrideAccess: true,
          req,
        })
      },
    ],
  },
}
