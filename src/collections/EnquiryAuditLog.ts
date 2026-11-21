import { canRead } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'

/**
 * Wellfind Academic — Enquiry Audit Log collection.
 *
 * Append-only audit trail for status changes on student-enquiries and
 * teacher-enquiries. Every row records a single status transition: the
 * previous status, the new status, who changed it, when, and why.
 *
 * Access control:
 * - Create: blocked for all REST callers. Entries are written only by
 *   server-side hooks (with overrideAccess) when a status actually changes.
 * - Read: super_admin only.
 * - Update/Delete: blocked for all — audit entries are immutable.
 *
 * Public users can never create, read, update, or delete audit entries.
 * Client-supplied changedBy is never trusted — the actor is always taken
 * from the authenticated server-side request context (req.user).
 */

export const canReadEnquiryAuditLog = (
  user: { role?: string | null } | null | undefined,
): boolean => canRead(user as { role?: string | null }, 'student_inquiries') || canRead(user as { role?: string | null }, 'teacher_inquiries')

export const EnquiryAuditLog: CollectionConfig = {
  slug: 'enquiry-audit-log',
  admin: {
    useAsTitle: 'changedAt',
    defaultColumns: [
      'enquiryType',
      'fieldChanged',
      'previousStatus',
      'newStatus',
      'changedBy',
      'changedAt',
    ],
  },
  access: {
    // Server-side hook writes only — never public REST API.
    create: () => false,
    read: ({ req: { user } }) => canReadEnquiryAuditLog(user),
    // Immutable — audit entries cannot be modified or deleted.
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'enquiryType',
      label: 'Enquiry Type',
      type: 'select',
      options: ['student', 'teacher'],
      required: true,
      index: true,
      admin: {
        description: 'Type of enquiry the status change applies to.',
      },
    },
    {
      name: 'studentEnquiry',
      label: 'Student Enquiry',
      type: 'relationship',
      relationTo: 'student-enquiries',
      hasMany: false,
      index: true,
      admin: {
        description: 'Related student enquiry (set when enquiryType is student).',
        condition: (_, data) => data?.enquiryType === 'student',
      },
    },
    {
      name: 'teacherEnquiry',
      label: 'Teacher Enquiry',
      type: 'relationship',
      relationTo: 'teacher-enquiries',
      hasMany: false,
      index: true,
      admin: {
        description: 'Related teacher enquiry (set when enquiryType is teacher).',
        condition: (_, data) => data?.enquiryType === 'teacher',
      },
    },
    {
      name: 'fieldChanged',
      label: 'Field Changed',
      type: 'select',
      options: ['enquiryStatus', 'applicationStatus', 'evaluation'],
      required: true,
      admin: {
        description: 'Which status or evaluation field was changed.',
      },
    },
    {
      name: 'previousStatus',
      label: 'Previous Status',
      type: 'text',
      admin: {
        description: 'Status before the change. Null for initial assignment.',
      },
    },
    {
      name: 'newStatus',
      label: 'New Status',
      type: 'text',
      required: true,
      admin: {
        description: 'Status after the change.',
      },
    },
    {
      name: 'changedBy',
      label: 'Changed By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      admin: {
        description: 'Authenticated super_admin who made the change.',
      },
    },
    {
      name: 'changedAt',
      label: 'Changed At',
      type: 'date',
      index: true,
      admin: {
        description: 'Server-generated timestamp of the change.',
      },
    },
    {
      name: 'changeReason',
      label: 'Change Reason',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        description:
          'Reason for the status change. Established as a field in Phase 1; made mandatory in Phase 2.',
      },
    },
  ],
  timestamps: true,
}
