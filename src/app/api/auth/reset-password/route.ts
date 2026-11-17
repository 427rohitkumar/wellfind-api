import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { getClientIP, rateLimit } from '@/lib/auth'

const MAX_RESET_ATTEMPTS = 5

/**
 * POST /api/auth/reset-password
 * Resets the password using a valid, unused reset authorization token.
 * Invalidates the token after use (one-time).
 * Rate-limited by IP.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const limit = rateLimit(`reset-password:${ip}`, 5)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many reset attempts. Please try again later.' },
      { status: 429 }
    )
  }

  let body: {
    resetAuthToken?: string
    password?: string
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { resetAuthToken, password } = body

  if (!resetAuthToken || typeof resetAuthToken !== 'string') {
    return Response.json({ error: 'Reset authorization token is required.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return Response.json(
      { error: 'Password must be at least 8 characters.' },
      { status: 400 }
    )
  }

  try {
    const payload = await getPayload({ config })

    // Find user by reset auth token
    const users = await payload.find({
      collection: 'users',
      where: { resetAuthToken: { equals: resetAuthToken } },
      limit: 1,
    })

    if (users.docs.length === 0) {
      return Response.json(
        { error: 'Invalid or expired reset authorization.' },
        { status: 400 }
      )
    }

    const user = users.docs[0] as any

    // Check expiry
    if (!user.resetAuthExpiresAt) {
      return Response.json(
        { error: 'Invalid or expired reset authorization.' },
        { status: 400 }
      )
    }

    if (Date.now() > new Date(user.resetAuthExpiresAt).getTime()) {
      return Response.json(
        { error: 'Reset authorization has expired.' },
        { status: 400 }
      )
    }

    // Check one-time use
    if (user.resetAuthUsed) {
      return Response.json(
        { error: 'Reset authorization has already been used.' },
        { status: 400 }
      )
    }

    // Update password and invalidate reset authorization
    await (payload as any).update({
      collection: 'users',
      id: user.id,
      data: {
        password, // Payload hashes this automatically
        resetAuthToken: null,
        resetAuthExpiresAt: null,
        resetAuthUsed: true,
      },
    })

    return Response.json({
      message: 'Password has been reset successfully. You can now log in.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}