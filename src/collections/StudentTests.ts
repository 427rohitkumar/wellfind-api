import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin, isBlockedOrSuspended, isTeacherRole } from '@/lib/auth'
import {
  PHYSICAL_TEST_CURRENCY,
  PHYSICAL_TEST_FEE_INR,
  physicalTestPaymentStatuses,
  physicalTestStatuses,
} from '@/lib/physicalTestValidation'
import { extractRelationId } from '@/lib/studentValidation'
import { StudentWorkflowError } from '@/collections/StudentEnquiries'

const PAID_DEPENDENT_TEST_STATUSES = new Set([
  'paid',
  'tester_assigned',
  'scheduled',
  'completed',
  'report_available',
])

/**
 * Wellfind Academic — Optional Physical Student Test collection (`FR-B2`–`FR-B5`).
 *
 * Tracks parent-opted physical tests (₹100 INR), payment verification state,
 * assigned tester (`teacher` or `super_admin`), scheduling, and report lifecycle.
 *
 * Access control:
 * - Read: Active `super_admin` sees all; active `teacher` sees ONLY tests
 *   currently assigned to them (`assignedTester == user.id`).
 * - Create/Update/Delete: Active `super_admin` only.
 */
export const StudentTests: CollectionConfig = {
  slug: 'student-tests',
  admin: {
    useAsTitle: 'testType',
    defaultColumns: [
      'student',
      'testType',
      'status',
      'paymentStatus',
      'assignedTester',
      'scheduledAt',
    ],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'students'),
    read: ({ req: { user } }) => {
      if (isActiveSuperAdmin(user)) {
        return true
      }
      if (user && !isBlockedOrSuspended(user.status) && isTeacherRole(user)) {
        return {
          assignedTester: {
            equals: user.id,
          },
        }
      }
      return false
    },
    update: ({ req: { user } }) => canWrite(user, 'students'),
    delete: ({ req: { user } }) => canWrite(user, 'students'),
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
    },
    {
      name: 'parentSelected',
      label: 'Parent Selected Physical Test',
      type: 'checkbox',
      required: true,
      defaultValue: true,
    },
    {
      name: 'testType',
      label: 'Test Type',
      type: 'text',
      required: true,
      defaultValue: 'physical_assessment',
      maxLength: 100,
    },
    {
      name: 'feeAmount',
      label: 'Fee Amount (INR)',
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
      name: 'location',
      label: 'Test Location / Address',
      type: 'text',
      required: true,
      maxLength: 250,
    },
    {
      name: 'scheduledAt',
      label: 'Scheduled At (UTC)',
      type: 'date',
      required: false,
      index: true,
    },
    {
      name: 'status',
      label: 'Test Status',
      type: 'select',
      required: true,
      defaultValue: 'payment_pending',
      index: true,
      options: physicalTestStatuses.map((status) => ({
        label: status,
        value: status,
      })),
    },
    {
      name: 'paymentStatus',
      label: 'Payment Status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: physicalTestPaymentStatuses.map((status) => ({
        label: status,
        value: status,
      })),
    },
    {
      name: 'assignedTester',
      label: 'Assigned Tester',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
      index: true,
    },
    {
      name: 'assignedBy',
      label: 'Assigned By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
    },
    {
      name: 'assignedAt',
      label: 'Assigned At (UTC)',
      type: 'date',
      required: false,
    },
    {
      name: 'assignmentHistory',
      label: 'Tester Assignment History',
      type: 'array',
      required: false,
      fields: [
        {
          name: 'tester',
          label: 'Tester User',
          type: 'relationship',
          relationTo: 'users',
          hasMany: false,
          required: true,
        },
        {
          name: 'assignedBy',
          label: 'Assigned By',
          type: 'relationship',
          relationTo: 'users',
          hasMany: false,
          required: false,
        },
        {
          name: 'assignedAt',
          label: 'Assigned At (UTC)',
          type: 'date',
          required: true,
        },
        {
          name: 'scheduledAt',
          label: 'Scheduled At (UTC)',
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
    },
    {
      name: 'completedAt',
      label: 'Completed At (UTC)',
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
    {
      name: 'createdBy',
      label: 'Created By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: false,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }): Promise<Record<string, unknown>> => {
        if (typeof data.testType === 'string') {
          data.testType = data.testType.trim()
        }
        if (typeof data.location === 'string') {
          data.location = data.location.trim()
        }
        if (typeof data.currency === 'string') {
          data.currency = data.currency.trim()
        }
        if (typeof data.notes === 'string') {
          data.notes = data.notes.trim()
        }

        const effectiveParentSelected =
          data.parentSelected !== undefined ? data.parentSelected : originalDoc?.parentSelected
        if (effectiveParentSelected !== true) {
          throw new StudentWorkflowError(
            'A skipped physical test (parentSelected: false) must not be persisted.',
            'parentSelected',
          )
        }

        const effectiveFee =
          data.feeAmount !== undefined
            ? data.feeAmount
            : (originalDoc?.feeAmount ?? PHYSICAL_TEST_FEE_INR)
        if (effectiveFee !== PHYSICAL_TEST_FEE_INR) {
          throw new StudentWorkflowError(
            `Physical test fee must be exactly ${PHYSICAL_TEST_FEE_INR} ${PHYSICAL_TEST_CURRENCY}.`,
            'feeAmount',
          )
        }

        const effectiveCurrency =
          data.currency !== undefined
            ? data.currency
            : (originalDoc?.currency ?? PHYSICAL_TEST_CURRENCY)
        if (effectiveCurrency !== PHYSICAL_TEST_CURRENCY) {
          throw new StudentWorkflowError(
            `Physical test currency must be ${PHYSICAL_TEST_CURRENCY}.`,
            'currency',
          )
        }

        if (operation === 'create') {
          const initialStatus = String(data.status ?? 'payment_pending')
          const initialPaymentStatus = String(data.paymentStatus ?? 'pending')
          if (PAID_DEPENDENT_TEST_STATUSES.has(initialStatus) || initialPaymentStatus === 'paid') {
            throw new StudentWorkflowError(
              'Physical test cannot be created directly as paid or completed without a verified payment record.',
              'paymentStatus',
            )
          }
          if (data.createdBy === undefined && req.user?.id) {
            data.createdBy = req.user.id
          }
          return data
        }

        if (operation === 'update') {
          if (data.student !== undefined) {
            const prevStudent = extractRelationId(originalDoc?.student)
            const nextStudent = extractRelationId(data.student)
            if (prevStudent !== nextStudent) {
              throw new StudentWorkflowError(
                'Student reference on a physical test cannot be modified.',
                'student',
              )
            }
          }

          const nextStatus = String(data.status ?? originalDoc?.status ?? '')
          const nextPaymentStatus = String(data.paymentStatus ?? originalDoc?.paymentStatus ?? '')

          if (PAID_DEPENDENT_TEST_STATUSES.has(nextStatus) || nextPaymentStatus === 'paid') {
            if (nextPaymentStatus !== 'paid') {
              throw new StudentWorkflowError(
                'Physical test cannot advance beyond payment_pending without paymentStatus === "paid".',
                'paymentStatus',
              )
            }

            if (originalDoc?.id) {
              const verifiedPayments = await req.payload.find({
                collection: 'student-test-payments',
                where: {
                  and: [
                    { studentTest: { equals: originalDoc.id } },
                    { paymentStatus: { equals: 'paid' } },
                    { amount: { equals: PHYSICAL_TEST_FEE_INR } },
                    { currency: { equals: PHYSICAL_TEST_CURRENCY } },
                  ],
                },
                limit: 1,
                depth: 0,
                overrideAccess: true,
                req,
              })

              if (verifiedPayments.totalDocs === 0) {
                throw new StudentWorkflowError(
                  'Cannot mark physical test as paid without a valid persisted ₹100 payment record.',
                  'paymentStatus',
                )
              }
            }
          }

          if (
            nextStatus === 'tester_assigned' ||
            nextStatus === 'scheduled' ||
            nextStatus === 'completed' ||
            nextStatus === 'report_available'
          ) {
            const effectiveTesterId = extractRelationId(
              data.assignedTester !== undefined ? data.assignedTester : originalDoc?.assignedTester,
            )
            if (!effectiveTesterId) {
              throw new StudentWorkflowError(
                'An assigned tester is required before advancing test status.',
                'assignedTester',
              )
            }
          }

          if (nextStatus === 'report_available' && originalDoc?.id) {
            const verifiedReports = await req.payload.find({
              collection: 'student-test-reports',
              where: {
                studentTest: { equals: originalDoc.id },
              },
              limit: 1,
              depth: 0,
              overrideAccess: true,
              req,
            })
            if (verifiedReports.totalDocs === 0) {
              throw new StudentWorkflowError(
                'Cannot mark test report_available without a persisted test report record.',
                'status',
              )
            }
          }
        }

        return data
      },
    ],
  },
}
