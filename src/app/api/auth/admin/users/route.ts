import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { getClientIP, isSuperAdminRole, rateLimit, SUPPORTED_ROLES } from '@/lib/auth'

/**
 * GET /api/auth/admin/users
 * List users. super_admin-only.
 * Supports optional query params: limit, page, role, status, search.
 */
export async function GET(request: Request): Promise<Response> {
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

    const url = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)
    const role = url.searchParams.get('role')
    const status = url.searchParams.get('status')
    const search = url.searchParams.get('search')

    const where: any = {}
    if (role) where.role = { equals: role }
    if (status) where.status = { equals: status }
    if (search) {
      where.email = { contains: search }
    }

    const usersResult = await payload.find({
      collection: 'users',
      limit,
      page,
      where,
      sort: '-createdAt',
    })

    return Response.json({
      users: usersResult.docs.map((doc: any) => ({
        id: doc.id,
        email: doc.email,
        role: doc.role,
        status: doc.status,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      })),
      totalDocs: usersResult.totalDocs,
      totalPages: usersResult.totalPages,
      page: usersResult.page,
      limit: usersResult.limit,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * POST /api/auth/admin/users
 * Create a new user account. super_admin-only.
 * Does not allow public registration.
 * Supported roles: super_admin, teacher.
 */
export async function POST(request: Request): Promise<Response> {
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

    let body: { email?: string; password?: string; role?: string; status?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { email, password, role, status } = body

    if (!email || typeof email !== 'string') {
      return Response.json({ error: 'Email is required.' }, { status: 400 })
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existing = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    })

    if (existing.docs.length > 0) {
      return Response.json({ error: 'A user with this email already exists.' }, { status: 409 })
    }

    // Validate role — only super_admin and teacher supported
    const validRoles = SUPPORTED_ROLES
    const userRole = role && validRoles.includes(role as any) ? (role as typeof validRoles[number]) : 'teacher'

    // Validate status — active, blocked, suspended
    const validStatuses = ['active', 'blocked', 'suspended'] as const
    const userStatus = status && validStatuses.includes(status as any) ? (status as typeof validStatuses[number]) : 'active'

    // Create user — Payload hashes the password automatically
    const newUser = await (payload as any).create({
      collection: 'users',
      data: {
        email,
        password,
        role: userRole,
        status: userStatus,
      },
    })

    return Response.json({
      message: 'User created successfully.',
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
      },
    }, { status: 201 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}