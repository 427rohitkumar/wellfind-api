import { randomBytes } from 'node:crypto'
import { commitTransaction, initTransaction, killTransaction, type Payload } from 'payload'
import { isUniqueConstraintError, type AuthUserRecord } from '@/lib/api'
import { extractRelationId, isValidEmail } from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'

export const teacherAccountStatuses = ['active', 'inactive', 'suspended'] as const
export type TeacherAccountStatus = (typeof teacherAccountStatuses)[number]

export const teacherAvailabilityStatuses = ['free', 'allocated'] as const

const REQUIRED_APPLICATION_FIELDS: { key: string; label: string }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'mobileNumber', label: 'Mobile number' },
  { key: 'email', label: 'Email address' },
  { key: 'highestQualification', label: 'Highest qualification' },
  { key: 'teachingExperience', label: 'Teaching experience' },
  { key: 'primarySubject', label: 'Primary subject' },
  { key: 'classLevel', label: 'Class level' },
  { key: 'teachingLocality', label: 'Teaching locality' },
  { key: 'preferredAvailability', label: 'Preferred availability' },
]

async function runInAdminTransaction<T>(
  payload: Payload,
  adminUser: AuthUserRecord,
  fn: (txReq: any) => Promise<T>,
): Promise<T> {
  const txReq: any = { payload, user: adminUser }
  const startedTx = await initTransaction(txReq)
  try {
    const result = await fn(txReq)
    if (startedTx) {
      await commitTransaction(txReq)
    }
    return result
  } catch (err: unknown) {
    if (startedTx) {
      await killTransaction(txReq)
    }
    throw err
  }
}

export interface SerializedTeacherProfile {
  id: unknown
  name: unknown
  email: unknown
  mobile: unknown
  primarySubject: unknown
  qualification: unknown
  experienceYears: unknown
  classLevels: unknown
  locality: unknown
  availability: unknown
  availabilityStatus: unknown
  evaluationScore: unknown
  approvalStatus: unknown
  accountStatus: unknown
  teacherEnquiry: number | string | null
  user: number | string | null
  evaluation: number | string | null
  approvedBy: number | string | null
  approvedAt: unknown
}

export function serializeTeacherProfile(doc: Record<string, any>): SerializedTeacherProfile {
  return {
    id: doc.id,
    name: doc.name,
    email: doc.email ?? null,
    mobile: doc.mobile,
    primarySubject: doc.primarySubject,
    qualification: doc.qualification,
    experienceYears: doc.experienceYears ?? 0,
    classLevels: doc.classLevels ?? null,
    locality: doc.locality ?? null,
    availability: doc.availability ?? null,
    availabilityStatus: doc.availabilityStatus ?? 'free',
    evaluationScore: doc.evaluationScore ?? null,
    approvalStatus: doc.approvalStatus,
    accountStatus: doc.account?.status ?? 'active',
    teacherEnquiry: extractRelationId(doc.teacherEnquiry),
    user: extractRelationId(doc.user),
    evaluation: extractRelationId(doc.evaluation),
    approvedBy: extractRelationId(doc.approvedBy),
    approvedAt: doc.approvedAt ?? null,
  }
}

/**
 * `FR-D1` / `FR-D2` — Approves a teacher application, creating exactly one linked
 * teacher profile and linking/creating a `teacher` user account (all atomic).
 * The role is always assigned server-side. No password is returned or stored in
 * plaintext: a random password is generated and the teacher activates via the
 * existing OTP forgot-password flow.
 */
