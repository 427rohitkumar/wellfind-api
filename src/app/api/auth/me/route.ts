import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { permissionsFor } from '@/lib/permissions'

/**
 * GET /api/auth/me
 * Returns the authenticated user's account details.
 * Requires a valid Bearer token in the Authorization header.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const result: any = await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      headers: request.headers,
    })
    const { user } = result

    if (!user) {
      return Response.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const u = user as any

    return Response.json({
      user: {
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        avatar: u.avatar ?? null,
        name: u.fullName ?? null,
        phone: u.phone ?? null,
        permissions: permissionsFor(u),
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}