import { apiSuccess, handleRouteError, requireActiveUser } from '@/lib/api'

/** PATCH /api/notifications/read-all: mark every unread notification of the signed-in user as read. */
export async function PATCH(request: Request): Promise<Response> {
  try {
    const auth = await requireActiveUser(request)
    if (!auth.ok) return auth.response
    const res = await (auth.payload as any).update({
      collection: 'notifications',
      where: { and: [{ user: { equals: auth.user.id } }, { readAt: { exists: false } }] },
      data: { readAt: new Date().toISOString() },
      overrideAccess: true,
    })
    return apiSuccess({ updated: (res.docs as unknown[]).length }, 'All notifications marked as read.')
  } catch (err: unknown) {
    return handleRouteError(err, 'Failed to update notifications.')
  }
}
