import { canRead } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'

/**
 * Private documents uploaded by signed-in users (admin or teacher): PDFs and images.
 * Only the owner and super admins can read a file. Stored privately on Cloudinary when configured.
 * Created through `POST /api/uploads` (purpose=document), which validates type and size.
 */
const isAdmin = (user: { role?: string | null } | null | undefined) => Boolean(user && user.role === 'super_admin')

export const UserFiles: CollectionConfig = {
  slug: 'user-files',
  upload: true,
  access: {
    read: ({ req: { user } }) => {
      if (!user) return false
      if (isAdmin(user) || canRead(user, 'teachers') || canRead(user, 'teacher_inquiries')) return true
      return { owner: { equals: user.id } }
    },
    create: ({ req: { user } }) => isAdmin(user),
    update: ({ req: { user } }) => isAdmin(user),
    delete: ({ req: { user } }) => isAdmin(user),
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', required: true, index: true },
    { name: 'label', type: 'text', maxLength: 200 },
    { name: 'category', type: 'text', maxLength: 60 },
  ],
}
