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
): boolean => Boolean(user && user.role === 'super_admin')

export const TeacherDocuments: CollectionConfig = {
  slug: 'teacher-documents',
  upload: true,
  access: {
    create: ({ req: { user } }) => canManageTeacherDocuments(user),
    read: ({ req: { user } }) => canManageTeacherDocuments(user),
    update: ({ req: { user } }) => canManageTeacherDocuments(user),
    delete: ({ req: { user } }) => canManageTeacherDocuments(user),
  },
  fields: [
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
