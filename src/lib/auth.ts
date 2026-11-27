import type { User } from '@/payload-types'
import { isStaffRole } from '@/lib/permissions'

// In-memory rate limiter (per IP + endpoint). Use Redis in production.
const rateLimitStore = new Map<
  string,
  { count: number; resetAt: number }
>()

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_LOGIN_ATTEMPTS = 5
const MAX_OTP_ATTEMPTS = 5
const OTP_EXPIRY_MINUTES = 10
const OTP_RESEND_COOLDOWN_SECONDS = 60

// Supported roles — additional roles can be added here without rewriting authorization logic
export const SUPPORTED_ROLES = [
  'super_admin',
  'course_manager',
  'operations_manager',
  'student_counselor',
  'teacher_coordinator',
  'finance_manager',
  'marketing_analyst',
  'support_executive',
  'teacher',
  'student',
] as const
export type SupportedRole = (typeof SUPPORTED_ROLES)[number]

// Supported account statuses
export const SUPPORTED_STATUSES = ['active', 'blocked', 'suspended'] as const
export type SupportedStatus = (typeof SUPPORTED_STATUSES)[number]

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Checks and updates a rate-limit counter for a given key.
 */
export function rateLimit(key: string, max: number): RateLimitResult {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: max - 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt }
}

/**
 * Extracts the client IP from a Next.js request.
 */
export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIP = headers.get('x-real-ip')
  if (realIP) return realIP
  return 'unknown'
}

/**
 * Returns true if the user is a super_admin.
 */
export function isSuperAdminRole(
  user: { role?: string | null } | null | undefined,
): boolean {
  return Boolean(user && user.role === 'super_admin')
}

/**
 * Returns true if the user is a teacher.
 */
export function isTeacherRole(
  user: { role?: string | null } | null | undefined,
): boolean {
  return Boolean(user && user.role === 'teacher')
}

/**
 * Returns true if the user has any admin-level role (currently only super_admin).
 * Kept for backward compatibility; prefer isSuperAdminRole.
 */
export function isAdminRole(
  user: { role?: string | null } | null | undefined,
): boolean {
  return isSuperAdminRole(user) || isStaffRole(user?.role)
}

/**
 * Returns true if the account status blocks authentication.
 */
export function isBlockedOrSuspended(status: string | null | undefined): boolean {
  return status === 'blocked' || status === 'suspended'
}

/**
 * Returns true if the user is an active (non-blocked, non-suspended) super_admin.
 */
export function isActiveSuperAdmin(
  user: { role?: string | null; status?: string | null } | null | undefined,
): boolean {
  return Boolean(
    user && !isBlockedOrSuspended(user.status) && isSuperAdminRole(user),
  )
}

/**
 * Returns true if the status is a valid supported status.
 */
export function isValidStatus(status: string): status is SupportedStatus {
  return SUPPORTED_STATUSES.includes(status as SupportedStatus)
}

/**
 * Returns true if the role is a valid supported role.
 */
export function isValidRole(role: string): role is SupportedRole {
  return SUPPORTED_ROLES.includes(role as SupportedRole)
}

/**
 * Safely extracts an array of role strings from a user document or input.
 */
export function extractRoles(rawRoles: unknown, fallbackRole?: string | null): string[] {
  const result: string[] = []
  if (fallbackRole && typeof fallbackRole === 'string' && fallbackRole.trim()) {
    result.push(fallbackRole.trim())
  }
  if (Array.isArray(rawRoles)) {
    for (const item of rawRoles) {
      if (typeof item === 'string' && item.trim()) {
        result.push(item.trim())
      } else if (item && typeof item === 'object') {
        const val = (item as any).role || (item as any).value || (item as any).id
        if (typeof val === 'string' && val.trim()) {
          result.push(val.trim())
        }
      }
    }
  }
  return Array.from(new Set(result))
}

/**
 * Configuration constants exported for route handlers.
 */
export const AUTH_CONFIG = {
  rateLimitWindowMs: RATE_LIMIT_WINDOW_MS,
  maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
  maxOtpAttempts: MAX_OTP_ATTEMPTS,
  otpExpiryMinutes: OTP_EXPIRY_MINUTES,
  otpResendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
} as const