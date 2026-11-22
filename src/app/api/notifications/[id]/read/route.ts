import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { parseIdParam, serializeNotification } from '@/lib/notificationApi'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** PATCH /api/notifications/:id/read: mark one of the signed-in user's notifications as read. */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const parsed = parseIdParam((await context.params).id)
    if (!parsed.ok) return parsed.response
    const res = await (auth.payload as any).update({
      collection: 'notifications',
      where: { and: [{ id: { equals: parsed.id } }, { user: { equals: auth.user.id } }] },
      data: { readAt: new Date().toISOString() },
      overrideAccess: true,
    })
    const doc = res.docs[0] as Record<string, any> | undefined
    if (!doc) return apiError('Notification not found.', 404)
    return apiSuccess({ notification: serializeNotification(doc) }, 'Notification marked as read.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update the notification.')
  }
}
