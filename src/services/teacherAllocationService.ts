import { isStaffUser } from '@/lib/permissions'
import { commitTransaction, initTransaction, killTransaction, type Payload } from 'payload'
import { isUniqueConstraintError, type AuthUserRecord } from '@/lib/api'
import {
  allocationStatuses,
  buildActiveKey,
  computeAllocationTerms,
  isActiveAllocationStatus,
  isValidAllocationStatus,
  TEACHER_SETTABLE_STATUSES,
  VALID_ALLOCATION_TRANSITIONS,
  type AllocationStatus,
} from '@/lib/teacherAllocation'
import { classMatches, subjectMatches } from '@/lib/teacherMatching'
import {
  extractRelationId,
  extractSubjectNames,
  parsePaginationParams,
  parsePositiveIntId,
} from '@/lib/studentValidation'
import { ServiceError } from '@/services/studentService'
import { isOperationalTeacher } from '@/services/teacherMatchingService'

const SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'allocatedAt', 'status', 'id'])

async function runInTransaction<T>(
  payload: Payload,
  user: AuthUserRecord,
  fn: (txReq: any) => Promise<T>,
): Promise<T> {
  const txReq: any = { payload, user }
  const started = await initTransaction(txReq)
  try {
    const result = await fn(txReq)
    if (started) await commitTransaction(txReq)
    return result
  } catch (err) {
    if (started) await killTransaction(txReq)
    throw err
  }
}

export function serializeAllocation(doc: Record<string, any>) {
  const student = doc.student && typeof doc.student === 'object' ? doc.student : null
  const teacher = doc.teacher && typeof doc.teacher === 'object' ? doc.teacher : null
  return {
    id: doc.id,
    studentId: extractRelationId(doc.student),
    teacherId: extractRelationId(doc.teacher),
    student: student
      ? {
          id: student.id,
          name: student.name,
          gender: student.studentGender ?? null,
          studentClass: student.studentClass,
          locality: student.locality,
          preferredTiming: student.preferredTiming,
          budgetRange: student.budgetRange ?? null,
          subjects: extractSubjectNames(student.subjects),
        }
      : null,
    teacher: teacher
      ? { id: teacher.id, name: teacher.name, primarySubject: teacher.primarySubject }
      : null,
    subject: doc.subject,
    status: doc.status,
    allocationNotes: doc.allocationNotes ?? null,
    monthlyFee: doc.monthlyFee ?? null,
    commissionPercent: doc.commissionPercent ?? null,
    commissionAmount: doc.commissionAmount ?? null,
    teacherPayout: doc.teacherPayout ?? null,
    allocatedBy: extractRelationId(doc.allocatedBy),
    allocatedAt: doc.allocatedAt,
    statusHistory: Array.isArray(doc.statusHistory)
      ? doc.statusHistory.map((h: Record<string, any>) => ({
          fromStatus: h.fromStatus ?? null,
          toStatus: h.toStatus,
          reason: h.reason ?? null,
          changedBy: extractRelationId(h.changedBy),
          changedAt: h.changedAt ?? null,
        }))
      : [],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function badRequest(field: string, message: string): ServiceError {
  return new ServiceError(message, 400, [{ field, message }])
}

function requiredId(raw: unknown, field: string): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? parsePositiveIntId(raw) : null
  if (!n || !Number.isSafeInteger(n) || n <= 0) {
    throw badRequest(field, `${field} must be a positive integer.`)
  }
  return n
}

function optionalNotes(raw: unknown): string | undefined {
  if (raw === undefined) return undefined
  if (typeof raw !== 'string' || raw.length > 2000) {
    throw badRequest('allocationNotes', 'allocationNotes must be a string of at most 2000 characters.')
  }
  return raw.trim()
}

/**
 * Parses optional commercial terms. Fee and commission % must be supplied together
 * (or fall back to `existing` values on update). Returns undefined when neither is given.
 */
function parseTerms(body: Record<string, unknown>, existing?: Record<string, any>) {
  const feeRaw = body.monthlyFee
  const pctRaw = body.commissionPercent
  if (feeRaw === undefined && pctRaw === undefined) return undefined
  const fee = feeRaw === undefined ? existing?.monthlyFee : feeRaw
  const pct = pctRaw === undefined ? existing?.commissionPercent : pctRaw
  if (typeof fee !== 'number' || !Number.isFinite(fee) || fee <= 0 || fee > 10_000_000) {
    throw badRequest('monthlyFee', 'monthlyFee must be a positive number.')
  }
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) {
    throw badRequest('commissionPercent', 'commissionPercent must be a number between 0 and 100.')
  }

  const round2 = (n: number) => Math.round(n * 100) / 100
  if (
    typeof body.teacherPayout === 'number' &&
    Number.isFinite(body.teacherPayout) &&
    body.teacherPayout >= 0 &&
    body.teacherPayout <= fee
  ) {
    const teacherPayout = round2(body.teacherPayout)
    const commissionAmount = round2(fee - teacherPayout)
    return {
      monthlyFee: round2(fee),
      commissionPercent: round2(pct),
      commissionAmount,
      teacherPayout,
    }
  }

  return computeAllocationTerms(fee, pct)
}

