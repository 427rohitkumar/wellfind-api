import { apiError, apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'
import { parseIdParam } from '@/lib/notificationApi'

interface RouteContext {
  params: Promise<{ id: string }>
}

/** DELETE /api/notifications/:id: remove one of the signed-in user's own notifications. */
export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const parsed = parseIdParam((await context.params).id)
    if (!parsed.ok) return parsed.response
    const res = await (auth.payload as any).delete({
      collection: 'notifications',
      where: { and: [{ id: { equals: parsed.id } }, { user: { equals: auth.user.id } }] },
      overrideAccess: true,
    })
    if ((res.docs as unknown[]).length === 0) return apiError('Notification not found.', 404)
    return apiSuccess({ deleted: true }, 'Notification deleted.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to delete the notification.')
  }
}
