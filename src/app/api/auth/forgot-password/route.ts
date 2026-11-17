import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { generateOTP, hashOTP } from '@/lib/otp'
import { sendOTPEmail } from '@/lib/email'
import { getClientIP, rateLimit } from '@/lib/auth'

const OTP_EXPIRY_MINUTES = 10

/**
 * POST /api/auth/forgot-password
 * Generates a 4-digit OTP, hashes it, stores it with expiry, and emails it.
 * Returns a generic response for unknown emails to prevent account enumeration.
 * Rate-limited by IP.
 */
export async function POST(request: Request): Promise<Response> {
  const ip = getClientIP(request.headers)
  const limit = rateLimit(`forgot-password:${ip}`, 5)
  if (!limit.allowed) {
    return Response.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 }
    )
  }

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { email } = body

  if (!email || typeof email !== 'string') {
    return Response.json({ error: 'Email is required.' }, { status: 400 })
  }

  try {
    const payload = await getPayload({ config })

    // Look up the user by email (never reveal whether the email exists)
    const users = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    })

    // Always return a generic success message to prevent account enumeration
    const genericResponse = {
      message:
        'If an account with that email exists, an OTP has been sent to that address.',
    }

    if (users.docs.length === 0) {
      return Response.json(genericResponse)
    }

    const user = users.docs[0] as any

    // Check if user is active
    if (user.status !== 'active') {
      return Response.json(genericResponse)
    }

    // Rate-limit OTP resends per user (1 per 60 seconds)
    const now = Date.now()
    const lastSent = user.otpLastSentAt ? new Date(user.otpLastSentAt).getTime() : 0
    const cooldownSeconds = 60
    if (lastSent && now - lastSent < cooldownSeconds * 1000) {
      return Response.json(
        { error: 'An OTP was recently sent. Please wait before requesting another.' },
        { status: 429 }
      )
    }

    // Generate OTP and hash it
    const otp = generateOTP()
    const otpHash = hashOTP(otp, email)
    const otpExpiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    // Store hashed OTP, expiry, reset attempts
    await (payload as any).update({
      collection: 'users',
      id: user.id,
      data: {
        otpHash,
        otpExpiresAt,
        otpAttempts: 0,
        otpLastSentAt: new Date(),
      },
    })

    // Send email
    const emailResult = await sendOTPEmail({
      to: email,
      otp,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    })

    if (!emailResult.success) {
      // OTP is stored but email failed — still return generic response
      // The OTP will expire and can be re-requested
      return Response.json(genericResponse)
    }

    return Response.json(genericResponse)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    // Never reveal internal errors that could help enumeration
    return Response.json(
      {
        message:
          'If an account with that email exists, an OTP has been sent to that address.',
      },
      { status: 200 }
    )
  }
}