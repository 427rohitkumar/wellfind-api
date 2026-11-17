import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import { reportShareChannels, reportShareStatuses } from '@/lib/physicalTestValidation'
import { StudentWorkflowError } from '@/collections/StudentEnquiries'

/**
 * Wellfind Academic — Optional Physical Test Report Sharing Log (`FR-B6`).
 *
 * Append-only sharing log tracking `whatsapp` and `phone_call` actions for a
 * student's physical test report. Because no external messaging provider is
 * integrated, `externalDeliveryConfirmed` and `providerIntegrated` remain
 * strictly `false`, ensuring no false delivery claims are persisted.
 *
 * Access control: Active `super_admin` create/read only; immutable append-only.
 */
export const StudentTestReportShares: CollectionConfig = {
  slug: 'student-test-report-shares',
  admin: {
    useAsTitle: 'channel',
    defaultColumns: [
      'studentTest',
      'report',
      'channel',
      'recipient',
      'status',
      'sharedBy',
      'sharedAt',
    ],
  },
  access: {
    create: ({ req: { user } }) => isActiveSuperAdmin(user),
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'studentTest',
      label: 'Student Test',
      type: 'relationship',
      relationTo: 'student-tests',
      hasMany: false,
      required: true,
      index: true,
    },
    {
      name: 'report',
      label: 'Test Report',
      type: 'relationship',
      relationTo: 'student-test-reports',
      hasMany: false,
      required: true,
      index: true,
    },
    {
      name: 'student',
      label: 'Student',
      type: 'relationship',
      relationTo: 'students',
      hasMany: false,
      required: true,
      index: true,
    },
    {
      name: 'channel',
      label: 'Share Channel',
      type: 'select',
      required: true,
      options: reportShareChannels.map((channel) => ({
        label: channel,
        value: channel,
      })),
    },
    {
      name: 'recipient',
      label: 'Recipient Phone',
      type: 'text',
      required: true,
      maxLength: 32,
    },
    {
      name: 'status',
      label: 'Recorded Share Status',
      type: 'select',
      required: true,
      defaultValue: 'recorded',
      options: reportShareStatuses.map((status) => ({
        label: status,
        value: status,
      })),
    },
    {
      name: 'externalDeliveryConfirmed',
      label: 'External Delivery Confirmed',
      type: 'checkbox',
      required: true,
      defaultValue: false,
    },
    {
      name: 'providerIntegrated',
      label: 'External Provider Integrated',
      type: 'checkbox',
      required: true,
      defaultValue: false,
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      required: false,
      maxLength: 2000,
    },
    {
      name: 'sharedBy',
      label: 'Shared By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: true,
      index: true,
    },
    {
      name: 'sharedAt',
      label: 'Shared At (UTC)',
      type: 'date',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, req }): Promise<Record<string, unknown>> => {
        if (operation === 'update') {
          throw new StudentWorkflowError(
            'Report share logs are append-only and cannot be modified.',
            'status',
          )
        }

        if (typeof data.recipient === 'string') {
          data.recipient = data.recipient.trim()
        }
        if (typeof data.notes === 'string') {
          data.notes = data.notes.trim()
        }

        // Enforce truthful non-delivery flags regardless of caller input
        data.externalDeliveryConfirmed = false
        data.providerIntegrated = false

        if (!data.sharedAt) {
          data.sharedAt = new Date().toISOString()
        }
        if (data.sharedBy === undefined && req.user?.id) {
          data.sharedBy = req.user.id
        }

        return data
      },
    ],
  },
}
