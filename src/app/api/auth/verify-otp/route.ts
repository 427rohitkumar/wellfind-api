import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { compareOTP } from '@/lib/otp'
import { getClientIP, rateLimit } from '@/lib/auth'

const MAX_OTP_ATTEMPTS = 5

/**
 * POST /api/auth/verify-otp
 * Verifies a 4-digit OTP for a given email.
 * On success, issues a short-lived, single-use reset authorization token.
 * Enforces attempt limits and prevents brute-force attacks.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const limit = rateLimit(`verify-otp:${ip}`, 10)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many verification attempts. Please try again later.' },
      { status: 429 }
    )
  }

  let body: { email?: string; otp?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { email, otp } = body

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Email is required.' }, { status: 400 })
  }
  if (!otp || typeof otp !== 'string' || !/^\d{4}$/.test(otp)) {
    return Response.json({ error: 'A valid 4-digit OTP is required.' }, { status: 400 })
  }

  try {
    const payload = await getPayload({ config })

    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    })

    if (users.docs.length === 0) {
      return Response.json({ error: 'Invalid or expired OTP.' }, { status: 400 })
    }

    const user = users.docs[0] as any

    // Check OTP expiry
    if (!user.otpHash || !user.otpExpiresAt) {
      return Response.json({ error: 'Invalid or expired OTP.' }, { status: 400 })
    }

    const expiresAt = new Date(user.otpExpiresAt).getTime()
    if (Date.now() > expiresAt) {
      return Response.json({ error: 'OTP has expired.' }, { status: 400 })
    }

    // Check attempt limit
    const attempts = user.otpAttempts || 0
    if (attempts >= MAX_OTP_ATTEMPTS) {
      return Response.json(
        { error: 'Too many failed OTP attempts. Please request a new OTP.' },
        { status: 429 }
      )
    }

    // Verify OTP
    const valid = compareOTP(otp, email, user.otpHash)

    if (!valid) {
      // Increment failed attempts
      await (payload as any).update({
        collection: 'users',
        id: user.id,
        data: { otpAttempts: attempts + 1 },
      })
      return Response.json({ error: 'Invalid OTP.' }, { status: 400 })
    }

    // OTP is valid — issue a short-lived, single-use reset authorization token
    const crypto = await import('crypto')
    const resetAuthToken = crypto.randomBytes(32).toString('hex')
    const resetAuthExpiresAt = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    await (payload as any).update({
      collection: 'users',
      id: user.id,
      data: {
        // Clear OTP fields
        otpHash: null,
        otpExpiresAt: null,
        otpAttempts: 0,
        otpLastSentAt: null,
        // Set reset authorization
        resetAuthToken,
        resetAuthExpiresAt,
        resetAuthUsed: false,
      },
    })

    return Response.json({
      message: 'OTP verified. You may now reset your password.',
      // In a production frontend, this token would be opaque and single-use.
      // We return it here because the API is backend-only and the caller
      // (admin dashboard or integration) needs it for the reset-password step.
      resetAuthToken,
      resetAuthExpiresAt,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}