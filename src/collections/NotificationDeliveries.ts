import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

/** FCM delivery log: one row per (notification, device). Never stores the FCM token or credentials. */
export const NotificationDeliveries: CollectionConfig = {
  slug: 'notification-deliveries',
  admin: { useAsTitle: 'status', defaultColumns: ['notification', 'device', 'status', 'attempts', 'createdAt'] },
  access: {
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    { name: 'notification', type: 'relationship', relationTo: 'notifications', required: true, index: true },
    { name: 'device', type: 'relationship', relationTo: 'user-devices', required: true, index: true },
    { name: 'status', type: 'select', options: ['sent', 'failed', 'invalid_token'], required: true, index: true },
    { name: 'attempts', type: 'number', defaultValue: 1 },
    { name: 'errorCode', type: 'text', maxLength: 100 },
    { name: 'messageId', type: 'text', maxLength: 300 },
  ],
  timestamps: true,
}
