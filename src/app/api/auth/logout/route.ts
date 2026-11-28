import { createLocalReq, getPayload, logoutOperation } from 'payload'
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
 * Ends the caller's session (Payload auth sessions), so this token is rejected from now on.
 * Other sessions of the same user stay signed in.
 *
 * Without a valid token there is nothing to end and the answer is still 200.
 * Blocked and suspended accounts may log out too.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const payload = await getPayload({ config })

    const { user } = await payload.auth({ headers: request.headers })
    if (user) {
      await logoutOperation({
        collection: payload.collections[user.collection],
        req: await createLocalReq({ user }, payload),
      })
    }

    return Response.json({ message: 'Logged out successfully.' })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ error: message }, { status: 500 })
  }
}