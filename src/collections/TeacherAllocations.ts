import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import { allocationStatuses } from '@/lib/teacherAllocation'

/**
 * Wellfind Academic — final student→teacher allocations (`FR-F1`, `FR-F2`).
 * `activeKey` is populated only while the allocation is assigned/accepted/active and
 * is unique, so PostgreSQL itself prevents duplicate live allocations under concurrency.
 * Access via REST goes through custom routes; direct collection access is admin only.
 */
export const TeacherAllocations: CollectionConfig = {
  slug: 'teacher-allocations',
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['student', 'teacher', 'subject', 'status', 'allocatedAt'],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'allocation'),
    read: ({ req: { user } }) => canRead(user, 'allocation'),
    update: ({ req: { user } }) => canWrite(user, 'allocation'),
    delete: ({ req: { user } }) => canWrite(user, 'allocation'),
  },
  fields: [
    { name: 'student', type: 'relationship', relationTo: 'students', required: true, index: true },
    {
      name: 'teacher',
      type: 'relationship',
      relationTo: 'teacher-profiles',
      required: true,
      index: true,
    },
    { name: 'subject', type: 'text', required: true, maxLength: 100 },
    {
      name: 'status',
      type: 'select',
      options: [...allocationStatuses],
      defaultValue: 'assigned',
      required: true,
      index: true,
    },
    { name: 'allocationNotes', type: 'textarea', maxLength: 2000 },
    {
      name: 'timetable',
      type: 'array',
      admin: { description: 'Weekly teaching slots set by the teacher.' },
      fields: [
        { name: 'day', type: 'select', options: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], required: true },
        { name: 'startTime', type: 'text', required: true },
        { name: 'endTime', type: 'text', required: true },
      ],
    },
    // Commercial terms. `commissionAmount` and `teacherPayout` are derived server-side
    // from `monthlyFee` and `commissionPercent`.
    {
      name: 'monthlyFee',
      type: 'number',
      min: 0,
      admin: { description: 'Monthly tuition fee the student/parent pays (INR).' },
    },
    {
      name: 'commissionPercent',
      type: 'number',
      min: 0,
      max: 100,
      admin: { description: 'Wellfind commission as a percentage of the monthly fee.' },
    },
    { name: 'commissionAmount', type: 'number', admin: { readOnly: true } },
    { name: 'teacherPayout', type: 'number', admin: { readOnly: true } },
    { name: 'allocatedBy', type: 'relationship', relationTo: 'users', required: true },
    { name: 'allocatedAt', type: 'date', required: true },
    {
      name: 'activeKey',
      type: 'text',
      unique: true,
      index: true,
      admin: { hidden: true, description: 'Set only while the allocation is live.' },
    },
    {
      name: 'statusHistory',
      type: 'array',
      fields: [
        { name: 'fromStatus', type: 'text' },
        { name: 'toStatus', type: 'text', required: true },
        { name: 'reason', type: 'textarea', maxLength: 2000 },
        { name: 'changedBy', type: 'relationship', relationTo: 'users' },
        { name: 'changedAt', type: 'date' },
      ],
    },
  ],
  timestamps: true,
}
