import type { Payload } from 'payload'
import type { AuthUserRecord } from '@/lib/api'
import { extractRelationId, extractSubjectNames } from '@/lib/studentValidation'
import {
  evaluateMatch,
  isEligible,
  isValidMatchStatus,
  matchStatuses,
  type MatchCriteria,
  type StudentMatchInput,
} from '@/lib/teacherMatching'
import { ServiceError } from '@/services/studentService'

export async function loadStudentForMatching(
  payload: Payload,
  studentId: number,
): Promise<{ doc: Record<string, any>; input: StudentMatchInput }> {
  const doc = (await (payload as any).findByID({
    collection: 'students',
    id: studentId,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
  })) as Record<string, any> | null
  if (!doc) {
    throw new ServiceError('Student not found.', 404, [
      { field: 'studentId', message: 'Student does not exist.' },
    ])
  }
  const subjects = [...extractSubjectNames(doc.subjects)]
  if (typeof doc.customSubject === 'string' && doc.customSubject.trim()) {
    subjects.push(doc.customSubject)
  }
  const localities = [doc.locality, doc.customLocality].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  )
  return { doc, input: { subjects, studentClass: String(doc.studentClass ?? ''), localities } }
}

export function isOperationalTeacher(t: Record<string, any>): boolean {
  return t.approvalStatus === 'approved' && (t.account?.status ?? 'active') === 'active'
}

function toCandidate(t: Record<string, any>, criteria: MatchCriteria) {
  return {
    teacherId: t.id,
    name: t.name,
    primarySubject: t.primarySubject,
    classLevel: t.classLevels ?? null,
    locality: t.locality ?? null,
    qualityScore: typeof t.evaluationScore === 'number' ? t.evaluationScore : null,
    availability: t.availability ?? null,
    availabilityStatus: t.availabilityStatus ?? 'free',
    matchStatus: 'eligible' as const,
    criteria,
  }
}

/** `FR-E1` — Eligible approved+active teachers for a student, best quality first. Never allocates. */
export async function findMatchingTeachers(payload: Payload, studentId: number) {
  const { input } = await loadStudentForMatching(payload, studentId)
  const teachers = await (payload as any).find({
    collection: 'teacher-profiles',
    where: { approvalStatus: { equals: 'approved' } },
    limit: 1000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
  })
  const matches = (teachers.docs as Record<string, any>[])
    .filter(isOperationalTeacher)
    .map((t) => ({ t, criteria: evaluateMatch(input, t) }))
    .filter(({ criteria }) => isEligible(criteria))
    .map(({ t, criteria }) => toCandidate(t, criteria))
    .sort(
      (a, b) =>
        (b.qualityScore ?? -1) - (a.qualityScore ?? -1) || String(a.name).localeCompare(String(b.name)),
    )
  return { studentId, total: matches.length, matches }
}

/** `FR-E2` — Persist a matching decision with the criteria snapshot used. */
export async function saveMatchDecision(
  payload: Payload,
  studentId: number,
  body: Record<string, unknown>,
  adminUser: AuthUserRecord,
) {
  const teacherId = typeof body.teacherId === 'number' ? body.teacherId : Number(body.teacherId)
  if (!Number.isSafeInteger(teacherId) || teacherId <= 0) {
    throw new ServiceError('teacherId must be a positive integer.', 400, [
      { field: 'teacherId', message: 'teacherId must be a positive integer.' },
    ])
  }
  const matchStatus = body.matchStatus ?? 'shortlisted'
  if (!isValidMatchStatus(matchStatus)) {
    throw new ServiceError(`matchStatus must be one of: ${matchStatuses.join(', ')}.`, 400, [
      { field: 'matchStatus', message: 'Invalid matchStatus.' },
    ])
  }
  let adminNotes: string | undefined
  if (body.adminNotes !== undefined) {
    if (typeof body.adminNotes !== 'string' || body.adminNotes.length > 2000) {
      throw new ServiceError('adminNotes must be a string of at most 2000 characters.', 400, [
        { field: 'adminNotes', message: 'Invalid adminNotes.' },
      ])
    }
    adminNotes = body.adminNotes.trim()
  }

  const { input } = await loadStudentForMatching(payload, studentId)
  const teacher = (await (payload as any).findByID({
    collection: 'teacher-profiles',
    id: teacherId,
    disableErrors: true,
    depth: 0,
    overrideAccess: true,
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
  const criteria = evaluateMatch(input, teacher)
  if (matchStatus !== 'rejected' && !isEligible(criteria)) {
    throw new ServiceError('Teacher does not meet the matching criteria for this student.', 409, [
      { field: 'teacherId', message: 'Teacher is not eligible for this student.' },
    ])
  }

  const created = (await (payload as any).create({
    collection: 'teacher-matches',
    data: {
      student: studentId,
      teacher: teacherId,
      matchStatus,
      criteriaSnapshot: {
        student: input,
        teacher: {
          primarySubject: teacher.primarySubject,
          classLevels: teacher.classLevels ?? null,
          locality: teacher.locality ?? null,
          availability: teacher.availability ?? null,
          availabilityStatus: teacher.availabilityStatus ?? 'free',
        },
        criteria,
      },
      qualityScore: typeof teacher.evaluationScore === 'number' ? teacher.evaluationScore : null,
      ...(adminNotes ? { adminNotes } : {}),
      createdBy: adminUser.id,
    },
    overrideAccess: true,
  })) as Record<string, any>

  return {
    id: created.id,
    studentId,
    teacherId,
    matchStatus: created.matchStatus,
    criteriaSnapshot: created.criteriaSnapshot,
    qualityScore: created.qualityScore ?? null,
    adminNotes: created.adminNotes ?? null,
    createdBy: extractRelationId(created.createdBy),
    createdAt: created.createdAt,
  }
}
