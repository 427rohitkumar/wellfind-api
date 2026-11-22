import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

/**
 * Data-deletion requests.
 * - source "web": submitted on the public page (students, parents, teachers without the app). A super admin processes it.
 * - source "app": a signed-in user deleted their own account; kept only as an audit trail (no contact details).
 * Contact details are scrubbed once a request is completed or rejected.
 */
export const DataDeletionRequests: CollectionConfig = {
  slug: 'data-deletion-requests',
  admin: { useAsTitle: 'status', defaultColumns: ['source', 'requesterType', 'status', 'createdAt'] },
  access: {
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    create: () => false, // only through the API routes
    update: ({ req: { user } }) => isActiveSuperAdmin(user),
    delete: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    { name: 'source', type: 'select', options: ['web', 'app'], required: true, defaultValue: 'web', index: true },
    {
      name: 'requesterType',
      type: 'select',
      options: ['student_parent', 'teacher', 'staff', 'other'],
      required: true,
      defaultValue: 'other',
    },
    {
      name: 'status',
      type: 'select',
      options: ['pending', 'completed', 'rejected', 'failed'],
      required: true,
      defaultValue: 'pending',
      index: true,
    },
    { name: 'fullName', type: 'text', maxLength: 120 },
    { name: 'email', type: 'text', maxLength: 200 },
    { name: 'phone', type: 'text', maxLength: 30 },
    { name: 'message', type: 'textarea', maxLength: 1000 },
    { name: 'resultSummary', type: 'json', admin: { description: 'Counts of records anonymised or removed.' } },
    { name: 'processedBy', type: 'relationship', relationTo: 'users' },
    { name: 'processedAt', type: 'date' },
    { name: 'rejectionReason', type: 'text', maxLength: 300 },
  ],
}
