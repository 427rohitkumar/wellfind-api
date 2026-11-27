/**
 * Role-based access for the Wellfind Academic CRM (staff side).
 *
 * `super_admin` can do everything. Staff roles get access to specific modules, either read-only or full.
 * Teachers are not staff: they only use the teacher portal and never appear here.
 *
 * The same rules are enforced in three places so nobody can bypass the UI:
 *   1. API routes      (requireSuperAdmin -> canAccessRequest: module is taken from the URL, level from the HTTP method)
 *   2. Payload access  (collections call canRead / canWrite)
 *   3. CRM menus/routes (the CRM reads `permissions` from /api/auth/me)
 */

export const MODULES = [
  'dashboard',
  'student_inquiries',
  'students',
  'teacher_inquiries',
  'teachers',
  'tests',
  'allocation',
  'mail',
  'payments',
  'analytics',
  'users',
  'courses',
] as const
export type Module = (typeof MODULES)[number]
export type Level = 'read' | 'write'

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard',
  student_inquiries: 'Student inquiries',
  students: 'Students',
  teacher_inquiries: 'Teacher applications',
  teachers: 'Teachers',
  tests: 'Assessment tests',
  allocation: 'Teacher allocation',
  mail: 'Mail',
  payments: 'Payments & payouts',
  analytics: 'Google Analytics',
  users: 'User management',
  courses: 'Course Management',
}

export const STAFF_ROLES = [
  'course_manager',
  'operations_manager',
  'student_counselor',
  'teacher_coordinator',
  'finance_manager',
  'marketing_analyst',
  'support_executive',
] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

type Grants = Partial<Record<Module, Level>>

export const ROLE_DEFINITIONS: Record<StaffRole, { label: string; summary: string; grants: Grants }> = {
  course_manager: {
    label: 'Course Manager',
    summary: 'Manages online courses, roadmaps, curriculum categories, video materials, quizzes and course analytics. Dedicated studio workspace.',
    grants: { dashboard: 'write', courses: 'write' },
  },
  operations_manager: {
    label: 'Operations Manager',
    summary: 'Runs day-to-day operations: enquiries, students, teachers, tests, allocation and mail. Can view analytics. No payments or user management.',
    grants: { dashboard: 'write', student_inquiries: 'write', students: 'write', teacher_inquiries: 'write', teachers: 'write', tests: 'write', allocation: 'write', mail: 'write', analytics: 'read' },
  },
  student_counselor: {
    label: 'Student Counselor',
    summary: 'Handles parents and students: enquiries, students, tests and teacher allocation. Can see teachers. No payments, analytics or teacher onboarding.',
    grants: { dashboard: 'write', student_inquiries: 'write', students: 'write', tests: 'write', allocation: 'write', teachers: 'read' },
  },
  teacher_coordinator: {
    label: 'Teacher Coordinator',
    summary: 'Recruits and verifies teachers: applications, evaluation, KYC, approval and teacher accounts. Can see allocations. No student data or payments.',
    grants: { dashboard: 'write', teacher_inquiries: 'write', teachers: 'write', allocation: 'read', mail: 'read' },
  },
  finance_manager: {
    label: 'Finance Manager',
    summary: 'Owns money: payments, teacher fees, payouts and commission reports. Can view students, teachers and allocations (read-only).',
    grants: { dashboard: 'write', payments: 'write', students: 'read', teachers: 'read', allocation: 'read' },
  },
  marketing_analyst: {
    label: 'Marketing Analyst',
    summary: 'Tracks the website and leads: Google Analytics and student enquiries (read-only).',
    grants: { dashboard: 'write', analytics: 'read', student_inquiries: 'read' },
  },
  support_executive: {
    label: 'Support Executive',
    summary: 'Read-only view of enquiries, students, teachers, tests and allocations, to answer questions. Cannot change anything.',
    grants: { dashboard: 'write', student_inquiries: 'read', students: 'read', teacher_inquiries: 'read', teachers: 'read', tests: 'read', allocation: 'read' },
  },
}

export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role)
}

type UserLike = { role?: string | null; status?: string | null } | null | undefined

const blocked = (u: UserLike) => u?.status === 'blocked' || u?.status === 'suspended'

/** Any staff member (super admin or a staff role), not blocked. */
export function isStaffUser(user: UserLike): boolean {
  return Boolean(user && !blocked(user) && (user.role === 'super_admin' || isStaffRole(user.role)))
}

/** The level this user holds on a module, or null. */
export function levelOf(user: UserLike, module: Module): Level | null {
  if (!user || blocked(user)) return null
  if (user.role === 'super_admin') return 'write'
  if (isStaffRole(user.role)) return ROLE_DEFINITIONS[user.role].grants[module] ?? null
  return null
}

export function can(user: UserLike, module: Module, level: Level = 'read'): boolean {
  const have = levelOf(user, module)
  if (!have) return false
  return level === 'read' ? true : have === 'write'
}
export const canRead = (user: UserLike, module: Module) => can(user, module, 'read')
export const canWrite = (user: UserLike, module: Module) => can(user, module, 'write')

/** Map of module -> level, sent to the CRM so it can hide what a role cannot use. */
export function permissionsFor(user: UserLike): Partial<Record<Module, Level>> {
  const out: Partial<Record<Module, Level>> = {}
  for (const m of MODULES) {
    const l = levelOf(user, m)
    if (l) out[m] = l
  }
  return out
}

/** Which module an API path belongs to. Unknown paths fall back to `users` (super admin only). */
export function moduleForPath(pathname: string): Module | Module[] {
  const p = pathname.replace(/\/+$/, '')
  const starts = (prefix: string) => p === prefix || p.startsWith(`${prefix}/`)
  if (starts('/api/admin/analytics')) return 'analytics'
  if (starts('/api/admin/payments')) return 'payments'
  if (starts('/api/admin/mail')) return 'mail'
  if (starts('/api/admin/enquiry-tests')) return 'tests'
  if (starts('/api/admin/student-enquiries')) return 'student_inquiries'
  if (starts('/api/auth/admin/users')) return 'users'
  if (starts('/api/inquiries')) return ['student_inquiries', 'teacher_inquiries']
  // The Students page lists converted enquiries, so Students access also opens these endpoints.
  if (starts('/api/student-enquiries')) return ['student_inquiries', 'students']
  if (starts('/api/student-tests')) return 'students'
  if (starts('/api/students')) return 'students'
  if (starts('/api/teacher-allocations')) return 'allocation'
  if (starts('/api/teacher-enquiries')) return 'teacher_inquiries'
  if (starts('/api/courses') || starts('/api/admin/courses')) return 'courses'
  if (starts('/api/teachers')) return 'teachers'
  return 'users'
}

/** Can this user make this very request? Level comes from the HTTP method (GET/HEAD = read, the rest = write). */
export function canAccessRequest(user: UserLike, request: Request): boolean {
  const level: Level = request.method === 'GET' || request.method === 'HEAD' ? 'read' : 'write'
  const mods = moduleForPath(new URL(request.url).pathname)
  return (Array.isArray(mods) ? mods : [mods]).some((m) => can(user, m, level))
}
