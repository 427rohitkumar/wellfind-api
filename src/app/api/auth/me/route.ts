import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

import { isAdminRole } from '@/lib/auth'

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
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}