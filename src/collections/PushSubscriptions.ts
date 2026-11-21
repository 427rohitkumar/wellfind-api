import type { CollectionConfig } from 'payload'
import { isActiveSuperAdmin } from '@/lib/auth'

/** One row per browser that agreed to receive push notifications. Written only through /api/push/*. */
export const PushSubscriptions: CollectionConfig = {
  slug: 'push-subscriptions',
  admin: { useAsTitle: 'endpoint', defaultColumns: ['user', 'userAgent', 'createdAt'] },
  access: {
    read: ({ req: { user } }) => isActiveSuperAdmin(user),
    create: () => false,
    update: () => false,
    delete: ({ req: { user } }) => isActiveSuperAdmin(user),
  },
  fields: [
    { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'endpoint', type: 'text', required: true, unique: true, index: true },
    { name: 'p256dh', type: 'text', required: true },
    { name: 'auth', type: 'text', required: true },
    { name: 'userAgent', type: 'text', maxLength: 300 },
  ],
  timestamps: true,
}