/** Finds the teacher profile linked to a logged-in teacher user. */
export async function findTeacherProfileForUser(
  payload: Payload,
  userId: number,
): Promise<Record<string, any> | null> {
  const res = await (payload as any).find({
    collection: 'teacher-profiles',
    where: { user: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (res.docs[0]) return res.docs[0] as Record<string, any>

  // Approved before the profile was linked to the login: find it through the application and link it now.
  const enq = await (payload as any).find({
    collection: 'teacher-enquiries',
    where: { teacherUser: { equals: userId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const enquiry = enq.docs[0] as Record<string, any> | undefined
  if (!enquiry) return null
  const profileId = typeof enquiry.teacherProfile === 'object' ? enquiry.teacherProfile?.id : enquiry.teacherProfile
  const byLink = profileId
    ? await (payload as any).find({ collection: 'teacher-profiles', where: { id: { equals: profileId } }, limit: 1, depth: 0, overrideAccess: true })
    : await (payload as any).find({ collection: 'teacher-profiles', where: { teacherEnquiry: { equals: enquiry.id } }, limit: 1, depth: 0, overrideAccess: true })
  const profile = byLink.docs[0] as Record<string, any> | undefined
  if (!profile) return null
  // Only a profile created for this very application may be linked to the login.
  const owner = typeof profile.teacherEnquiry === 'object' ? profile.teacherEnquiry?.id : profile.teacherEnquiry
  if (owner !== enquiry.id) return null
  if (!profile.user) {
    await (payload as any).update({ collection: 'teacher-profiles', id: profile.id, data: { user: userId }, overrideAccess: true }).catch(() => undefined)
  }
  return { ...profile, user: userId }
}

/** `FR-F1` — Creates a final allocation atomically with duplicate protection. */
export async function createAllocation(
  payload: Payload,
  body: Record<string, unknown>,
  admin: AuthUserRecord,
) {
  const studentId = requiredId(body.studentId, 'studentId')
  const teacherId = requiredId(body.teacherId, 'teacherId')
  if (typeof body.subject !== 'string' || body.subject.trim().length === 0) {
    throw badRequest('subject', 'subject is required.')
  }
  const subject = body.subject.trim()
  if (subject.length > 100) throw badRequest('subject', 'subject must be at most 100 characters.')
  const allocationNotes = optionalNotes(body.allocationNotes)
  const terms = parseTerms(body)

  try {
    const created = await runInTransaction(payload, admin, async (txReq) => {
      const student = (await (payload as any).findByID({
        collection: 'students',
        id: studentId,
        disableErrors: true,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any> | null
      if (!student) {
        throw new ServiceError('Student not found.', 404, [
          { field: 'studentId', message: 'Student does not exist.' },
        ])
      }
      if (student.status !== 'active') {
        throw new ServiceError('Student is not active.', 409, [
          { field: 'studentId', message: 'Student must be active.' },
        ])
      }
      const teacher = (await (payload as any).findByID({
        collection: 'teacher-profiles',
        id: teacherId,
        disableErrors: true,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any> | null
      if (!teacher) {
        throw new ServiceError('Teacher not found.', 404, [
          { field: 'teacherId', message: 'Teacher profile does not exist.' },
        ])
      }
      if (!isOperationalTeacher(teacher)) {
        throw new ServiceError('Teacher is not approved and active.', 409, [
          { field: 'teacherId', message: 'Teacher must be approved and active.' },
        ])
      }

      const studentSubjects = [...extractSubjectNames(student.subjects)]
      if (typeof student.customSubject === 'string' && student.customSubject.trim()) {
        studentSubjects.push(student.customSubject)
      }
      if (!subjectMatches(studentSubjects, subject) || !subjectMatches([subject], teacher.primarySubject)) {
        throw new ServiceError('Teacher and student are not compatible for this subject.', 409, [
          { field: 'subject', message: 'Subject must be required by the student and taught by the teacher.' },
        ])
      }
      if (!classMatches(student.studentClass, teacher.classLevels)) {
        throw new ServiceError('Teacher does not teach the student class level.', 409, [
          { field: 'teacherId', message: 'Teacher class levels do not cover the student class.' },
        ])
      }

      const activeKey = buildActiveKey(studentId, teacherId, subject)
      const dup = await (payload as any).find({
        collection: 'teacher-allocations',
        where: { activeKey: { equals: activeKey } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req: txReq,
      })
      if (dup.docs.length > 0) {
        throw new ServiceError('An active allocation already exists for this student, teacher and subject.', 409)
      }

      const nowIso = new Date().toISOString()
      const created = (await (payload as any).create({
        collection: 'teacher-allocations',
        data: {
          student: studentId,
          teacher: teacherId,
          subject,
          status: 'assigned',
          ...(allocationNotes ? { allocationNotes } : {}),
          ...(terms ?? {}),
          allocatedBy: admin.id,
          allocatedAt: nowIso,
          activeKey,
          statusHistory: [
            { fromStatus: null, toStatus: 'assigned', changedBy: admin.id, changedAt: nowIso },
          ],
        },
        overrideAccess: true,
        req: txReq,
      })) as Record<string, any>

      // Moving the student into a live allocation also closes the loop on the enquiry:
      // `converted` (waiting in the allocation queue) -> `allocated`.
      const enquiryId = extractRelationId(student.studentEnquiry)
      if (enquiryId) {
        const enquiry = (await (payload as any).findByID({
          collection: 'student-enquiries',
          id: enquiryId,
          disableErrors: true,
          depth: 0,
          overrideAccess: true,
          req: txReq,
        })) as Record<string, any> | null
        if (enquiry?.enquiryStatus === 'converted') {
          await (payload as any).update({
            collection: 'student-enquiries',
            id: enquiryId,
            data: { enquiryStatus: 'allocated' },
            overrideAccess: true,
            req: txReq,
          })
        }
      }
      return serializeAllocation(created)
    })
    // Tell the teacher about the new student (after commit; never blocks the allocation).
    const { notifyTeacherAllocated } = await import('@/services/mailNotifications')
    await notifyTeacherAllocated(payload, created.id)
    const { pushTeacherAllocated } = await import('@/services/pushEvents')
    pushTeacherAllocated(payload, created.id)
    return created
  } catch (err) {
    if (!(err instanceof ServiceError) && isUniqueConstraintError(err)) {
      throw new ServiceError('An active allocation already exists for this student, teacher and subject.', 409)
    }
    throw err
  }
}

/** `FR-F2` — Paginated list. `teacherProfileId` scopes the list (used by `/my`). */
export async function listAllocations(
  payload: Payload,
  searchParams: URLSearchParams,
  scope: { teacherProfileId?: number } = {},
) {
  const { page, limit } = parsePaginationParams(searchParams)
  const sortParam = searchParams.get('sort') || '-createdAt'
  const sortField = sortParam.startsWith('-') ? sortParam.slice(1) : sortParam
  const sort = SORT_FIELDS.has(sortField) ? sortParam : '-createdAt'

  const and: Record<string, any>[] = []
  const status = searchParams.get('status')
  if (status) {
    if (!isValidAllocationStatus(status)) {
      throw badRequest('status', `Invalid status. Allowed values: ${allocationStatuses.join(', ')}.`)
    }
    and.push({ status: { equals: status } })
  }
  if (scope.teacherProfileId !== undefined) {
    and.push({ teacher: { equals: scope.teacherProfileId } })
  } else {
    for (const [param, field] of [['studentId', 'student'], ['teacherId', 'teacher']] as const) {
      const raw = searchParams.get(param)
      if (raw !== null) {
        const id = parsePositiveIntId(raw)
        if (!id) throw badRequest(param, `${param} must be a positive integer.`)
        and.push({ [field]: { equals: id } })
      }
    }
  }

  const result = await (payload as any).find({
    collection: 'teacher-allocations',
    where: and.length ? { and } : {},
    page,
    limit,
    sort,
    depth: 1,
    overrideAccess: true,
  })
  return {
    docs: (result.docs as Record<string, any>[]).map(serializeAllocation),
    totalDocs: Number(result.totalDocs ?? 0),
    totalPages: Number(result.totalPages ?? 1),
    page: Number(result.page ?? page),
    limit: Number(result.limit ?? limit),
    hasNextPage: Boolean(result.hasNextPage),
    hasPrevPage: Boolean(result.hasPrevPage),
  }
}

async function loadAllocationForUser(
  payload: Payload,
  id: number,
  user: AuthUserRecord,
  txReq?: any,
): Promise<{ doc: Record<string, any>; isAdmin: boolean }> {
  const doc = (await (payload as any).findByID({
    collection: 'teacher-allocations',
    id,
    disableErrors: true,
    depth: txReq ? 0 : 1,
    overrideAccess: true,
    ...(txReq ? { req: txReq } : {}),
  })) as Record<string, any> | null
  const notFound = new ServiceError('Allocation not found.', 404, [
    { field: 'allocationId', message: 'Allocation does not exist.' },
  ])
  if (!doc) throw notFound
  if (isStaffUser(user)) return { doc, isAdmin: true }
  if (user.role !== 'teacher') throw notFound
  const profile = await findTeacherProfileForUser(payload, user.id)
  // Other teachers' allocations are reported as not found to avoid leaking existence.
  if (!profile || extractRelationId(doc.teacher) !== profile.id) throw notFound
  return { doc, isAdmin: false }
}

/** `FR-F2` — Single allocation: admins see all; teachers only their own. */
export async function getAllocation(payload: Payload, id: number, user: AuthUserRecord) {
  const { doc } = await loadAllocationForUser(payload, id, user)
  return serializeAllocation(doc)
}

/** `FR-F2` — Updates permitted fields (admin only): `allocationNotes`, `monthlyFee`, `commissionPercent`. */
export async function updateAllocation(payload: Payload, id: number, body: Record<string, unknown>) {
  const allowed = new Set(['allocationNotes', 'monthlyFee', 'commissionPercent'])
  const unknown = Object.keys(body).filter((k) => !allowed.has(k))
  if (unknown.length > 0) {
    throw badRequest(
      unknown[0]!,
      `Field "${unknown[0]}" cannot be updated. Only allocationNotes, monthlyFee and commissionPercent are permitted.`,
    )
  }
  const notes = optionalNotes(body.allocationNotes)
  if (notes === undefined && body.monthlyFee === undefined && body.commissionPercent === undefined) {
    throw badRequest('allocationNotes', 'Provide allocationNotes, monthlyFee or commissionPercent.')
  }
  const existing = await (payload as any).findByID({
    collection: 'teacher-allocations',
    id,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
  })
  if (!existing) {
    throw new ServiceError('Allocation not found.', 404, [
      { field: 'allocationId', message: 'Allocation does not exist.' },
    ])
  }
  const terms = parseTerms(body, existing)
  const updated = await (payload as any).update({
    collection: 'teacher-allocations',
    id,
    data: {
      ...(notes !== undefined ? { allocationNotes: notes } : {}),
      ...(terms ?? {}),
    },
    depth: 1,
    overrideAccess: true,
  })
  return serializeAllocation(updated)
}

/** `FR-F2` — Status transition. Admin: any valid transition. Teacher: accept/reject own `assigned`. */
export async function updateAllocationStatus(
  payload: Payload,
  id: number,
  body: Record<string, unknown>,
  user: AuthUserRecord,
) {
  if (!isValidAllocationStatus(body.status)) {
    throw badRequest('status', `status must be one of: ${allocationStatuses.join(', ')}.`)
  }
  const next: AllocationStatus = body.status
  let reason: string | undefined
  if (body.reason !== undefined) {
    if (typeof body.reason !== 'string' || body.reason.length > 2000) {
      throw badRequest('reason', 'reason must be a string of at most 2000 characters.')
    }
    reason = body.reason.trim() || undefined
  }

  let byTeacher = false
  const result = await runInTransaction(payload, user, async (txReq) => {
    const { doc, isAdmin } = await loadAllocationForUser(payload, id, user, txReq)
    byTeacher = !isAdmin
    if (!isAdmin && !TEACHER_SETTABLE_STATUSES.includes(next)) {
      throw new ServiceError('Teachers may only accept or reject their own allocations.', 403)
    }
    const current = String(doc.status) as AllocationStatus
    if (!VALID_ALLOCATION_TRANSITIONS[current]?.includes(next)) {
      throw new ServiceError(`Invalid status transition from '${current}' to '${next}'.`, 409, [
        { field: 'status', message: `Cannot change status from '${current}' to '${next}'.` },
      ])
    }
    const nowIso = new Date().toISOString()
    const history = Array.isArray(doc.statusHistory) ? doc.statusHistory : []
    const updated = (await (payload as any).update({
      collection: 'teacher-allocations',
      id,
      data: {
        status: next,
        // Free the unique slot once the allocation is no longer live.
        activeKey: isActiveAllocationStatus(next)
          ? buildActiveKey(
              Number(extractRelationId(doc.student)),
              Number(extractRelationId(doc.teacher)),
              String(doc.subject),
            )
          : null,
        statusHistory: [
          ...history,
          {
            fromStatus: current,
            toStatus: next,
            ...(reason ? { reason } : {}),
            changedBy: user.id,
            changedAt: nowIso,
          },
        ],
      },
      depth: 1,
      overrideAccess: true,
      req: txReq,
    })) as Record<string, any>
    return serializeAllocation(updated)
  })
  const { pushAllocationStatus } = await import('@/services/pushEvents')
  pushAllocationStatus(payload, id, next, byTeacher)
  return result
}
