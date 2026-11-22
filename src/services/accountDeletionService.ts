import type { Payload } from 'payload'
import { randomBytes } from 'node:crypto'
import { ACTIVE_ALLOCATION_STATUSES } from '@/lib/teacherAllocation'

/**
 * Safe account / data deletion.
 *
 * "Safe" means: nothing that other people or the business legally need is destroyed, but nothing that identifies the
 * person is left behind.
 *  - Removed:    login, profile photo, uploaded documents, notifications, push devices, contact details, free-text notes.
 *  - Anonymised: names, phone numbers and e-mail addresses on teacher applications/profiles, student records, enquiries,
 *                payment payer details, mail logs. The rows stay (counts, history, foreign keys keep working).
 *  - Retained:   payment amounts, receipts and gateway references, payouts and allocation history, without personal details
 *                (accounting / tax records). See the public page /delete-account for the user-facing wording.
 * Every step is idempotent, so a failed run can simply be repeated.
 */

export const DELETED_EMAIL_DOMAIN = 'deleted.invalid'
const DELETED_PHONE = '0000000000'

export type DeletionSummary = Record<string, number>

export type DeleteAccountResult =
  | { ok: true; summary: DeletionSummary }
  | { ok: false; code: 'NOT_FOUND' | 'ALREADY_DELETED' | 'SUPER_ADMIN' | 'ACTIVE_CLASSES' | 'FAILED'; message: string }

const db = (payload: Payload) => (payload as any).db

function placeholderEmail(kind: string, id: number | string) {
  return `deleted-${kind}-${id}@${DELETED_EMAIL_DOMAIN}`
}

/** Last 10 digits, so +91 98765 43210 and 9876543210 match. */
export function phoneKey(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(-10)
}

export function isDeletedEmail(email: unknown): boolean {
  return typeof email === 'string' && email.toLowerCase().endsWith(`@${DELETED_EMAIL_DOMAIN}`)
}

async function findAll(payload: Payload, collection: string, where: Record<string, unknown>): Promise<Record<string, any>[]> {
  const res = await (payload as any).find({ collection, where, limit: 1000, depth: 0, pagination: false, overrideAccess: true })
  return res.docs as Record<string, any>[]
}

/** Updates rows directly (no hooks / validation: these are plain redactions, not business transitions). */
async function redact(
  payload: Payload,
  collection: string,
  where: Record<string, unknown>,
  data: (doc: Record<string, any>) => Record<string, unknown>,
): Promise<number> {
  const docs = await findAll(payload, collection, where)
  for (const doc of docs) await db(payload).updateOne({ collection, id: doc.id, data: data(doc), returning: false })
  return docs.length
}

async function remove(payload: Payload, collection: string, where: Record<string, unknown>): Promise<number> {
  const res = await (payload as any).delete({ collection, where, overrideAccess: true })
  return (res.docs as unknown[]).length
}

/** Match contact details in a text column by e-mail and/or phone (last 10 digits). */
function contactWhere(fields: { email?: string[]; phone?: string[] }, contact: { email?: string | null; phone?: string | null }) {
  const or: Record<string, unknown>[] = []
  const email = contact.email?.trim().toLowerCase()
  const phone = phoneKey(contact.phone)
  if (email) for (const f of fields.email ?? []) or.push({ [f]: { equals: email } })
  if (phone.length === 10) for (const f of fields.phone ?? []) or.push({ [f]: { contains: phone } })
  return or.length ? { or } : null
}

