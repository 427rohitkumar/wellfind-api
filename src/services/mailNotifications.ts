import type { Payload } from 'payload'
import { getMailConfig } from '@/lib/mail/config'
import { getRazorpayConfig } from '@/lib/razorpay'
import { STATUS_COPY } from '@/lib/mail/templates'
import { extractRelationId } from '@/lib/studentValidation'
import { sendTemplatedEmail } from '@/services/mailService'

/**
 * Event-driven notifications. Each helper is safe to call from hooks: it swallows every
 * error (the mail service also logs failures) and respects `req.context.skipMail`.
 */

const NOTIFY_STATUSES = ['under_review', 'shortlisted', 'approved', 'rejected']

export async function notifyTeacherStatusChange(
  payload: Payload,
  enquiry: Record<string, any>,
  previousStatus: string | undefined,
): Promise<void> {
  const status = String(enquiry.applicationStatus || '')
  if (!enquiry.email || status === previousStatus || !NOTIFY_STATUSES.includes(status)) return
  try {
    const hasLogin = Boolean(extractRelationId(enquiry.teacherUser))
    // When a login was created during shortlisting, the single "shortlisted + login details"
    // mail already told the teacher, so a separate status mail would be a duplicate.
    const coveredByWelcome = status === 'shortlisted' && hasLogin
    if (!coveredByWelcome) {
      await sendTemplatedEmail({
        payload,
        template: 'teacher_status_update',
        to: enquiry.email,
        toName: enquiry.fullName,
        data: { name: enquiry.fullName, status, applicationId: enquiry.id, hasPortal: hasLogin },
        relatedType: 'teacher-enquiry',
        relatedId: enquiry.id,
      })
    }
    // Shortlisting also tells the teacher how to pay the registration fee.
    if (status === 'shortlisted') await notifyPaymentDue(payload, enquiry)
  } catch {
    /* never block the workflow on mail */
  }
}

/** Thank-you mail sent as soon as a teacher application is submitted. */
export async function notifyApplicationReceived(payload: Payload, enquiry: Record<string, any>): Promise<void> {
  if (!enquiry.email) return
  await sendTemplatedEmail({
    payload,
    template: 'teacher_application_received',
    to: enquiry.email,
    toName: enquiry.fullName,
    data: {
      name: enquiry.fullName,
      applicationId: enquiry.id,
      subject: enquiry.primarySubject,
      classLevel: enquiry.classLevel,
      locality: enquiry.teachingLocality,
    },
    relatedType: 'teacher-enquiry',
    relatedId: enquiry.id,
    dedupeKey: `application_received:${enquiry.id}`,
  })
}

export async function notifyPaymentDue(payload: Payload, enquiry: Record<string, any>): Promise<void> {
  if (!enquiry.email) return
  const cfg = getMailConfig()
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  if (fee.status === 'paid' || fee.status === 'waived') return
  await sendTemplatedEmail({
    payload,
    template: 'teacher_payment_due',
    to: enquiry.email,
    toName: enquiry.fullName,
    data: {
      name: enquiry.fullName,
      amount: typeof fee.amount === 'number' ? fee.amount : cfg.registrationFeeAmount,
      upiId: process.env.REGISTRATION_FEE_UPI_ID?.trim() || null,
      payeeName: process.env.REGISTRATION_FEE_PAYEE_NAME?.trim() || cfg.brandName,
      online: getRazorpayConfig().configured,
    },
    relatedType: 'teacher-enquiry',
    relatedId: enquiry.id,
  })
}

