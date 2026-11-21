import { apiError, apiSuccess, handleRouteError, parseJsonObject, requireActiveUser } from '@/lib/api'

/** POST /api/push/unsubscribe { endpoint }: stop notifications for this browser. */
export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const body = await parseJsonObject(request)
    if (!body.ok) return body.response
    const endpoint = body.data.endpoint
    if (typeof endpoint !== 'string' || !endpoint) return apiError('endpoint is required.', 400)
    await (auth.payload as any).delete({ collection: 'push-subscriptions', where: { and: [{ endpoint: { equals: endpoint } }, { user: { equals: auth.user.id } }] }, overrideAccess: true })
    return apiSuccess({ subscribed: false }, 'Notifications are off for this browser.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to remove the subscription.')
  }
}
