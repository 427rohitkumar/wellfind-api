import { canRead, canWrite } from '@/lib/permissions'
import type { CollectionConfig } from 'payload'
import { ValidationError } from 'payload'

import { isValidPhoneNumber, normalizePhoneNumber } from './StudentEnquiries'

export class TeacherWorkflowError extends ValidationError {
  constructor(message: string, path: string) {
    super({ errors: [{ message, path }] })
    this.message = message
  }
}

/**
 * Wellfind Academic — Teacher Enquiry collection.
 *
 * Stores teacher applications submitted through the public teacher profile
 * form, plus KYC/qualification document references and internal management
 * fields used by administrators during the review process.
 *
 * Access control:
 * - Create: open to unauthenticated visitors (public teacher application).
 * - Read/Update/Delete: `super_admin` only — enforced by collection access
 *   control, so public callers can never list, read, update, or delete
 *   applications or access private documents.
 * - Internal fields (`applicationStatus`, `adminNotes`, `reviewedBy`,
 *   `reviewedAt`, `teacherAvailability`, `rejectionCategory`, `changeReason`)
 *   are never writable by public submissions; they are stripped
 *   by the public submission route and protected by field-level access control.
 * - Submitting an application does NOT create a user account or assign the
 *   `teacher` role.
 */

export const applicationStatuses = [
  'new',
  'under_review',
  'shortlisted',
  'evaluation_completed',
  'approved',
  'rejected',
] as const
export type ApplicationStatus = (typeof applicationStatuses)[number]

/**
 * Valid state transitions for Teacher Applications.
 * - new -> under_review | rejected
 * - under_review -> shortlisted | rejected
 * - shortlisted -> evaluation_completed | approved | rejected
 *   (legacy direct `shortlisted -> approved` stays allowed until Phase 5 approval gating)
 * - evaluation_completed -> approved | rejected
 * - rejected -> under_review (only when permitted and rejectionCategory != character_conduct)
 * - approved is terminal for application status.
 */
export const VALID_TEACHER_STATUS_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  new: ['under_review', 'rejected'],
  under_review: ['shortlisted', 'rejected'],
  shortlisted: ['evaluation_completed', 'approved', 'rejected'],
  evaluation_completed: ['approved', 'rejected'],
  rejected: ['under_review'],
  approved: [],
}

/**
 * Rejection categories for teacher applications.
 * 'character_conduct' rejections can NEVER be reopened.
 */
export const rejectionCategories = [
  'qualifications_mismatch',
  'experience_insufficient',
  'document_verification_failed',
  'interview_demo_failed',
  'character_conduct',
  'other',
] as const
export type RejectionCategory = (typeof rejectionCategories)[number]

/**
 * Separate teacher availability states (only applicable once teacher is approved).
 */
export const teacherAvailabilityStates = ['free', 'allocated'] as const
export type TeacherAvailabilityState = (typeof teacherAvailabilityStates)[number]

/**
 * Determines whether a transition strictly requires a change reason.
 * 1. Any transition to 'rejected'
 * 2. Reopening from 'rejected' to 'under_review'
 */
export function isTeacherReasonRequired(from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (to === 'rejected') {
    return true
  }
  if (from === 'rejected' && to === 'under_review') {
    return true
  }
  return false
}

// KYC document constraints — configurable size limit and approved file types.
export const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number]

export function isAllowedDocumentMimeType(mimeType: unknown): mimeType is AllowedDocumentMimeType {
  return typeof mimeType === 'string' && ALLOWED_DOCUMENT_MIME_TYPES.includes(mimeType as any)
}

export function isValidTeacherPhoneNumber(value: unknown): value is string {
  return isValidPhoneNumber(value)
}

export function normalizeTeacherPhoneNumber(value: string): string {
  return normalizePhoneNumber(value)
}

/**
 * Returns true if the user may manage teacher applications.
 * Only `super_admin` users may list, read, update, or delete applications.
 * Client-supplied roles or IDs are never trusted — this is checked server-side
 * against the authenticated user's record.
 */
