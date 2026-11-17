import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import {
  PHYSICAL_TEST_CURRENCY,
  PHYSICAL_TEST_FEE_INR,
  physicalTestPaymentMethods,
  physicalTestPaymentStatuses,
} from '@/lib/physicalTestValidation'
import { StudentWorkflowError } from '@/collections/StudentEnquiries'

/**
 * Wellfind Academic — Optional Physical Test Payment collection (`FR-B3`).
 *
 * Records fee payment attempts and confirmed ₹100 INR settlements for
 * physical student tests. A nullable `unique: true` `successfulPaymentKey`
 * column is populated ONLY when `paymentStatus === 'paid'`, enforcing at the
 * PostgreSQL unique-index level that at most one successful payment can exist
 * per physical test while still permitting failed/pending attempt history.
 *
 * Access control: Active `super_admin` only.
 */
export const StudentTestPayments: CollectionConfig = {
  slug: 'student-test-payments',
  admin: {
    useAsTitle: 'transactionReference',
    defaultColumns: [
      'studentTest',
      'student',
      'amount',
      'paymentMethod',
      'paymentStatus',
      'paidAt',
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
      name: 'studentTest',
      label: 'Student Test',
      type: 'relationship',
      relationTo: 'student-tests',
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
      name: 'amount',
      label: 'Amount',
      type: 'number',
      required: true,
      defaultValue: PHYSICAL_TEST_FEE_INR,
    },
    {
      name: 'currency',
      label: 'Currency',
      type: 'text',
      required: true,
      defaultValue: PHYSICAL_TEST_CURRENCY,
      maxLength: 10,
    },
    {
      name: 'paymentMethod',
      label: 'Payment Method',
      type: 'select',
      required: true,
      options: physicalTestPaymentMethods.map((method) => ({
        label: method,
        value: method,
      })),
    },
    {
      name: 'paymentStatus',
      label: 'Payment Status',
      type: 'select',
      required: true,
      index: true,
      options: physicalTestPaymentStatuses.map((status) => ({
        label: status,
        value: status,
      })),
    },
    {
      name: 'transactionReference',
      label: 'Transaction Reference',
      type: 'text',
      required: true,
      maxLength: 150,
    },
    {
      name: 'successfulPaymentKey',
      label: 'Successful Payment Lock Key',
      type: 'text',
      required: false,
      unique: true,
      admin: {
        description:
          'Populated exclusively for paid payments (`studentTestId`) to prevent concurrent duplicate payments at the PostgreSQL constraint layer.',
      },
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
      name: 'paidAt',
      label: 'Paid At (UTC)',
      type: 'date',
      required: false,
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'textarea',
      required: false,
      maxLength: 2000,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }): Promise<Record<string, unknown>> => {
        if (typeof data.transactionReference === 'string') {
          data.transactionReference = data.transactionReference.trim()
        }
        if (typeof data.currency === 'string') {
          data.currency = data.currency.trim()
        }
        if (typeof data.notes === 'string') {
          data.notes = data.notes.trim()
        }

        const effectiveAmount = data.amount !== undefined ? data.amount : originalDoc?.amount
        if (effectiveAmount !== PHYSICAL_TEST_FEE_INR) {
          throw new StudentWorkflowError(
            `Payment amount must be exactly ${PHYSICAL_TEST_FEE_INR} ${PHYSICAL_TEST_CURRENCY}.`,
            'amount',
          )
        }

        const effectiveCurrency =
          data.currency !== undefined ? data.currency : originalDoc?.currency
        if (effectiveCurrency !== PHYSICAL_TEST_CURRENCY) {
          throw new StudentWorkflowError(`Currency must be ${PHYSICAL_TEST_CURRENCY}.`, 'currency')
        }

        const effectiveStatus = String(data.paymentStatus ?? originalDoc?.paymentStatus ?? '')
        const testIdRaw =
          data.studentTest !== undefined ? data.studentTest : originalDoc?.studentTest
        const resolvedTestId =
          testIdRaw && typeof testIdRaw === 'object' && 'id' in testIdRaw
            ? (testIdRaw as { id: number | string }).id
            : testIdRaw

        if (effectiveStatus === 'paid' && resolvedTestId != null) {
          data.successfulPaymentKey = String(resolvedTestId)
          if (!data.paidAt && !originalDoc?.paidAt) {
            data.paidAt = new Date().toISOString()
          }
        } else if (operation === 'create') {
          data.successfulPaymentKey = null
        }

        if (operation === 'create' && data.recordedBy === undefined && req.user?.id) {
          data.recordedBy = req.user.id
        }

        return data
      },
    ],
  },
}