export async function approveTeacherEnquiry(
  payload: Payload,
  enquiryId: number,
  adminUser: AuthUserRecord,
): Promise<{
  profile: SerializedTeacherProfile
  user: { id: unknown; email: unknown; role: unknown; created: boolean }
  evaluationId: number | string | null
  qualityScore: number | null
}> {
  try {
    return await runInAdminTransaction(payload, adminUser, async (txReq) => {
      const enquiry = (await (payload as any).findByID({
        collection: 'teacher-enquiries',
        id: enquiryId,
        disableErrors: true,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any> | null

      if (!enquiry) {
        throw new ServiceError('Teacher application not found.', 404, [
          { field: 'teacherEnquiryId', message: 'Teacher application does not exist.' },
        ])
      }

      const status = String(enquiry.applicationStatus || '')
      if (status === 'approved') {
        throw new ServiceError('Teacher application is already approved.', 409)
      }
      if (status !== 'evaluation_completed') {
        throw new ServiceError(
          `Teacher application in status "${status}" cannot be approved. A completed evaluation is required.`,
          409,
          [{ field: 'applicationStatus', message: 'Application must be evaluation_completed.' }],
        )
      }

      const missing = REQUIRED_APPLICATION_FIELDS.filter(({ key }) => {
        const v = enquiry[key]
        return typeof v !== 'string' || v.trim().length === 0
      })
      if (missing.length > 0) {
        throw new ServiceError(
          'Application is missing required teacher information.',
          400,
          missing.map((m) => ({ field: m.key, message: `${m.label} is required for approval.` })),
        )
      }
      if (!isValidEmail(enquiry.email)) {
        throw new ServiceError('Application email address is invalid.', 400, [
          { field: 'email', message: 'A valid email is required to create the teacher account.' },
        ])
      }

      const evals = await (payload as any).find({
        collection: 'teacher-evaluations',
        where: {
          and: [
            { teacherEnquiry: { equals: enquiryId } },
            { evaluationStatus: { equals: 'completed' } },
          ],
        },
        sort: '-attemptNumber',
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })
      const evaluation = evals.docs[0] as Record<string, any> | undefined
      if (!evaluation) {
        throw new ServiceError('A completed evaluation is required before approval.', 409, [
          { field: 'evaluation', message: 'No completed evaluation exists for this application.' },
        ])
      }

      // Account: link a safe existing teacher user, or create one.
      const email = String(enquiry.email).trim().toLowerCase()
      const existingUsers = await (payload as any).find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })
      let userDoc = existingUsers.docs[0] as Record<string, any> | undefined
      let userCreated = false

      if (userDoc) {
        if (userDoc.role !== 'teacher') {
          throw new ServiceError(
            'An existing account with this email has a non-teacher role and cannot be linked.',
            409,
            [{ field: 'email', message: 'Email belongs to a non-teacher account.' }],
          )
        }
        const linked = await (payload as any).find({
          collection: 'teacher-profiles',
          where: { user: { equals: userDoc.id } },
          limit: 1,
          depth: 0,
          overrideAccess: true,
          req: txReq,
        })
        if (linked.docs.length > 0) {
          throw new ServiceError('Existing account is already linked to another teacher profile.', 409, [
            { field: 'email', message: 'Account already linked to a teacher profile.' },
          ])
        }
        if (userDoc.status === 'blocked' || userDoc.status === 'suspended') {
          throw new ServiceError('Existing account is blocked or suspended.', 409, [
            { field: 'email', message: 'Account is blocked or suspended.' },
          ])
        }
      } else {
        userDoc = (await (payload as any).create({
          collection: 'users',
          data: {
            email,
            password: randomBytes(24).toString('base64url'),
            role: 'teacher',
            status: 'active',
          },
          overrideAccess: true,
          req: txReq,
        })) as Record<string, any>
        userCreated = true
      }

      const nowIso = new Date().toISOString()
      // Status change triggers the existing hook, which creates the profile + audit entry.
      await (payload as any).update({
        collection: 'teacher-enquiries',
        id: enquiryId,
        data: {
          applicationStatus: 'approved',
          reviewedBy: adminUser.id,
          reviewedAt: nowIso,
        },
        overrideAccess: true,
        req: txReq,
      })

      const profiles = await (payload as any).find({
        collection: 'teacher-profiles',
        where: { teacherEnquiry: { equals: enquiryId } },
        limit: 2,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })
      if (profiles.docs.length !== 1) {
        throw new ServiceError('Teacher profile could not be created uniquely.', 500)
      }

      const profile = (await (payload as any).update({
        collection: 'teacher-profiles',
        id: profiles.docs[0].id,
        data: {
          user: userDoc.id,
          evaluation: evaluation.id,
          evaluationScore: typeof evaluation.qualityScore === 'number' ? evaluation.qualityScore : null,
          approvalStatus: 'approved',
          approvedBy: adminUser.id,
          approvedAt: nowIso,
        },
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any>

      return {
        profile: serializeTeacherProfile(profile),
        user: { id: userDoc.id, email: userDoc.email, role: userDoc.role, created: userCreated },
        evaluationId: extractRelationId(evaluation.id),
        qualityScore: typeof evaluation.qualityScore === 'number' ? evaluation.qualityScore : null,
      }
    })
  } catch (err: unknown) {
    if (!(err instanceof ServiceError) && isUniqueConstraintError(err)) {
      throw new ServiceError('Concurrent approval conflicted with another request.', 409)
    }
    throw err
  }
}

async function loadProfileOrThrow(payload: Payload, id: number, txReq?: any) {
  const doc = (await (payload as any).findByID({
    collection: 'teacher-profiles',
    id,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })) as Record<string, any> | null
  if (!doc) {
    throw new ServiceError('Teacher profile not found.', 404, [
      { field: 'teacherId', message: 'Teacher profile does not exist.' },
    ])
  }
  return doc
}

/** `FR-D3` — PATCH /api/teachers/:id/availability */
export async function updateTeacherAvailability(
  payload: Payload,
  teacherId: number,
  body: Record<string, unknown>,
): Promise<SerializedTeacherProfile> {
  const data: Record<string, unknown> = {}
  if (body.availability !== undefined) {
    if (typeof body.availability !== 'string' || body.availability.trim().length === 0) {
      throw new ServiceError('availability must be a non-empty string.', 400, [
        { field: 'availability', message: 'availability must be a non-empty string.' },
      ])
    }
    if (body.availability.trim().length > 200) {
      throw new ServiceError('availability must be at most 200 characters.', 400, [
        { field: 'availability', message: 'availability must be at most 200 characters.' },
      ])
    }
    data.availability = body.availability.trim()
  }
  if (body.availabilityStatus !== undefined) {
    if (
      typeof body.availabilityStatus !== 'string' ||
      !(teacherAvailabilityStatuses as readonly string[]).includes(body.availabilityStatus)
    ) {
      throw new ServiceError(
        `availabilityStatus must be one of: ${teacherAvailabilityStatuses.join(', ')}.`,
        400,
        [{ field: 'availabilityStatus', message: 'Invalid availabilityStatus.' }],
      )
    }
    data.availabilityStatus = body.availabilityStatus
  }
  if (Object.keys(data).length === 0) {
    throw new ServiceError('Provide availability and/or availabilityStatus.', 400, [
      { field: 'availability', message: 'At least one field is required.' },
    ])
  }

  await loadProfileOrThrow(payload, teacherId)
  const updated = (await (payload as any).update({
    collection: 'teacher-profiles',
    id: teacherId,
    data,
    overrideAccess: true,
  })) as Record<string, any>
  return serializeTeacherProfile(updated)
}

/**
 * `FR-D3` — PATCH /api/teachers/:id/status. Updates the operational account status.
 * `suspended`/`active` are mirrored to the linked login account (a blocked account is
 * never unblocked here); `inactive` only removes the teacher from operational matching.
 */
export async function updateTeacherStatus(
  payload: Payload,
  teacherId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
): Promise<SerializedTeacherProfile> {
  const status = body.status
  if (
    typeof status !== 'string' ||
    !(teacherAccountStatuses as readonly string[]).includes(status)
  ) {
    throw new ServiceError(`status must be one of: ${teacherAccountStatuses.join(', ')}.`, 400, [
      { field: 'status', message: 'Invalid status.' },
    ])
  }

  return runInAdminTransaction(payload, adminUser, async (txReq) => {
    const profile = await loadProfileOrThrow(payload, teacherId, txReq)
    const updated = (await (payload as any).update({
      collection: 'teacher-profiles',
      id: teacherId,
      data: { account: { ...(profile.account ?? {}), status } },
      overrideAccess: true,
      req: txReq,
    })) as Record<string, any>

    const userId = extractRelationId(profile.user)
    if (userId !== null && (status === 'suspended' || status === 'active')) {
      const userDoc = (await (payload as any).findByID({
        collection: 'users',
        id: userId,
        disableErrors: true,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any> | null
      if (userDoc && userDoc.role === 'teacher') {
        if (status === 'suspended' && userDoc.status === 'active') {
          await (payload as any).update({
            collection: 'users',
            id: userId,
            data: { status: 'suspended' },
            overrideAccess: true,
            req: txReq,
          })
        } else if (status === 'active' && userDoc.status === 'suspended') {
          await (payload as any).update({
            collection: 'users',
            id: userId,
            data: { status: 'active' },
            overrideAccess: true,
            req: txReq,
          })
        }
      }
    }
    return serializeTeacherProfile(updated)
  })
}