export function canManageTeacherEnquiries(
  user: { role?: string | null } | null | undefined,
): boolean {
  return canWrite(user, 'teacher_inquiries')
}

export const TeacherEnquiries: CollectionConfig = {
  slug: 'teacher-enquiries',
  admin: {
    useAsTitle: 'fullName',
    defaultColumns: [
      'fullName',
      'mobileNumber',
      'primarySubject',
      'classLevel',
      'applicationStatus',
      'createdAt',
    ],
  },
  access: {
    // Public teacher application submission — unauthenticated visitors may apply.
    create: () => true,
    read: ({ req: { user } }) => canRead(user, 'teacher_inquiries'),
    update: ({ req: { user } }) => canManageTeacherEnquiries(user),
    delete: ({ req: { user } }) => canManageTeacherEnquiries(user),
  },
  fields: [
    // --- Public form fields ---
    {
      name: 'fullName',
      label: 'Full name',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'mobileNumber',
      label: 'Mobile number',
      type: 'text',
      required: true,
      maxLength: 20,
      validate: (value: unknown): string | true => {
        if (!isValidTeacherPhoneNumber(value)) {
          return 'Enter a valid mobile number (7–15 digits, optional leading +).'
        }
        return true
      },
      admin: {
        description: 'Contact mobile number. Country code is optional.',
      },
    },
    {
      name: 'email',
      label: 'Email address',
      type: 'email',
      admin: {
        description: 'Optional email address.',
      },
    },
    {
      name: 'gender',
      label: 'Gender',
      type: 'select',
      options: [
        { label: 'Male', value: 'male' },
        { label: 'Female', value: 'female' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'highestQualification',
      label: 'Highest qualification',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'e.g. B.Ed, M.Sc, M.A, PhD.',
      },
    },
    {
      name: 'teachingExperience',
      label: 'Teaching experience',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: "e.g. '3 years' or 'Fresher'.",
      },
    },
    {
      name: 'primarySubject',
      label: 'Primary subject',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'Subject the teacher primarily teaches.',
      },
    },
    {
      name: 'classLevel',
      label: 'Class level',
      type: 'text',
      required: true,
      maxLength: 50,
      admin: {
        description: 'Classes taught, from UKG to Class 10.',
      },
    },
    {
      name: 'teachingLocality',
      label: 'Teaching locality',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'Area where the teacher can take classes.',
      },
    },
    {
      name: 'preferredAvailability',
      label: 'Preferred availability',
      type: 'text',
      required: true,
      maxLength: 200,
      admin: {
        description: 'Preferred days/times for classes.',
      },
    },
    {
      name: 'additionalNotes',
      label: 'Additional notes',
      type: 'textarea',
      maxLength: 2000,
      admin: {
        description: 'Optional additional notes from the applicant.',
      },
    },
    {
      name: 'agreedToPolicy',
      label: 'Agreed to policy',
      type: 'checkbox',
      required: true,
      validate: (value: unknown): string | true =>
        value === true || 'You must agree to the policy to submit an application.',
      admin: {
        description: 'Must be true to submit the application.',
      },
    },
    // --- KYC / qualification documents (private, admin-only access) ---
    {
      name: 'aadhaarDocument',
      label: 'Aadhaar / identity document',
      type: 'upload',
      relationTo: 'teacher-documents',
      access: {
        create: () => true,
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Private KYC document. Only accessible to super_admin administrators.',
      },
    },
    {
      name: 'qualificationDocument',
      label: 'Qualification certificate',
      type: 'upload',
      relationTo: 'teacher-documents',
      access: {
        create: () => true,
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description:
          'Private qualification document. Only accessible to super_admin administrators.',
      },
    },
    // --- Internal management fields (admin only) ---
    {
      name: 'markAsRead',
      label: 'Mark as read',
      type: 'checkbox',
      defaultValue: false,
      required: false,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description:
          'Indicates whether this application has been opened and read by an administrator.',
      },
    },
    {
      name: 'applicationStatus',
      label: 'Application status',
      type: 'select',
      options: [...applicationStatuses],
      defaultValue: 'new',
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Internal application status. Public submissions cannot set this field.',
      },
    },
    {
      name: 'adminNotes',
      label: 'Admin notes',
      type: 'textarea',
      maxLength: 5000,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Internal admin notes. Public submissions cannot write this field.',
      },
    },
    {
      name: 'reviewedBy',
      label: 'Reviewed by',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Internal staff member who reviewed this application.',
      },
    },
    {
      name: 'reviewedAt',
      label: 'Reviewed at',
      type: 'date',
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Timestamp when the application was last reviewed.',
      },
    },
    {
      name: 'teacherAvailability',
      label: 'Teacher availability',
      type: 'select',
      options: [...teacherAvailabilityStates],
      defaultValue: 'free',
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description:
          'Separate availability status for approved teachers (free vs allocated). Defaults to free upon approval.',
        condition: (_, siblingData) => siblingData?.applicationStatus === 'approved',
      },
    },
    {
      name: 'rejectionCategory',
      label: 'Rejection category',
      type: 'select',
      options: [...rejectionCategories],
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Category of rejection. Character/conduct rejections can never be reopened.',
        condition: (_, siblingData) => siblingData?.applicationStatus === 'rejected',
      },
    },
    {
      name: 'changeReason',
      label: 'Change reason',
      type: 'textarea',
      maxLength: 2000,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description:
          'Mandatory reason when rejecting or reopening a teacher application. Forwarded to the audit log and reset.',
      },
    },
    {
      name: 'registrationFee',
      label: 'Registration fee',
      type: 'group',
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description:
          'Registration fee step between shortlisting and approval. Approval requires the fee to be paid or waived (skipped).',
      },
      fields: [
        {
          name: 'status',
          label: 'Fee status',
          type: 'select',
          options: [
            { label: 'Pending', value: 'pending' },
            { label: 'Submitted (awaiting verification)', value: 'submitted' },
            { label: 'Paid', value: 'paid' },
            { label: 'Skipped (waived)', value: 'waived' },
          ],
          defaultValue: 'pending',
        },
        { name: 'amount', label: 'Amount (INR)', type: 'number', defaultValue: 1000, min: 0 },
        { name: 'paymentDate', label: 'Payment date', type: 'date' },
        {
          name: 'paymentMethod',
          label: 'Payment method',
          type: 'select',
          options: [
            { label: 'Razorpay (online)', value: 'razorpay' },
            { label: 'UPI', value: 'upi' },
            { label: 'Bank transfer', value: 'bank_transfer' },
            { label: 'Other', value: 'other' },
          ],
        },
        { name: 'submittedAt', label: 'Submitted by teacher at', type: 'date' },
        { name: 'expiresAt', label: 'Registration valid until', type: 'date' },
        { name: 'transactionRef', label: 'Transaction reference', type: 'text', maxLength: 200 },
        { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 1000 },
      ],
    },
    {
      name: 'teacherUser',
      label: 'Teacher login account',
      type: 'relationship',
      relationTo: 'users',
      hasMany: false,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: { description: 'Dashboard login created for this applicant when shortlisted.' },
    },
    {
      name: 'accountCreatedAt',
      label: 'Account created at',
      type: 'date',
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
    },
    {
      name: 'credentialsEmailStatus',
      label: 'Credentials email',
      type: 'select',
      options: [
        { label: 'Sent', value: 'sent' },
        { label: 'Failed / not sent', value: 'failed' },
      ],
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
    },
    {
      name: 'teacherProfile',
      label: 'Teacher Profile',
      type: 'relationship',
      relationTo: 'teacher-profiles',
      hasMany: false,
      access: {
        create: ({ req: { user } }) => canManageTeacherEnquiries(user),
        update: ({ req: { user } }) => canManageTeacherEnquiries(user),
      },
      admin: {
        description: 'Linked approved teacher profile in the main teachers network.',
      },
    },
  ],
  timestamps: true,
  hooks: {
    beforeChange: [
      async ({ operation, data, originalDoc, req }: any): Promise<Record<string, unknown>> => {
        if (operation === 'create' && !canManageTeacherEnquiries((req as any)?.user)) {
          delete data.applicationStatus
          delete data.adminNotes
          delete data.reviewedBy
          delete data.reviewedAt
          delete data.teacherAvailability
          delete data.rejectionCategory
          delete data.changeReason
          delete data.markAsRead
        }

        if (
          (operation === 'create' || operation === 'update') &&
          typeof data.mobileNumber === 'string'
        ) {
          data.mobileNumber = normalizeTeacherPhoneNumber(data.mobileNumber)
        }

        // Validate status transition and mandatory reason on update
        if (operation === 'update' && typeof data.applicationStatus === 'string') {
          const currentStatus = (originalDoc?.applicationStatus || 'new') as ApplicationStatus
          const targetStatus = data.applicationStatus as ApplicationStatus

          if (targetStatus !== currentStatus) {
            const allowedTransitions = VALID_TEACHER_STATUS_TRANSITIONS[currentStatus] || []
            if (!allowedTransitions.includes(targetStatus)) {
              throw new TeacherWorkflowError(
                `Invalid application status transition from '${currentStatus}' to '${targetStatus}'.`,
                'applicationStatus',
              )
            }

            // Approval requires the registration fee to be paid or skipped (waived).
            if (targetStatus === 'approved') {
              const feeStatus =
                data.registrationFee?.status ?? originalDoc?.registrationFee?.status ?? 'pending'
              if (feeStatus !== 'paid' && feeStatus !== 'waived') {
                throw new TeacherWorkflowError(
                  'The registration fee must be marked paid or skipped before this application can be approved.',
                  'registrationFee',
                )
              }
            }

            // Block reopening if prior rejection was for character/conduct
            if (currentStatus === 'rejected' && targetStatus === 'under_review') {
              if (originalDoc?.rejectionCategory === 'character_conduct') {
                throw new TeacherWorkflowError(
                  'Applications rejected due to character or conduct issues cannot be reopened.',
                  'applicationStatus',
                )
              }
            }

            const reasonRaw =
              typeof data.changeReason === 'string'
                ? data.changeReason
                : (req?.context?.changeReason as string | undefined)
            const trimmedReason = typeof reasonRaw === 'string' ? reasonRaw.trim() : ''

            if (
              isTeacherReasonRequired(currentStatus, targetStatus) &&
              trimmedReason.length === 0
            ) {
              throw new TeacherWorkflowError(
                `A non-empty change reason is mandatory when transitioning application status from '${currentStatus}' to '${targetStatus}'.`,
                'changeReason',
              )
            }

            // Stash sanitized reason in req.context for afterChange audit logger
            if (!req.context) {
              req.context = {}
            }
            req.context.teacherChangeReason = trimmedReason.length > 0 ? trimmedReason : null
          }
        }

        // A settled registration fee (paid or skipped) starts the registration validity period.
        if (operation === 'update' && data.registrationFee && typeof data.registrationFee === 'object') {
          const nextFee = data.registrationFee.status
          const prevFee = originalDoc?.registrationFee ?? {}
          if (
            (nextFee === 'paid' || nextFee === 'waived') &&
            nextFee !== prevFee.status &&
            !data.registrationFee.expiresAt &&
            !prevFee.expiresAt
          ) {
            const { getMailConfig } = await import('@/lib/mail/config')
            const days = getMailConfig().registrationValidityDays
            data.registrationFee = {
              ...prevFee,
              ...data.registrationFee,
              expiresAt: new Date(Date.now() + days * 86_400_000).toISOString(),
              ...(nextFee === 'paid' && !data.registrationFee.paymentDate && !prevFee.paymentDate
                ? { paymentDate: new Date().toISOString() }
                : {}),
            }
          }
        }

        // When approved, ensure teacherAvailability defaults to 'free' if not set
        if (
          data.applicationStatus === 'approved' &&
          !data.teacherAvailability &&
          !originalDoc?.teacherAvailability
        ) {
          data.teacherAvailability = 'free'
        }

        // Clean up transient changeReason
        delete data.changeReason

        return data
      },
    ],
    afterChange: [
      // Email the applicant about status and registration-fee changes. Never blocks the update.
      async ({ operation, previousDoc, doc, req }: any) => {
        if (req?.context?.skipMail) return
        if (operation === 'create') {
          try {
            const { notifyApplicationReceived } = await import('@/services/mailNotifications')
            await notifyApplicationReceived(req.payload, doc)
            const { pushNewTeacherApplication } = await import('@/services/pushEvents')
            pushNewTeacherApplication(req.payload, doc)
          } catch {
            /* never fail the submission because of mail */
          }
          return
        }
        if (operation !== 'update') return
        try {
          const { notifyPaymentReceived, notifyTeacherStatusChange } = await import('@/services/mailNotifications')
          await notifyTeacherStatusChange(req.payload, doc, previousDoc?.applicationStatus)
          const { pushTeacherStatus, pushRegistrationPaid } = await import('@/services/pushEvents')
          pushTeacherStatus(req.payload, doc, previousDoc?.applicationStatus)
          const before = previousDoc?.registrationFee?.status
          const after = doc?.registrationFee?.status
          if (after !== before && (after === 'paid' || after === 'waived')) {
            await notifyPaymentReceived(req.payload, doc)
            if (after === 'paid') pushRegistrationPaid(req.payload, doc)
          }
          // Keep the Payments ledger complete when an admin marks the fee paid by hand.
          if (after === 'paid' && before !== 'paid') {
            const { recordManualRegistrationPayment } = await import('@/services/paymentService')
            await recordManualRegistrationPayment(req.payload, doc)
          }
        } catch {
          /* mail problems must never fail the workflow */
        }
      },
      async ({ operation, previousDoc, originalDoc, doc, req }: any) => {
        const prevDoc = previousDoc || originalDoc
        // Only log updates, not creates (initial default status is not an admin change)
        if (operation === 'create' || operation !== 'update') {
          return
        }

        const previousStatus = (prevDoc?.applicationStatus || 'new') as string | undefined
        const newStatus = doc.applicationStatus as string | undefined

        // Only log when status actually changes — prevents duplicate entries
        if (previousStatus === newStatus) {
          return
        }

        const reason = req?.context?.teacherChangeReason ?? null
        if (req?.context) {
          delete req.context.teacherChangeReason
        }

        // When approved, ensure corresponding TeacherProfile exists (idempotent)
        if (newStatus === 'approved') {
          try {
            await syncApprovedTeacherProfile(req.payload, doc, req)
          } catch (syncErr) {
            console.error('Failed to sync approved teacher profile:', syncErr)
            throw syncErr
          }
        }

        // Create audit log entry via server-side local API
        await req.payload.create({
          collection: 'enquiry-audit-log',
          data: {
            enquiryType: 'teacher',
            teacherEnquiry: doc.id,
            fieldChanged: 'applicationStatus',
            previousStatus: previousStatus ?? null,
            newStatus,
            changedBy: req.user?.id ?? null,
            changedAt: new Date(),
            changeReason: reason,
          },
          overrideAccess: true,
          req,
        })
      },
    ],
  },
}

