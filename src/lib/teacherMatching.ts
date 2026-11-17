/**
 * Pure matching helpers for FR-E1 (subject, class level, locality, availability).
 * Teacher class levels / student class are free text, so they are normalized
 * conservatively: UKG = 0, "Class N" = N, ranges ("8-10", "UKG to 5") and "all".
 */

export const matchStatuses = ['eligible', 'shortlisted', 'rejected'] as const
export type MatchStatus = (typeof matchStatuses)[number]

export function isValidMatchStatus(v: unknown): v is MatchStatus {
  return typeof v === 'string' && (matchStatuses as readonly string[]).includes(v)
}

const norm = (s: unknown): string =>
  typeof s === 'string' ? s.toLowerCase().replace(/\s+/g, ' ').trim() : ''

/** Parses a class label into a [min,max] range, or 'all', or null when unknown. */
export function parseClassRange(raw: unknown): { min: number; max: number } | 'all' | null {
  const text = norm(raw)
  if (!text) return null
  if (/\ball\b/.test(text)) return 'all'
  const values: number[] = []
  if (/\bukg\b/.test(text)) values.push(0)
  for (const m of text.matchAll(/\d+/g)) values.push(Number(m[0]))
  if (values.length === 0) return null
  return { min: Math.min(...values), max: Math.max(...values) }
}

export function classMatches(studentClass: unknown, teacherLevels: unknown): boolean {
  const student = parseClassRange(studentClass)
  const teacher = parseClassRange(teacherLevels)
  if (!student || !teacher) return false
  if (teacher === 'all') return true
  if (student === 'all') return false
  return student.min >= teacher.min && student.max <= teacher.max
}

function textOverlaps(values: string[], other: unknown): boolean {
  const t = norm(other)
  if (!t) return false
  return values.map(norm).some((v) => v && (v === t || v.includes(t) || t.includes(v)))
}

export function subjectMatches(studentSubjects: string[], teacherSubject: unknown): boolean {
  return textOverlaps(studentSubjects, teacherSubject)
}

export function localityMatches(studentLocalities: string[], teacherLocality: unknown): boolean {
  return textOverlaps(studentLocalities, teacherLocality)
}

export interface MatchCriteria {
  subject: boolean
  classLevel: boolean
  locality: boolean
  availability: boolean
}

export interface StudentMatchInput {
  subjects: string[]
  studentClass: string
  localities: string[]
}

export interface TeacherMatchInput {
  primarySubject?: unknown
  classLevels?: unknown
  locality?: unknown
  availabilityStatus?: unknown
}

export function evaluateMatch(student: StudentMatchInput, teacher: TeacherMatchInput): MatchCriteria {
  return {
    subject: subjectMatches(student.subjects, teacher.primarySubject),
    classLevel: classMatches(student.studentClass, teacher.classLevels),
    locality: localityMatches(student.localities, teacher.locality),
    // A teacher marked "allocated" (fully booked) is not available for new matches.
    availability: (teacher.availabilityStatus ?? 'free') !== 'allocated',
  }
}

export function isEligible(c: MatchCriteria): boolean {
  return c.subject && c.classLevel && c.locality && c.availability
}
