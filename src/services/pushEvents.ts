import type { Payload } from 'payload'
import { extractRelationId } from '@/lib/studentValidation'
import { pushLater, pushToStaff, pushToUsers } from '@/services/pushService'

/**
 * The moments that send a browser push, for staff and for teachers.
 * Every function returns immediately (the push is sent in the background) and never throws.
 */

const inr = (n: unknown) => (typeof n === 'number' ? `₹${n.toLocaleString('en-IN')}` : '')

export function pushNewStudentEnquiry(payload: Payload, doc: Record<string, any>) {
  pushLater(pushToStaff(payload, 'student_inquiries', {
    title: 'New student enquiry',
    body: `${doc.name} · ${doc.studentClass}${doc.locality ? ` · ${doc.locality}` : ''}`,
    url: `/admin/student-enquiries/${doc.id}`,
    tag: `student-enquiry-${doc.id}`,
  }))
}

export function pushNewTeacherApplication(payload: Payload, doc: Record<string, any>) {
  pushLater(pushToStaff(payload, 'teacher_inquiries', {
    title: 'New teacher application',
    body: `${doc.fullName} · ${doc.primarySubject || 'Teacher'}`,
    url: `/admin/teacher-enquiries/${doc.id}`,
    tag: `teacher-application-${doc.id}`,
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
  pushLater(pushToUsers(payload, [userId], { title: 'Application update', body: STATUS_TEXT[status]!, url: '/teacher/application', tag: 'application-status' }))
}

export function pushRegistrationPaid(payload: Payload, enquiry: Record<string, any>) {
  const amount = enquiry.registrationFee?.amount
  pushLater(pushToStaff(payload, 'payments', {
    title: 'Registration fee received',
    body: `${enquiry.fullName}${amount ? ` paid ${inr(amount)}` : ''}`,
    url: '/admin/payouts/teacher-payments',
    tag: `registration-${enquiry.id}`,
  }))
  const userId = extractRelationId(enquiry.teacherUser)
  if (userId) pushLater(pushToUsers(payload, [userId], { title: 'Payment received', body: 'Your registration fee is confirmed.', url: '/teacher/fees', tag: 'registration-paid' }))
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
    await pushToUsers(payload, [i.teacherUser], { title: 'New student allocated', body: `${i.studentName} · ${i.a.subject}. Open to accept or reject.`, url: `/teacher/students/${i.a.id}`, tag: `allocation-${i.a.id}` })
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
      })
    } else if (!byTeacher && (status === 'cancelled' || status === 'completed')) {
      await pushToUsers(payload, [i.teacherUser], {
        title: status === 'cancelled' ? 'Student de-allocated' : 'Teaching completed',
        body: `${i.studentName} · ${i.a.subject}`,
        url: '/teacher/history',
        tag: `allocation-${i.a.id}-${status}`,
      })
    }
  })())
}

export function pushPayoutPaid(payload: Payload, allocationId: number | string, amount: number, month: string) {
  pushLater((async () => {
    const i = await allocationInfo(payload, allocationId)
    if (!i) return
    await pushToUsers(payload, [i.teacherUser], { title: 'Payment received', body: `${inr(amount)} for ${i.studentName} (${month}).`, url: '/teacher/fees', tag: `payout-${allocationId}-${month}` })
  })())
}
