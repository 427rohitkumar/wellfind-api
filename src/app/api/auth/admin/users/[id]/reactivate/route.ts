import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { isSuperAdminRole } from '@/lib/auth'

/**
 * POST /api/auth/admin/users/:id/reactivate
 * Reactivate a suspended or blocked user account (status = 'active'). super_admin-only.
 * Only applicable to suspended or blocked accounts.
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

    // Prevent reactivating a user that is already active
    if (targetUser.status === 'active') {
      return Response.json(
        { error: 'User is already active.' },
        { status: 400 }
      )
    }

    const updated = await payload.update({
      collection: 'users',
      id: targetUserId,
      data: { status: 'active' },
    })

    const updatedUser = updated as any

    return Response.json({
      message: 'User has been reactivated.',
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