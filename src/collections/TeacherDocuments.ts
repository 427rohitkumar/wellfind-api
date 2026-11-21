import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'

/**
 * Wellfind Academic — Teacher Documents collection.
 *
 * Dedicated, private upload collection for teacher KYC and qualification
 * documents (Aadhaar, certificates). It is intentionally separate from the
 * public `Media` collection so that KYC files are never publicly accessible
 * merely because Media allows public reads.
 *
 * Access control:
 * - All operations are restricted to `super_admin`. Public teacher applications
 *   upload documents through the server-side `POST /api/teacher-enquiries`
 *   route, which uses Payload's local API (bypassing REST access control) and
 *   always links the document to an enquiry. No orphan public uploads are
 *   permitted.
 * - File downloads (`/api/teacher-documents/:filename`) are governed by this
 *   collection's `read` rule, so only `super_admin` can retrieve documents.
 */

export const canManageTeacherDocuments = (
  user: { role?: string | null } | null | undefined,
): boolean => canWrite(user as { role?: string | null }, 'teacher_inquiries')

export const TeacherDocuments: CollectionConfig = {
  slug: 'teacher-documents',
  upload: true,
  access: {
    create: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
    read: ({ req: { user } }) => {
      if (!user) return false
      if (canRead(user, 'teacher_inquiries') || canRead(user, 'teachers')) return true
      // A teacher can open the documents that belong to their own application.
      return { owner: { equals: user.id } }
    },
    update: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
    delete: ({ req: { user } }) => canWrite(user, 'teacher_inquiries'),
  },
  fields: [
    { name: 'owner', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'alt',
      label: 'Description',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'Human-readable description of the uploaded document.',
      },
    },
  ],
}
