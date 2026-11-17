import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { getClientIP, isAdminRole, rateLimit } from '@/lib/auth'

/**
 * PostgreSQL error codes that indicate a temporary database lock issue.
 * These are safe to retry — typically caused by schema:push holding an
 * ACCESS EXCLUSIVE lock on the `users` table during dev startup.
 */
const RETRYABLE_DB_CODES = new Set(['54000', '40P01', '57014', '57P01'])

function isRetryableDbError(err: unknown): boolean {
  if (err instanceof Error && 'code' in err) {
    return RETRYABLE_DB_CODES.has(String((err as { code?: string }).code))
  }
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.includes('lock timeout') ||
    message.includes('deadlock detected') ||
    message.includes('canceling statement due to statement timeout')
  )
}

/**
 * Runs an async function with exponential backoff retries for transient
 * database lock errors. Useful during `payload schema:push` on dev startup
 * when the `users` table may be briefly locked.
 */
async function withDbRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 500 }: { maxRetries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === maxRetries || !isRetryableDbError(err)) {
        throw err
      }
      const delay = baseDelayMs * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}

/**
 * POST /api/auth/login
 * Authenticates a user with email and password using Payload's built-in auth.
 * Returns a JWT token (accessToken) and the user (without sensitive fields).
 * Rate-limited by IP to prevent brute-force attacks.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const rateLimitKey = `login:${ip}`

  const limit = rateLimit(rateLimitKey, 5)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429 }
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { email, password } = body

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string') {
    return Response.json({ error: 'Password is required.' }, { status: 400 })
  }

  try {
    const payload = await getPayload({ config })

    const result: any = await withDbRetry(() =>
      payload.login({
        collection: 'users',
        data: { email, password },
      }),
    )

    if (!result.token || !result.user) {
      return Response.json({ error: 'Invalid email or password.' }, { status: 401 })
    }

    const user = result.user as any

    // Check account status — suspended or inactive accounts cannot log in
    if (user.status === 'suspended' || user.status === 'inactive') {
      return Response.json(
        { error: 'Account is not active. Please contact support.' },
        { status: 403 }
      )
    }

    return Response.json({
      message: 'Login successful.',
      token: result.token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}