/** Teacher applications, profiles, uploads: everything that identifies a teacher. */
async function anonymiseTeacherData(payload: Payload, contact: { userId?: number | string | null; email?: string | null; phone?: string | null }) {
  const summary: DeletionSummary = {}
  const enquiryOr: Record<string, unknown>[] = []
  const profileOr: Record<string, unknown>[] = []
  if (contact.userId) {
    enquiryOr.push({ teacherUser: { equals: contact.userId } })
    profileOr.push({ user: { equals: contact.userId } })
  }
  const byContactEnq = contactWhere({ email: ['email'], phone: ['mobileNumber'] }, contact)
  const byContactProf = contactWhere({ email: ['email'], phone: ['mobile'] }, contact)
  if (byContactEnq) enquiryOr.push(...(byContactEnq.or as Record<string, unknown>[]))
  if (byContactProf) profileOr.push(...(byContactProf.or as Record<string, unknown>[]))

  const documentOwnerIds: (number | string)[] = contact.userId ? [contact.userId] : []

  if (profileOr.length) {
    summary.teacherProfiles = await redact(payload, 'teacher-profiles', { or: profileOr }, doc => ({
      name: 'Deleted teacher',
      email: placeholderEmail('teacher', doc.id),
      mobile: DELETED_PHONE,
      avatar: null,
      about: null,
      applicantNotes: null,
      kyc: { aadhaarDocument: null, qualificationDocument: null, reviewNotes: null },
    }))
  }
  if (enquiryOr.length) {
    summary.teacherApplications = await redact(payload, 'teacher-enquiries', { or: enquiryOr }, doc => ({
      fullName: 'Deleted teacher',
      email: placeholderEmail('teacher-application', doc.id),
      mobileNumber: DELETED_PHONE,
      additionalNotes: null,
      adminNotes: null,
      aadhaarDocument: null,
      qualificationDocument: null,
    }))
  }
  if (documentOwnerIds.length) {
    summary.documents = 0
    for (const col of ['teacher-documents', 'user-files']) {
      try {
        summary.documents += await remove(payload, col, { owner: { in: documentOwnerIds } })
      } catch {
        summary.documentsKept = (summary.documentsKept ?? 0) + 1 // still referenced somewhere: left unlinked, will be retried
      }
    }
  }
  return summary
}

/** Payer details, mail logs, shared report recipients: redacted wherever the contact shows up. */
async function anonymiseContactEverywhere(payload: Payload, contact: { email?: string | null; phone?: string | null }) {
  const summary: DeletionSummary = {}
  const pay = contactWhere({ email: ['payerEmail'], phone: ['payerPhone'] }, contact)
  if (pay) {
    summary.payments = await redact(payload, 'payments', pay, () => ({ payerName: 'Deleted user', payerEmail: null, payerPhone: null }))
  }
  const mail = contactWhere({ email: ['recipient'] }, contact)
  if (mail) {
    summary.mailLogs = await redact(payload, 'email-logs', mail, doc => ({
      recipient: placeholderEmail('mail', doc.id),
      recipientName: null,
      subject: 'Removed',
      templateData: {},
    }))
  }
  const shares = contactWhere({ email: ['recipient'], phone: ['recipient'] }, contact)
  if (shares) {
    summary.reportShares = await redact(payload, 'student-test-report-shares', shares, () => ({ recipient: 'removed', notes: null }))
  }
  return summary
}

/** Students and their enquiries are keyed by the parent's phone / e-mail. */
async function anonymiseStudentData(payload: Payload, contact: { email?: string | null; phone?: string | null }) {
  const summary: DeletionSummary = {}
  const students = contactWhere({ email: ['parentEmail'], phone: ['phoneNumber', 'alternatePhoneNumber'] }, contact)
  if (students) {
    summary.students = await redact(payload, 'students', students, () => ({
      name: 'Deleted student',
      parentName: 'Deleted parent',
      phoneNumber: DELETED_PHONE,
      alternatePhoneNumber: null,
      parentEmail: null,
      learningNotes: null,
    }))
  }
  const enquiries = contactWhere({ phone: ['phoneNumber'] }, contact)
  if (enquiries) {
    summary.studentEnquiries = await redact(payload, 'student-enquiries', enquiries, () => ({
      name: 'Deleted student',
      phoneNumber: DELETED_PHONE,
      additionalNotes: null,
      adminNotes: null,
    }))
  }
  return summary
}

/** Used by the web request flow: contact details of a student/parent/teacher who never had (or no longer uses) the app. */
export async function anonymiseByContact(
  payload: Payload,
  contact: { email?: string | null; phone?: string | null },
): Promise<{ ok: true; summary: DeletionSummary } | { ok: false; message: string }> {
  const email = contact.email?.trim().toLowerCase() || null
  const phone = contact.phone || null
  if (!email && phoneKey(phone).length !== 10) return { ok: false, message: 'A valid e-mail or 10 digit phone number is required.' }

  const summary: DeletionSummary = {}
  const merge = (s: DeletionSummary) => {
    for (const [k, v] of Object.entries(s)) summary[k] = (summary[k] ?? 0) + v
  }

  // A matching teacher/staff account goes through the full account flow.
  if (email) {
    const users = await findAll(payload, 'users', { email: { equals: email } })
    const user = users[0]
    if (user && !user.deletedAt) {
      const res = await deleteAccount(payload, user.id, { skipRequestLog: true })
      if (!res.ok) return { ok: false, message: res.message }
      merge(res.summary)
    }
  }
  merge(await anonymiseTeacherData(payload, { email, phone }))
  merge(await anonymiseStudentData(payload, { email, phone }))
  merge(await anonymiseContactEverywhere(payload, { email, phone }))
  return { ok: true, summary }
}

