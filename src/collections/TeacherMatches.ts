import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import { matchStatuses } from '@/lib/teacherMatching'

/**
 * Wellfind Academic — saved student–teacher matching decisions (`FR-E2`).
 * Append-only history of decisions; saving a match never allocates a teacher.
 * Access: active `super_admin` only.
 */
export const TeacherMatches: CollectionConfig = {
  slug: 'teacher-matches',
  admin: {
    useAsTitle: 'matchStatus',
    defaultColumns: ['student', 'teacher', 'matchStatus', 'createdAt'],
  },
  access: {
    create: ({ req: { user } }) => canWrite(user, 'allocation'),
    read: ({ req: { user } }) => canRead(user, 'allocation'),
    update: () => false,
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
    { name: 'matchStatus', type: 'select', options: [...matchStatuses], required: true, index: true },
    { name: 'criteriaSnapshot', type: 'json', required: true },
    { name: 'qualityScore', type: 'number' },
    { name: 'adminNotes', type: 'textarea', maxLength: 2000 },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', required: true },
  ],
  timestamps: true,
}
