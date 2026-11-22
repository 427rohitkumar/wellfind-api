import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

/**
 * In-app notification history (the mobile Notification Center). One row per recipient.
 * Written only by services/notificationService.ts; users read/mark/delete their own through /api/notifications.
 */
export const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: { useAsTitle: 'title', defaultColumns: ['user', 'type', 'title', 'readAt', 'createdAt'] },
  hooks: {
    // Delivery logs point at the notification (NOT NULL FK): remove them first.
    beforeDelete: [
      async ({ id, req }) => {
        await (req.payload as any).delete({ collection: 'notification-deliveries', where: { notification: { equals: id } }, overrideAccess: true, req })
      },
    ],
  },
  access: {
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'type', type: 'text', required: true, maxLength: 60, index: true },
    { name: 'title', type: 'text', required: true, maxLength: 160 },
    { name: 'body', type: 'text', required: true, maxLength: 500 },
    { name: 'entityType', type: 'text', maxLength: 60 },
    { name: 'entityId', type: 'text', maxLength: 60 },
    { name: 'screen', type: 'text', maxLength: 200 },
    { name: 'readAt', type: 'date' },
    // `${userId}:${business key}`: the same business event can never notify a user twice.
    { name: 'dedupeKey', type: 'text', unique: true, index: true, maxLength: 200 },
  ],
  timestamps: true,
}
