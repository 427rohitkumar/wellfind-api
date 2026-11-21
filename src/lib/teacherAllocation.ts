export const allocationStatuses = [
  'assigned',
  'accepted',
  'rejected',
  'active',
  'completed',
  'cancelled',
] as const
export type AllocationStatus = (typeof allocationStatuses)[number]

/** Statuses that occupy the (student, teacher, subject) slot. */
export const ACTIVE_ALLOCATION_STATUSES: readonly AllocationStatus[] = [
  'assigned',
  'accepted',
  'active',
]

export const VALID_ALLOCATION_TRANSITIONS: Record<AllocationStatus, readonly AllocationStatus[]> = {
  assigned: ['accepted', 'rejected', 'cancelled'],
  accepted: ['active', 'cancelled'],
  active: ['completed', 'cancelled'],
  rejected: [],
  completed: [],
  cancelled: [],
}

/** Statuses a teacher may set on their own allocation. */
export const TEACHER_SETTABLE_STATUSES: readonly AllocationStatus[] = ['accepted', 'rejected']

export function isValidAllocationStatus(v: unknown): v is AllocationStatus {
  return typeof v === 'string' && (allocationStatuses as readonly string[]).includes(v)
}

export function isActiveAllocationStatus(s: unknown): boolean {
  return (ACTIVE_ALLOCATION_STATUSES as readonly unknown[]).includes(s)
}

/** Unique key for one live allocation of a subject to a teacher for a student. */
export function buildActiveKey(studentId: number, teacherId: number, subject: string): string {
  return `${studentId}:${teacherId}:${subject.toLowerCase().replace(/\s+/g, ' ').trim()}`
}

export interface AllocationTerms {
  monthlyFee: number
  commissionPercent: number
  commissionAmount: number
  teacherPayout: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Derives Wellfind's commission and the teacher's payout from fee and commission %. */
export function computeAllocationTerms(monthlyFee: number, commissionPercent: number): AllocationTerms {
  const commissionAmount = round2((monthlyFee * commissionPercent) / 100)
  return {
    monthlyFee: round2(monthlyFee),
    commissionPercent,
    commissionAmount,
    teacherPayout: round2(monthlyFee - commissionAmount),
  }
}
