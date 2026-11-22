import type { Payload } from 'payload'
import { extractRelationId } from '@/lib/studentValidation'
import { pushLater, pushToStaff, pushToUsers } from '@/services/pushService'

/**
 * The moments that notify staff and teachers. Each one fans out to three channels from one place:
 *   - the CRM browser push (url / tag),
 *   - the in-app notification history, and
 *   - the mobile push (FCM) (`mobile`: type / entity / app screen / dedupeKey).
 * Every function returns immediately (the work runs in the background) and never throws, and they are
 * only called after the business operation succeeded (collection hooks / services).
 * `mobile.screen` is an app route (see wellfind-app/src/lib/notifications/navigation.ts); the app
 * checks the user's role and the record again before opening it.
 */

const inr = (n: unknown) => (typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : '')

export function pushNewStudentEnquiry(payload: Payload, doc: Record<string, any>) {
  pushLater(pushToStaff(payload, 'student_inquiries', {
    title: 'New student enquiry',
    body: `${doc.name} · ${doc.studentClass}${doc.locality ? ` · ${doc.locality}` : ''}`,
    url: `/admin/student-enquiries/${doc.id}`,
    tag: `student-enquiry-${doc.id}`,
    mobile: { type: 'student_inquiry_created', entityType: 'student_enquiry', entityId: doc.id, screen: `/admin/enquiry/${doc.id}`, dedupeKey: `student-enquiry:${doc.id}` },
  }))
}

export function pushNewTeacherApplication(payload: Payload, doc: Record<string, any>) {
  pushLater(pushToStaff(payload, 'teacher_inquiries', {
    title: 'New teacher application',
    body: `${doc.fullName} · ${doc.primarySubject || 'Teacher'}`,
    url: `/admin/teacher-enquiries/${doc.id}`,
    tag: `teacher-application-${doc.id}`,
    mobile: { type: 'teacher_application_created', entityType: 'teacher_application', entityId: doc.id, screen: `/admin/application/${doc.id}`, dedupeKey: `teacher-application:${doc.id}` },
  }))
}

const STATUS_TEXT: Record<string, string> = {
  under_review: 'Your application is under review.',
  shortlisted: 'You are shortlisted. Complete the next steps in your portal.',
  approved: 'Congratulations! Your application is approved.',
  rejected: 'Your application status was updated.',
}

export function pushTeacherStatus(payload: Payload, enquiry: Record<string, any>, previous: string | undefined) {
  const status = String(enquiry.applicationStatus || '')
  const userId = extractRelationId(enquiry.teacherUser)
  if (!userId || status === previous || !STATUS_TEXT[status]) return
  pushLater(pushToUsers(payload, [userId], {
    title: 'Application update',
    body: STATUS_TEXT[status]!,
    url: '/teacher/application',
    tag: 'application-status',
    mobile: { type: 'application_status', entityType: 'teacher_application', entityId: enquiry.id, screen: '/application', dedupeKey: `application-status:${enquiry.id}:${status}` },
  }))
}

/** `registrationFee.transactionRef` (the gateway payment id) keeps one payment from being announced twice. */
export function pushRegistrationPaid(payload: Payload, enquiry: Record<string, any>) {
  const amount = enquiry.registrationFee?.amount
  const paymentRef = String(enquiry.registrationFee?.transactionRef || enquiry.registrationFee?.paymentDate || 'paid')
  pushLater(pushToStaff(payload, 'payments', {
    title: 'Registration fee received',
    body: `${enquiry.fullName}${amount ? ` paid ${inr(amount)}` : ''}`,
    url: '/admin/payouts/teacher-payments',
    tag: `registration-${enquiry.id}`,
    mobile: { type: 'payment_received', entityType: 'payment', entityId: enquiry.id, screen: '/admin/teacher-payments', dedupeKey: `registration-paid:${enquiry.id}:${paymentRef}` },
  }))
  const userId = extractRelationId(enquiry.teacherUser)
  if (userId) {
    pushLater(pushToUsers(payload, [userId], {
      title: 'Payment received',
      body: amount ? `Your registration fee of ${inr(amount)} is confirmed.` : 'Your registration fee is confirmed.',
      url: '/teacher/fees',
      tag: 'registration-paid',
      mobile: { type: 'payment_confirmed', entityType: 'payment', entityId: enquiry.id, screen: '/fees', dedupeKey: `registration-paid:${enquiry.id}:${paymentRef}` },
    }))
  }
}

