import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { isSuperAdminRole } from '@/lib/auth'

/**
 * POST /api/auth/admin/users/:id/reset-password
 * Admin-only password reset for a user (no OTP required).
 * Generates a secure temporary password and returns it once.
 * super_admin-only.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const result: any = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = result

    const u = user as any
    if (!isSuperAdminRole(u)) {
      return Response.json({ error: 'Super admin access required.' }, { status: 403 })
    }

    const resolvedParams = await params
    const targetUserId = Number(resolvedParams.id)

    const target = await payload.findByID({
      collection: 'users',
      id: targetUserId,
    })

    if (!target) {
      return Response.json({ error: 'User not found.' }, { status: 404 })
    }

    const targetUser = target as any

    // Only super_admin can reset super_admin passwords
    if (targetUser.role === 'super_admin' && u.role !== 'super_admin') {
      return Response.json(
        { error: 'Cannot reset super_admin passwords.' },
        { status: 403 }
      )
    }

    // Generate a secure temporary password
    const crypto = await import('crypto')
    const tempPassword = crypto.randomBytes(16).toString('base64url').slice(0, 16)

    await payload.update({
      collection: 'users',
      id: targetUserId,
      data: {
        password: tempPassword,
      },
    })

    return Response.json({
      message: 'Password has been reset. A temporary password has been generated.',
      temporaryPassword: tempPassword,
      note: 'Share this password securely with the user. They should change it after first login.',
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}