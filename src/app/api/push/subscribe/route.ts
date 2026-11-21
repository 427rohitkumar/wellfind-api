import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireActiveUser } from '@/lib/api'
import { isPushConfigured } from '@/services/pushService'

/** POST /api/push/subscribe { subscription: { endpoint, keys: { p256dh, auth } } }: remember this browser for the signed-in user. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    if (!isPushConfigured()) return apiError('Push notifications are not set up on the server.', 503)
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const sub = body.data.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined
    const endpoint = sub?.endpoint
    const p256dh = sub?.keys?.p256dh
    const authKey = sub?.keys?.auth
    if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof p256dh !== 'string' || typeof authKey !== 'string') {
      return apiError('Invalid subscription.', 400, [{ field: 'subscription', message: 'endpoint and keys are required.' }])
    }
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 300)
    const existing = await (auth.payload as any).find({ collection: 'push-subscriptions', where: { endpoint: { equals: endpoint } }, limit: 1, depth: 0, overrideAccess: true })
    const data = { user: auth.user.id, endpoint, p256dh, auth: authKey, userAgent }
    if (existing.docs[0]) await (auth.payload as any).update({ collection: 'push-subscriptions', id: existing.docs[0].id, data, overrideAccess: true })
    else await (auth.payload as any).create({ collection: 'push-subscriptions', data, overrideAccess: true })
    return apiSuccess({ subscribed: true }, 'Notifications are on for this browser.', 201)
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to save the subscription.')
  }
}
