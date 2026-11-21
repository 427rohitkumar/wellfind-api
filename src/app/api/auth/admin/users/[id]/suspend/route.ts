import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { isSuperAdminRole } from '@/lib/auth'

/**
 * POST /api/auth/admin/users/:id/suspend
 * Suspend a user account (status = 'suspended'). super_admin-only.
 * Suspended accounts cannot authenticate.
 * Prevents suspending the last active super_admin.
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

    // Prevent suspending the last active super_admin
    if (
      targetUser.role === 'super_admin' &&
      targetUser.status === 'active'
    ) {
      const activeSuperAdmins = await payload.find({
        collection: 'users',
        where: {
          role: { equals: 'super_admin' },
          status: { equals: 'active' },
        },
      })
      if (activeSuperAdmins.docs.length <= 1) {
        return Response.json(
          { error: 'Cannot suspend the last active super_admin.' },
          { status: 403 }
        )
      }
    }

    // Prevent suspending an already blocked or suspended user
    if (targetUser.status === 'suspended') {
      return Response.json(
        { error: 'User is already suspended.' },
        { status: 400 }
      )
    }

    const updated = await payload.update({
      collection: 'users',
      id: targetUserId,
      data: { status: 'suspended' },
    })

    const updatedUser = updated as any

    return Response.json({
      message: 'User has been suspended.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status,
        updatedAt: updatedUser.updatedAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}