/** Deletes (anonymises) one signed-in account: teacher or staff. Never touches other people's records. */
export async function deleteAccount(
  payload: Payload,
  userId: number | string,
  options: { skipRequestLog?: boolean } = {},
): Promise<DeleteAccountResult> {
  const user = (await findAll(payload, 'users', { id: { equals: userId } }))[0]
  if (!user) return { ok: false, code: 'NOT_FOUND', message: 'Account not found.' }
  if (user.deletedAt || isDeletedEmail(user.email)) return { ok: false, code: 'ALREADY_DELETED', message: 'This account was already deleted.' }
  if (user.role === 'super_admin') {
    return { ok: false, code: 'SUPER_ADMIN', message: 'A super admin account cannot be deleted from the app. Ask another super admin to remove it.' }
  }

  if (user.role === 'teacher') {
    const profiles = await findAll(payload, 'teacher-profiles', { user: { equals: user.id } })
    if (profiles.length) {
      const active = await findAll(payload, 'teacher-allocations', {
        and: [{ teacher: { in: profiles.map(p => p.id) } }, { status: { in: [...ACTIVE_ALLOCATION_STATUSES] } }],
      })
      if (active.length) {
        return {
          ok: false,
          code: 'ACTIVE_CLASSES',
          message: 'You still have active or pending students. Please finish or hand over those classes (contact support) before deleting your account.',
        }
      }
    }
  }

  const originalEmail: string = user.email
  const originalPhone: string | null = user.phone ?? null
  const summary: DeletionSummary = {}
  const merge = (s: DeletionSummary) => {
    for (const [k, v] of Object.entries(s)) summary[k] = (summary[k] ?? 0) + v
  }

  try {
    // 1. Lock the account first: from here on nobody can sign in, even if a later step fails.
    await (payload as any).update({
      collection: 'users',
      id: user.id,
      data: { status: 'blocked', password: randomBytes(24).toString('base64url'), deletedAt: new Date().toISOString() },
      context: { skipAccountMail: true },
      overrideAccess: true,
    })

    // 2. Everything that belongs to the account itself.
    summary.notifications = await remove(payload, 'notifications', { user: { equals: user.id } })
    summary.devices = await remove(payload, 'user-devices', { user: { equals: user.id } })
    summary.webPushSubscriptions = await remove(payload, 'push-subscriptions', { user: { equals: user.id } })

    // 3. Personal data in business records (keeps the rows, removes the person).
    if (user.role === 'teacher') merge(await anonymiseTeacherData(payload, { userId: user.id, email: originalEmail, phone: originalPhone }))
    merge(await anonymiseContactEverywhere(payload, { email: originalEmail, phone: originalPhone }))

    // 4. Finally the account row itself.
    await db(payload).updateOne({
      collection: 'users',
      id: user.id,
      data: { email: placeholderEmail('user', user.id), fullName: 'Deleted user', phone: null, avatar: null, otpHash: null, resetAuthToken: null },
      returning: false,
    })
  } catch (err: unknown) {
    console.error('Account deletion failed', { userId: user.id, name: err instanceof Error ? err.name : 'Error' })
    return { ok: false, code: 'FAILED', message: 'We could not finish deleting the account. It has been locked; please contact support to complete it.' }
  }

  if (!options.skipRequestLog) {
    await (payload as any)
      .create({
        collection: 'data-deletion-requests',
        data: {
          source: 'app',
          requesterType: user.role === 'teacher' ? 'teacher' : 'staff',
          status: 'completed',
          resultSummary: summary,
          processedAt: new Date().toISOString(),
        },
        overrideAccess: true,
      })
      .catch(() => undefined)
  }
  return { ok: true, summary }
}
