import type { CollectionConfig } from 'payload'
import { canRead, canWrite } from '@/lib/permissions'

export const workKinds = ['assignment', 'test'] as const
export const workStatuses = ['assigned', 'submitted', 'graded', 'missed'] as const
export const testPeriods = ['weekly', 'monthly', 'other'] as const

/** Assignments and class tests a teacher gives to an allocated student, with marks and feedback. */
export const AllocationWork: CollectionConfig = {
  slug: 'allocation-work',
  admin: { useAsTitle: 'title', defaultColumns: ['allocation', 'kind', 'title', 'status', 'dueDate'] },
  access: {
    read: ({ req: { user } }) => canRead(user, 'allocation'),
    create: ({ req: { user } }) => canWrite(user, 'allocation'),
    update: ({ req: { user } }) => canWrite(user, 'allocation'),
    delete: ({ req: { user } }) => canWrite(user, 'allocation'),
  },
  fields: [
    { name: 'allocation', type: 'relationship', relationTo: 'teacher-allocations', required: true, index: true },
    { name: 'kind', type: 'select', options: [...workKinds], defaultValue: 'assignment', required: true },
    { name: 'period', type: 'select', options: [...testPeriods], index: true, admin: { description: 'For tests: weekly, monthly or other.' } },
    { name: 'title', type: 'text', required: true, maxLength: 200 },
    { name: 'description', type: 'textarea', maxLength: 3000 },
    { name: 'dueDate', type: 'text', admin: { description: 'YYYY-MM-DD. For tests, the test date.' } },
    { name: 'status', type: 'select', options: [...workStatuses], defaultValue: 'assigned', required: true, index: true },
    { name: 'marks', type: 'number', min: 0 },
    { name: 'maxMarks', type: 'number', min: 1 },
    { name: 'feedback', type: 'textarea', maxLength: 2000 },
    { name: 'submittedAt', type: 'date' },
    { name: 'gradedAt', type: 'date' },
  ],
  timestamps: true,
}
