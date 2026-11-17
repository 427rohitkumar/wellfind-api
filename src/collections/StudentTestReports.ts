import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin, isBlockedOrSuspended, isTeacherRole } from '@/lib/auth'
import { capabilityLevels, extractRelationId } from '@/lib/studentValidation'
import { StudentWorkflowError } from '@/collections/StudentEnquiries'

/**
 * Wellfind Academic — Optional Physical Test Report collection (`FR-B5`, `FR-B6`).
 *
 * Stores exactly one report per `studentTest` (`unique: true` foreign key)
 * containing total marks, marks obtained, per-subject breakdown, capability
 * classification, and tester/admin remarks.
 *
 * Access control:
 * - Read: Active `super_admin` sees all; active `teacher` sees ONLY reports for
 *   physical tests currently assigned to them (`assignedTester == user.id`).
 * - Create/Update/Delete: Active `super_admin` only directly; assigned testers
 *   submit through the validated custom endpoint (`POST /api/student-tests/:testId/report`).
 */
export const StudentTestReports: CollectionConfig = {
  slug: 'student-test-reports',
  admin: {
    useAsTitle: 'capability',
    defaultColumns: [
      'studentTest',
      'student',
      'marksObtained',
      'totalMarks',
      'capability',
      'submittedBy',
      'submittedAt',
    ],
  },
  access: {
    create: ({ req: { user } }) => isActiveSuperAdmin(user),
    read: async ({ req }) => {
      const user = req.user
      if (isActiveSuperAdmin(user)) {
        return true
      }
      if (user && !isBlockedOrSuspended(user.status) && isTeacherRole(user)) {
        const assignedTests = await req.payload.find({
          collection: 'student-tests',
          where: {
            assignedTester: { equals: user.id },
          },
          limit: 1000,
          depth: 0,
          overrideAccess: true,
          req,
        })
        const testIds = assignedTests.docs.map((doc) => doc.id)
        if (testIds.length === 0) {
          return false
        }
        return {
          studentTest: {
            in: testIds,
          },
        }
      }
      return false
    },
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
      unique: true,
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
      name: 'marksObtained',
      label: 'Marks Obtained',
      type: 'number',
      required: true,
    },
    {
      name: 'totalMarks',
      label: 'Total Marks',
      type: 'number',
      required: true,
    },
    {
      name: 'capability',
      label: 'Capability Level',
      type: 'select',
      required: true,
      options: capabilityLevels.map((level) => ({
        label: level.charAt(0).toUpperCase() + level.slice(1),
        value: level,
      })),
    },
    {
      name: 'subjectResults',
      label: 'Subject Results',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'subject',
          label: 'Subject',
          type: 'text',
          required: true,
          maxLength: 100,
        },
        {
          name: 'marksObtained',
          label: 'Marks Obtained',
          type: 'number',
          required: true,
        },
        {
          name: 'totalMarks',
          label: 'Total Marks',
          type: 'number',
          required: true,
        },
      ],
    },
    {
      name: 'remarks',
      label: 'Remarks',
      type: 'textarea',
      required: false,
      maxLength: 5000,
    },
    {
      name: 'submittedBy',
      label: 'Submitted By',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      required: true,
      index: true,
    },
    {
      name: 'submittedAt',
      label: 'Submitted At (UTC)',
      type: 'date',
      required: true,
      index: true,
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }): Promise<Record<string, unknown>> => {
        if (typeof data.remarks === 'string') {
          data.remarks = data.remarks.trim()
        }

        const totalMarks = data.totalMarks !== undefined ? data.totalMarks : originalDoc?.totalMarks
        const marksObtained =
          data.marksObtained !== undefined ? data.marksObtained : originalDoc?.marksObtained

        if (typeof totalMarks !== 'number' || !Number.isFinite(totalMarks) || totalMarks <= 0) {
          throw new StudentWorkflowError(
            'totalMarks must be a finite number greater than 0.',
            'totalMarks',
          )
        }
        if (
          typeof marksObtained !== 'number' ||
          !Number.isFinite(marksObtained) ||
          marksObtained < 0 ||
          marksObtained > totalMarks
        ) {
          throw new StudentWorkflowError(
            'marksObtained must be between 0 and totalMarks.',
            'marksObtained',
          )
        }

        const subjectResults =
          data.subjectResults !== undefined ? data.subjectResults : originalDoc?.subjectResults
        if (!Array.isArray(subjectResults) || subjectResults.length === 0) {
          throw new StudentWorkflowError(
            'subjectResults must contain at least one subject result.',
            'subjectResults',
          )
        }

        data.subjectResults = subjectResults.map((row: unknown, idx: number) => {
          if (!row || typeof row !== 'object') {
            throw new StudentWorkflowError('Invalid subjectResults entry.', `subjectResults.${idx}`)
          }
          const entry = row as Record<string, unknown>
          const subject = typeof entry.subject === 'string' ? entry.subject.trim() : ''
          const subTotal = entry.totalMarks
          const subObtained = entry.marksObtained
          if (!subject) {
            throw new StudentWorkflowError(
              'Subject name is required.',
              `subjectResults.${idx}.subject`,
            )
          }
          if (typeof subTotal !== 'number' || !Number.isFinite(subTotal) || subTotal <= 0) {
            throw new StudentWorkflowError(
              'Subject totalMarks must be greater than 0.',
              `subjectResults.${idx}.totalMarks`,
            )
          }
          if (
            typeof subObtained !== 'number' ||
            !Number.isFinite(subObtained) ||
            subObtained < 0 ||
            subObtained > subTotal
          ) {
            throw new StudentWorkflowError(
              'Subject marksObtained must be between 0 and subject totalMarks.',
              `subjectResults.${idx}.marksObtained`,
            )
          }
          return {
            ...entry,
            subject,
          }
        })

        if (operation === 'create') {
          const targetTestId = extractRelationId(data.studentTest)
          if (targetTestId === null) {
            throw new StudentWorkflowError(
              'studentTest is required to submit a test report.',
              'studentTest',
            )
          }

          const parentTest = await req.payload.findByID({
            collection: 'student-tests',
            id: targetTestId,
            depth: 0,
            overrideAccess: true,
            req,
          })

          if (parentTest.paymentStatus !== 'paid') {
            throw new StudentWorkflowError(
              'Physical test payment must be completed before submitting a report.',
              'studentTest',
            )
          }

          if (!extractRelationId(parentTest.assignedTester)) {
            throw new StudentWorkflowError(
              'An assigned tester is required before submitting a physical test report.',
              'studentTest',
            )
          }

          if (!data.submittedAt) {
            data.submittedAt = new Date().toISOString()
          }
          if (data.submittedBy === undefined && req.user?.id) {
            data.submittedBy = req.user.id
          }
        }

        if (operation === 'update') {
          const prevTest = extractRelationId(originalDoc?.studentTest)
          const nextTest = extractRelationId(
            data.studentTest !== undefined ? data.studentTest : originalDoc?.studentTest,
          )
          if (prevTest !== nextTest) {
            throw new StudentWorkflowError(
              'studentTest reference on a test report cannot be modified.',
              'studentTest',
            )
          }
        }

        return data
      },
    ],
  },
}
