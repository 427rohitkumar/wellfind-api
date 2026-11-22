import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'
import { NOTIFICATION_ENVIRONMENTS } from '@/lib/notificationConfig'

/** One row per app install that can receive FCM pushes. Written only through /api/notifications/devices/*. */
export const UserDevices: CollectionConfig = {
  slug: 'user-devices',
  admin: { useAsTitle: 'platform', defaultColumns: ['user', 'platform', 'environment', 'active', 'lastSeen'] },
  hooks: {
    beforeDelete: [
      async ({ id, req }) => {
        await (req.payload as any).delete({ collection: 'notification-deliveries', where: { device: { equals: id } }, overrideAccess: true, req })
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
    { name: 'fcmToken', type: 'text', required: true, unique: true, index: true },
    { name: 'platform', type: 'select', options: ['android', 'ios'], required: true, defaultValue: 'android' },
    { name: 'environment', type: 'select', options: [...NOTIFICATION_ENVIRONMENTS], required: true, index: true },
    { name: 'active', type: 'checkbox', defaultValue: true, index: true },
    { name: 'lastSeen', type: 'date' },
    { name: 'appVersion', type: 'text', maxLength: 40 },
    { name: 'deviceName', type: 'text', maxLength: 120 },
  ],
  timestamps: true,
}