export async function notifyPaymentReceived(
  payload: Payload,
  enquiry: Record<string, any>,
  opts: { renewal?: boolean; paymentId?: string } = {},
): Promise<void> {
  if (!enquiry.email) return
  const fee = (enquiry.registrationFee ?? {}) as Record<string, any>
  const cfg = getMailConfig()
  await sendTemplatedEmail({
    payload,
    template: 'teacher_payment_received',
    to: enquiry.email,
    toName: enquiry.fullName,
    data: {
      name: enquiry.fullName,
      amount: typeof fee.amount === 'number' ? fee.amount : cfg.registrationFeeAmount,
      waived: fee.status === 'waived',
      reference: opts.paymentId || fee.transactionRef || null,
      paidAt: fee.paymentDate || new Date().toISOString(),
      validUntil: fee.expiresAt || null,
      renewal: Boolean(opts.renewal),
      method: fee.paymentMethod || null,
    },
    relatedType: 'teacher-enquiry',
    relatedId: enquiry.id,
    dedupeKey: opts.paymentId ? `payment_received:${enquiry.id}:${opts.paymentId}` : `payment_received:${enquiry.id}`,
  })
}

/** Email of a teacher profile: the profile email, else the linked login. */
async function teacherEmail(payload: Payload, profile: Record<string, any>): Promise<string | null> {
  if (profile.email) return String(profile.email)
  const userId = extractRelationId(profile.user)
  if (!userId) return null
  const user = await (payload as any).findByID({ collection: 'users', id: userId, depth: 0, disableErrors: true, overrideAccess: true })
  return user?.email ?? null
}

export async function notifyTeacherAllocated(payload: Payload, allocationId: number | string): Promise<void> {
  try {
    const allocation = (await (payload as any).findByID({
      collection: 'teacher-allocations',
      id: allocationId,
      depth: 1,
      disableErrors: true,
      overrideAccess: true,
    })) as Record<string, any> | null
    if (!allocation || typeof allocation.teacher !== 'object' || typeof allocation.student !== 'object') return
    const teacher = allocation.teacher as Record<string, any>
    const student = allocation.student as Record<string, any>
    const to = await teacherEmail(payload, teacher)
    if (!to) return
    await sendTemplatedEmail({
      payload,
      template: 'teacher_allocated',
      to,
      toName: teacher.name,
      data: {
        name: teacher.name,
        studentName: student.name,
        studentClass: student.studentClass,
        subject: allocation.subject,
        locality: student.locality,
        timing: student.preferredTiming,
        monthlyPayout: allocation.teacherPayout ?? null,
      },
      relatedType: 'teacher-allocation',
      relatedId: allocation.id,
      dedupeKey: `allocated:${allocation.id}`,
    })
  } catch {
    /* ignore */
  }
}

const ROLE_LABELS: Record<string, string> = { super_admin: 'an administrator', operations_manager: 'an Operations Manager', student_counselor: 'a Student Counselor', teacher_coordinator: 'a Teacher Coordinator', finance_manager: 'a Finance Manager', marketing_analyst: 'a Marketing Analyst', support_executive: 'a Support Executive', teacher: 'a teacher' }

export async function notifyAccountCreated(payload: Payload, user: Record<string, any>): Promise<void> {
  if (!user?.email) return
  const cfg = getMailConfig()
  await sendTemplatedEmail({
    payload,
    template: 'account_created',
    to: user.email,
    data: {
      name: String(user.email).split('@')[0],
      email: user.email,
      roleLabel: ROLE_LABELS[user.role] || user.role || 'a user',
      loginUrl: user.role !== 'teacher' ? cfg.adminPortalUrl : cfg.teacherPortalUrl,
    },
    relatedType: 'user',
    relatedId: user.id,
  })
}

export async function notifyAccountStatusChange(
  payload: Payload,
  user: Record<string, any>,
  previousStatus: string | undefined,
): Promise<void> {
  const status = String(user?.status || '')
  if (!user?.email || !previousStatus || status === previousStatus) return
  const template =
    status === 'blocked' ? 'account_blocked' : status === 'suspended' ? 'account_suspended' : status === 'active' ? 'account_restored' : null
  if (!template) return
  const cfg = getMailConfig()
  await sendTemplatedEmail({
    payload,
    template,
    to: user.email,
    data: {
      name: String(user.email).split('@')[0],
      email: user.email,
      loginUrl: user.role !== 'teacher' ? cfg.adminPortalUrl : cfg.teacherPortalUrl,
    },
    relatedType: 'user',
    relatedId: user.id,
  })
}

export { STATUS_COPY }
