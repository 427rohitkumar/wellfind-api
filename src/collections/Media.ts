import type { CollectionConfig } from 'payload'

/**
 * Public images (profile photos). Files live on Cloudinary when it is configured (see lib/cloudinaryAdapter).
 * Uploads come through `POST /api/uploads` (any signed-in user); direct REST writes are limited to super admins.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    read: () => true,
    create: ({ req: { user } }) => Boolean(user && user.role === 'super_admin'),
    update: ({ req: { user } }) => Boolean(user && user.role === 'super_admin'),
    delete: ({ req: { user } }) => Boolean(user && user.role === 'super_admin'),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    { name: 'kind', type: 'select', options: ['avatar', 'other'], defaultValue: 'other' },
    { name: 'owner', type: 'relationship', relationTo: 'users' },
  ],
  upload: true,
}