async function allocationInfo(payload: Payload, allocationId: number | string) {
  const a = (await (payload as any).findByID({ collection: 'teacher-allocations', id: allocationId, depth: 2, disableErrors: true, overrideAccess: true })) as Record<string, any> | null
  if (!a || typeof a.teacher !== 'object' || typeof a.student !== 'object') return null
  return { a, teacherUser: extractRelationId(a.teacher.user), teacherName: a.teacher.name as string, studentName: a.student.name as string }
}

export function pushTeacherAllocated(payload: Payload, allocationId: number | string) {
  pushLater((async () => {
    const i = await allocationInfo(payload, allocationId)
    if (!i) return
    await pushToUsers(payload, [i.teacherUser], {
      title: 'New student allocated',
      body: `${i.studentName} · ${i.a.subject}. Open to accept or reject.`,
      url: `/teacher/students/${i.a.id}`,
      tag: `allocation-${i.a.id}`,
      mobile: { type: 'allocation_created', entityType: 'allocation', entityId: i.a.id, screen: `/teacher-student/${i.a.id}`, dedupeKey: `allocation:${i.a.id}:created` },
    })
  })())
}

/** The teacher accepted/rejected (tell staff) or Wellfind ended the allocation (tell the teacher). */
export function pushAllocationStatus(payload: Payload, allocationId: number | string, status: string, byTeacher: boolean) {
  pushLater((async () => {
    const i = await allocationInfo(payload, allocationId)
    if (!i) return
    if (byTeacher && (status === 'accepted' || status === 'rejected')) {
      await pushToStaff(payload, 'allocation', {
        title: `Allocation ${status}`,
        body: `${i.teacherName} ${status} ${i.studentName} (${i.a.subject}).`,
        url: '/admin/allocation',
        tag: `allocation-${i.a.id}-${status}`,
        mobile: { type: `allocation_${status}`, entityType: 'allocation', entityId: i.a.id, screen: '/admin/allocations', dedupeKey: `allocation:${i.a.id}:${status}` },
      })
    } else if (!byTeacher && (status === 'cancelled' || status === 'completed')) {
      await pushToUsers(payload, [i.teacherUser], {
        title: status === 'cancelled' ? 'Student de-allocated' : 'Teaching completed',
        body: `${i.studentName} · ${i.a.subject}`,
        url: '/teacher/history',
        tag: `allocation-${i.a.id}-${status}`,
        mobile: { type: `allocation_${status}`, entityType: 'allocation', entityId: i.a.id, screen: '/history', dedupeKey: `allocation:${i.a.id}:${status}` },
      })
    }
  })())
}

export function pushPayoutPaid(payload: Payload, allocationId: number | string, amount: number, month: string) {
  pushLater((async () => {
    const i = await allocationInfo(payload, allocationId)
    if (!i) return
    await pushToUsers(payload, [i.teacherUser], {
      title: 'Payment received',
      body: `${inr(amount)} for ${i.studentName} (${month}).`,
      url: '/teacher/fees',
      tag: `payout-${allocationId}-${month}`,
      mobile: { type: 'payout_credited', entityType: 'payout', entityId: allocationId, screen: '/fees', dedupeKey: `payout:${allocationId}:${month}` },
    })
  })())
}

const ACCOUNT_TEXT: Record<string, string> = {
  active: 'Your account is active again.',
  blocked: 'Your account has been blocked. Contact Wellfind support.',
  suspended: 'Your account has been suspended. Contact Wellfind support.',
}

/** Wellfind blocked, suspended or restored an account: tell the account owner (no dedupe key: status can flip back and forth). */
export function pushAccountStatus(payload: Payload, user: Record<string, any>, previous: string | undefined) {
  const status = String(user.status || '')
  if (!user.id || !previous || status === previous || !ACCOUNT_TEXT[status]) return
  pushLater(pushToUsers(payload, [user.id], {
    title: 'Account update',
    body: ACCOUNT_TEXT[status]!,
    url: '/',
    tag: 'account-status',
    mobile: { type: 'account_status', entityType: 'account', entityId: user.id, screen: '/profile' },
  }))
}
