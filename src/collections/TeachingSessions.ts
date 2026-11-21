import type { CollectionConfig } from 'payload'
import { canRead, canWrite } from '@/lib/permissions'

export const sessionStatuses = ['scheduled', 'taught', 'missed', 'cancelled'] as const

/**
 * One class between a teacher and a student (an allocation): the teaching calendar.
 * Written by the teacher through /api/teacher-allocations/:id/sessions; staff can read it.
 */
export const TeachingSessions: CollectionConfig = {
  slug: 'teaching-sessions',
  admin: { useAsTitle: 'day', defaultColumns: ['allocation', 'day', 'startTime', 'status'] },
  access: {
    read: ({ req: { user } }) => canRead(user, 'allocation'),
    create: ({ req: { user } }) => canWrite(user, 'allocation'),
    update: ({ req: { user } }) => canWrite(user, 'allocation'),
    delete: ({ req: { user } }) => canWrite(user, 'allocation'),
  },
  fields: [
    { name: 'allocation', type: 'relationship', relationTo: 'teacher-allocations', required: true, index: true },
    { name: 'day', type: 'text', required: true, index: true, admin: { description: 'YYYY-MM-DD' } },
    { name: 'startTime', type: 'text', required: true, admin: { description: 'HH:MM (24h)' } },
    { name: 'endTime', type: 'text', required: true },
    { name: 'status', type: 'select', options: [...sessionStatuses], defaultValue: 'scheduled', required: true, index: true },
    { name: 'topic', type: 'text', maxLength: 200 },
    { name: 'notes', type: 'textarea', maxLength: 2000 },
  ],
  timestamps: true,
}
