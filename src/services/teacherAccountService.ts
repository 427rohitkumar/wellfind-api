import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { getMailConfig } from '@/lib/mail/config'
import { sendTemplatedEmail } from '@/services/mailService'
import { generateTemporaryPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/passwords'
import { extractRelationId, isValidEmail } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'

/** Statuses in which an admin may create the teacher's dashboard account. */
const ACCOUNT_ELIGIBLE_STATUSES = ['under_review', 'shortlisted', 'evaluation_completed']

export interface CreateTeacherAccountResult {
  user: { id: unknown; email: string; role: 'teacher' }
  /** The password that was set. Returned once so the admin can share it if email is unavailable. */
  password: string
  passwordGenerated: boolean
  email: { sent: boolean; error: string | null }
}

/**
 * Creates the teacher's login (role `teacher`) for an application that is being
 * shortlisted, links it to the enquiry, and emails the credentials when SMTP is configured.
 * The existing approval flow links this account to the teacher profile later.
 */
export async function createTeacherAccount(
  payload: Payload,
  enquiryId: number,
  body: Record<string, unknown>,
  admin: AuthUserRecord,
): Promise<CreateTeacherAccountResult> {
  const enquiry = (await (payload as any).findByID({
    collection: 'teacher-enquiries',
    id: enquiryId,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
  })) as Record<string, any> | null
  if (!enquiry) throw new ServiceError('Teacher application not found.', 404)

  const status = String(enquiry.applicationStatus || 'new')
  if (!ACCOUNT_ELIGIBLE_STATUSES.includes(status)) {
    throw new ServiceError(`An account cannot be created while the application is "${status}".`, 409, [
      { field: 'applicationStatus', message: 'Application must be under review or shortlisted.' },
    ])
  }
  if (extractRelationId(enquiry.teacherUser)) {
    throw new ServiceError('A teacher account has already been created for this application.', 409, [
      { field: 'teacherUser', message: 'Account already exists.' },
    ])
  }

  const rawEmail = typeof body.email === 'string' && body.email.trim() ? body.email : enquiry.email
  if (!isValidEmail(rawEmail)) {
    throw new ServiceError('A valid email address is required to create the account.', 400, [
      { field: 'email', message: 'Enter a valid email address.' },
    ])
  }
  const email = String(rawEmail).trim().toLowerCase()

  let password: string
  let passwordGenerated = false
  if (body.password === undefined || body.password === null || body.password === '') {
    password = generateTemporaryPassword()
    passwordGenerated = true
  } else if (
    typeof body.password !== 'string' ||
    body.password.length < MIN_PASSWORD_LENGTH ||
    body.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new ServiceError(
      `Password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
      400,
      [{ field: 'password', message: `Use ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters.` }],
    )
  } else {
    password = body.password
  }

  const existing = await (payload as any).find({
    collection: 'users',
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (existing.docs.length > 0) {
    throw new ServiceError('An account with this email already exists.', 409, [
      { field: 'email', message: 'This email is already registered.' },
    ])
  }

  const user = (await (payload as any).create({
    collection: 'users',
    data: { email, password, role: 'teacher', status: 'active' },
    overrideAccess: true,
    // The dedicated welcome mail below carries the credentials; skip the generic one.
    context: { skipAccountMail: true },
  })) as Record<string, any>

  const sentResult = await sendTemplatedEmail({
    payload,
    template: 'teacher_welcome',
    to: email,
    toName: enquiry.fullName,
    data: { name: enquiry.fullName, email, password, loginUrl: getMailConfig().teacherPortalUrl },
    relatedType: 'teacher-enquiry',
    relatedId: enquiryId,
  })
  const sent = { success: sentResult.ok, error: sentResult.error }

  await (payload as any).update({
    collection: 'teacher-enquiries',
    id: enquiryId,
    data: {
      teacherUser: user.id,
      accountCreatedAt: new Date().toISOString(),
      credentialsEmailStatus: sent.success ? 'sent' : 'failed',
      // Keep the contact email in sync with the login the teacher was given.
      ...(email !== String(enquiry.email || '').toLowerCase() ? { email } : {}),
    },
    overrideAccess: true,
  })

  return {
    user: { id: user.id, email, role: 'teacher' },
    password,
    passwordGenerated,
    email: { sent: sent.success, error: sent.success ? null : sent.error ?? 'Email was not sent.' },
  }
}