/**
 * Idempotently creates or links a TeacherProfile record when an application is approved.
 */
export async function syncApprovedTeacherProfile(
  payload: any,
  doc: Record<string, any>,
  req?: any,
): Promise<any> {
  // Idempotency check 1: profile linked to this specific application ID
  const existingByEnquiry = await payload.find({
    collection: 'teacher-profiles',
    where: {
      teacherEnquiry: { equals: doc.id },
    },
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (existingByEnquiry.docs.length > 0) {
    const existing = existingByEnquiry.docs[0]
    const profileId = existing.id
    if (
      !doc.teacherProfile ||
      (typeof doc.teacherProfile === 'object' && doc.teacherProfile.id !== profileId) ||
      doc.teacherProfile !== profileId
    ) {
      await payload.update({
        collection: 'teacher-enquiries',
        id: doc.id,
        data: { teacherProfile: profileId },
        overrideAccess: true,
        req,
      })
    }
    return existing
  }

  // Idempotency check 2: profile with matching mobile number
  if (doc.mobileNumber) {
    const existingByMobile = await payload.find({
      collection: 'teacher-profiles',
      where: {
        mobile: { equals: doc.mobileNumber },
      },
      limit: 1,
      overrideAccess: true,
      req,
    })

    // A profile that belongs to a different application must never be adopted just because the mobile matches.
    const adoptable = existingByMobile.docs.find((d: Record<string, any>) => !d.teacherEnquiry)
    if (adoptable) {
      const existing = adoptable
      await payload.update({
        collection: 'teacher-profiles',
        id: existing.id,
        data: { teacherEnquiry: doc.id, approvalStatus: 'approved' },
        overrideAccess: true,
        req,
      })
      await payload.update({
        collection: 'teacher-enquiries',
        id: doc.id,
        data: { teacherProfile: existing.id },
        overrideAccess: true,
        req,
      })
      return existing
    }
  }

  // Parse experience years from doc.teachingExperience (e.g. "3 years" -> 3)
  const expMatch =
    typeof doc.teachingExperience === 'string' ? doc.teachingExperience.match(/\d+/) : null
  const expYears = expMatch ? parseInt(expMatch[0], 10) : 0

  const aadhaarId =
    typeof doc.aadhaarDocument === 'object' ? doc.aadhaarDocument?.id : doc.aadhaarDocument
  const qualId =
    typeof doc.qualificationDocument === 'object'
      ? doc.qualificationDocument?.id
      : doc.qualificationDocument

  // Create corresponding TeacherProfile carrying over available application information
  const newProfile = await payload.create({
    collection: 'teacher-profiles',
    data: {
      name: doc.fullName,
      gender: doc.gender || undefined,
      email: doc.email || null,
      mobile: doc.mobileNumber,
      primarySubject: doc.primarySubject,
      qualification: doc.highestQualification,
      experienceYears: expYears,
      classLevels: doc.classLevel || 'All Levels',
      locality: doc.teachingLocality || 'Not specified',
      availability: doc.preferredAvailability || 'Flexible',
      applicantNotes: doc.additionalNotes || null,
      teacherEnquiry: doc.id,
      ...(doc.teacherUser ? { user: typeof doc.teacherUser === 'object' ? doc.teacherUser.id : doc.teacherUser } : {}),
      approvalStatus: 'approved',
      registrationFee: {
        status: doc.registrationFee?.status === 'paid' || doc.registrationFee?.status === 'waived'
          ? doc.registrationFee.status
          : 'pending',
        amount: typeof doc.registrationFee?.amount === 'number' ? doc.registrationFee.amount : 1000,
        currency: 'INR',
        year: '2026–2027',
        paymentDate: doc.registrationFee?.paymentDate
          ? new Date(doc.registrationFee.paymentDate).toISOString().slice(0, 10)
          : doc.registrationFee?.status === 'waived' ? 'Waived' : 'Pending',
        expiresAt: doc.registrationFee?.expiresAt || null,
        transactionRef: doc.registrationFee?.transactionRef || 'None',
      },
      kyc: {
        status: 'verified',
        aadhaarStatus: aadhaarId ? 'Verified Document' : 'Pending Upload',
        qualificationStatus: qualId ? 'Verified Document' : 'Pending Upload',
        aadhaarDocument: aadhaarId || null,
        qualificationDocument: qualId || null,
        reviewNotes: doc.adminNotes || 'Approved via Teacher Enquiries review',
        reviewedAt: doc.reviewedAt || new Date().toISOString(),
      },
      studentAllocation: {
        status: doc.teacherAvailability === 'allocated' ? 'allocated' : 'unallocated',
        allocatedCount: doc.teacherAvailability === 'allocated' ? 1 : 0,
        studentsSummary: doc.teacherAvailability === 'allocated' ? 'Allocated' : 'Unallocated',
        allocationDate: 'None',
      },
      account: {
        status: 'active',
      },
    },
    overrideAccess: true,
    req,
  })

  // Link newly created teacher profile ID to the teacher enquiry
  await payload.update({
    collection: 'teacher-enquiries',
    id: doc.id,
    data: { teacherProfile: newProfile.id },
    overrideAccess: true,
    req,
  })

  return newProfile
}
