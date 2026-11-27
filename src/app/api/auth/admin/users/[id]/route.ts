import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { extractRoles, isSuperAdminRole, SUPPORTED_ROLES } from '@/lib/auth'

/**
 * PATCH /api/auth/admin/users/:id
 * Update user details/status. super_admin-only.
 * Only super_admin can modify any user's role or status.
 * Protected fields (role, status, OTP fields, reset auth fields) cannot be changed by the user themselves.
 */
export async function PATCH(
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

    // Fetch the target user
    const target = await payload.findByID({
      collection: 'users',
      id: targetUserId,
    })

    if (!target) {
      return Response.json({ error: 'User not found.' }, { status: 404 })
    }

    const targetUser = target as any

    // Prevent modifying super_admin accounts unless the requester is super_admin
    // (already enforced above — only super_admin reaches here)

    // Prevent deleting/demoting the last active super_admin is handled in delete/block/suspend routes
    // For PATCH, prevent changing the last active super_admin's role or status away from active/super_admin

    let body: { email?: string; role?: string; roles?: string[]; status?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { email, role, roles, status } = body

    const validRoles: readonly string[] = SUPPORTED_ROLES
    const validStatuses = ['active', 'blocked', 'suspended']

    const updateData: Record<string, unknown> = {}

    if (roles !== undefined && Array.isArray(roles)) {
      updateData.roles = roles.filter((r) => validRoles.includes(r as any))
    }

    if (email !== undefined) {
      if (typeof email !== 'string') {
        return Response.json({ error: 'Email must be a string.' }, { status: 400 })
      }
      // Check email uniqueness
      const existing = await payload.find({
        collection: 'users',
        where: { email: { equals: email } },
        limit: 1,
      })
      if (existing.docs.length > 0 && existing.docs[0].id !== targetUserId) {
        return Response.json(
          { error: 'A user with this email already exists.' },
          { status: 409 }
        )
      }
      updateData.email = email
    }

    if (role !== undefined) {
      if (!validRoles.includes(role)) {
        return Response.json({ error: 'Invalid role.' }, { status: 400 })
      }
      // Prevent demoting the last active super_admin
      if (
        targetUser.role === 'super_admin' &&
        role !== 'super_admin'
      ) {
        const superAdmins = await payload.find({
          collection: 'users',
          where: {
            role: { equals: 'super_admin' },
            status: { equals: 'active' },
          },
        })
        if (superAdmins.docs.length <= 1) {
          return Response.json(
            { error: 'Cannot demote the last active super_admin.' },
            { status: 403 }
          )
        }
      }
      updateData.role = role
    }

    if (status !== undefined) {
      if (!validStatuses.includes(status)) {
        return Response.json({ error: 'Invalid status.' }, { status: 400 })
      }
      // Prevent deactivating the last active super_admin
      if (
        targetUser.role === 'super_admin' &&
        targetUser.status === 'active' &&
        status !== 'active'
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
            { error: 'Cannot deactivate the last active super_admin.' },
            { status: 403 }
          )
        }
      }
      updateData.status = status
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update.' }, { status: 400 })
    }

    const updated = await payload.update({
      collection: 'users',
      id: targetUserId,
      data: updateData,
    })

    const updatedUser = updated as any

    return Response.json({
      message: 'User updated successfully.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        roles: extractRoles(updatedUser.roles, updatedUser.role),
        status: updatedUser.status,
        updatedAt: updatedUser.updatedAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}