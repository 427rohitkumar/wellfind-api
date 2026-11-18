import type { Payload } from 'payload'
import { getPayload } from 'payload'
import config from '@/payload.config'

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
  })
}

/**
 * POST /api/auth/logout
 * Invalidates the current session. Payload's auth.logout clears the token cookie
 * and invalidates the session server-side where supported.
 *
 * Note: Payload uses stateless JWTs by default. Calling logout tells the client
 * to discard the token; server-side revocation is not implemented unless
 * Payload's session tracking is enabled. Clients should delete the token.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    await (payload as any).auth({
      req: request as unknown as { headers: Headers },
      action: 'logout',
    })

    return Response.json({ message: 'Logged out successfully.' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}